-- Display pairing: allow a TV/browser that is not the session Host to become
-- an authorized read-only "paired display" for one session, via a Host-issued
-- single-use pairing code. See specs/004-display-pairing/ for the full design.

BEGIN;

-- Part 1: schema + tables + constraints + indexes ---------------------------

CREATE SCHEMA IF NOT EXISTS private;
ALTER SCHEMA private OWNER TO postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE private.display_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions (id) ON DELETE CASCADE,
  code char(6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  consumed_by uuid NULL REFERENCES auth.users (id),
  created_by uuid NOT NULL REFERENCES auth.users (id),
  CONSTRAINT display_pairing_codes_consumed_coherence_check
    CHECK ((consumed_at IS NULL) = (consumed_by IS NULL)),
  CONSTRAINT display_pairing_codes_consumed_after_created_check
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE UNIQUE INDEX display_pairing_codes_active_code_idx
  ON private.display_pairing_codes (code)
  WHERE consumed_at IS NULL;

CREATE INDEX display_pairing_codes_session_id_idx
  ON private.display_pairing_codes (session_id);

REVOKE ALL ON TABLE private.display_pairing_codes FROM PUBLIC, anon, authenticated;

CREATE TABLE public.display_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions (id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users (id),
  paired_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  CONSTRAINT display_pairings_session_identity_key UNIQUE (session_id, auth_user_id)
);

CREATE INDEX display_pairings_session_active_idx
  ON public.display_pairings (session_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.display_pairings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.display_pairings FROM PUBLIC, anon, authenticated;

-- Part 2: RLS helpers + policy changes ---------------------------------------
-- is_paired_display/is_paired_display_open are deliberately NOT folded into
-- is_session_open: that helper also gates the participants policy, and
-- extending it would leak the participants list to paired displays (FR-010).

CREATE FUNCTION private.is_paired_display(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_session_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.display_pairings AS dp
      WHERE dp.session_id = p_session_id AND dp.auth_user_id = auth.uid() AND dp.revoked_at IS NULL
    )
$$;

CREATE FUNCTION private.is_paired_display_open(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
  SELECT private.is_paired_display(p_session_id)
    AND EXISTS (SELECT 1 FROM public.sessions AS s WHERE s.id = p_session_id AND s.status IN ('active','paused'))
$$;

ALTER FUNCTION private.is_paired_display(uuid) OWNER TO postgres;
ALTER FUNCTION private.is_paired_display_open(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_paired_display(uuid), private.is_paired_display_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_paired_display(uuid), private.is_paired_display_open(uuid) TO authenticated;

DROP POLICY IF EXISTS sessions_select_owned_or_member ON public.sessions;
CREATE POLICY sessions_select_owned_member_or_display ON public.sessions
FOR SELECT TO authenticated
USING (private.is_session_host(id) OR private.is_session_member(id) OR private.is_paired_display(id));

DROP POLICY IF EXISTS queue_select_authorized_open_or_host ON public.queue;
CREATE POLICY queue_select_authorized_open_host_or_display ON public.queue
FOR SELECT TO authenticated
USING (private.is_session_host(session_id) OR private.is_session_open(session_id) OR private.is_paired_display_open(session_id));

-- participants policy is intentionally untouched: no DROP, no CREATE, no
-- reference to is_paired_display anywhere near it. See
-- specs/004-display-pairing/data-model.md "Policies alteradas".

CREATE POLICY display_pairings_select_host ON public.display_pairings
FOR SELECT TO authenticated
USING (private.is_session_host(session_id));

-- Table-level (not column-restricted) grant: Postgres requires privilege on
-- every column touched by a `SELECT *`-shaped query — and PostgREST's default
-- select, and Realtime's internal RLS-authorization check for
-- postgres_changes, both do exactly that. A column-list grant here makes
-- every such query fail with "permission denied for table", silently
-- breaking the Realtime subscription despite the RLS policy being correct
-- (mirrors the pattern already used for public.participants/public.queue in
-- migrations 004 and 016 — row visibility is RLS's job, not column grants).
GRANT SELECT ON TABLE public.display_pairings TO authenticated;

-- Part 3: RPCs ----------------------------------------------------------------

CREATE FUNCTION public.generate_display_pairing_code(p_session_id uuid)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_session public.sessions%ROWTYPE;
  v_candidate char(6);
  v_attempts int := 0;
  v_count int;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_alphabet_len int := length(v_alphabet);
  v_expires_at timestamptz;
  i int;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT s.* INTO v_session FROM public.sessions AS s
  WHERE s.id = p_session_id AND s.host_id = v_auth_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF v_session.status = 'closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 5 THEN RAISE EXCEPTION 'CODE_GENERATION_FAILED'; END IF;

    v_candidate := '';
    FOR i IN 1..6 LOOP
      v_candidate := v_candidate || substr(v_alphabet, floor(random() * v_alphabet_len + 1)::int, 1);
    END LOOP;

    SELECT count(*) INTO v_count FROM private.display_pairing_codes AS dpc
    WHERE dpc.code = v_candidate AND dpc.consumed_at IS NULL;
    IF v_count = 0 THEN EXIT; END IF;
  END LOOP;

  v_expires_at := now() + interval '5 minutes';

  INSERT INTO private.display_pairing_codes (session_id, code, expires_at, created_by)
  VALUES (p_session_id, v_candidate, v_expires_at, v_auth_user_id);

  RETURN QUERY SELECT v_candidate::text, v_expires_at;
END
$$;

ALTER FUNCTION public.generate_display_pairing_code(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_display_pairing_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_display_pairing_code(uuid) TO authenticated;

CREATE FUNCTION public.redeem_display_pairing_code(p_room_code text, p_pairing_code text)
RETURNS TABLE(session_id uuid, paired boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_session_id uuid;
  v_status text;
  v_code private.display_pairing_codes%ROWTYPE;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Step 1: resolve the room code. No exception yet, even if not found.
  SELECT s.id, s.status INTO v_session_id, v_status
  FROM public.sessions AS s WHERE s.code = upper(trim(p_room_code));

  -- Step 2: nonexistent room code collapses into the same generic error as an
  -- invalid pairing code, so a caller can't distinguish "room doesn't exist"
  -- from "pairing code is wrong" by probing this RPC.
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'PAIRING_CODE_INVALID'; END IF;

  -- Step 3.
  IF v_status = 'closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  -- Step 4: lock the code row so a concurrent redemption of the same code
  -- serializes behind this transaction.
  SELECT dpc.* INTO v_code FROM private.display_pairing_codes AS dpc
  WHERE dpc.session_id = v_session_id AND dpc.code = upper(trim(p_pairing_code)) AND dpc.consumed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND OR v_code.expires_at <= now() THEN RAISE EXCEPTION 'PAIRING_CODE_INVALID'; END IF;

  -- Step 5.
  UPDATE private.display_pairing_codes SET consumed_at = now(), consumed_by = v_auth_user_id
  WHERE id = v_code.id;

  -- Step 6: idempotent for first pairing and for re-pairing after revocation.
  -- ON CONFLICT names the constraint instead of listing columns: a bare
  -- column-list target here is ambiguous against this function's own
  -- session_id OUT parameter, the same class of error fixed above.
  INSERT INTO public.display_pairings (session_id, auth_user_id)
  VALUES (v_session_id, v_auth_user_id)
  ON CONFLICT ON CONSTRAINT display_pairings_session_identity_key DO UPDATE
    SET revoked_at = NULL, paired_at = now()
    WHERE public.display_pairings.revoked_at IS NOT NULL;

  -- Step 7.
  RETURN QUERY SELECT v_session_id, true;
END
$$;

ALTER FUNCTION public.redeem_display_pairing_code(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_display_pairing_code(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_display_pairing_code(text,text) TO authenticated;

CREATE FUNCTION public.get_display_session_details(p_session_id uuid)
RETURNS TABLE(id uuid, code text, status text, closed_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT (private.is_session_host(p_session_id) OR private.is_paired_display(p_session_id)) THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  RETURN QUERY SELECT s.id, s.code::text, s.status, s.closed_at
  FROM public.sessions AS s WHERE s.id = p_session_id;
END
$$;

ALTER FUNCTION public.get_display_session_details(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_display_session_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_display_session_details(uuid) TO authenticated;

CREATE FUNCTION public.list_paired_displays(p_session_id uuid)
RETURNS TABLE(id uuid, paired_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.is_session_host(p_session_id) THEN RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN'; END IF;
  RETURN QUERY
  SELECT dp.id, dp.paired_at
  FROM public.display_pairings AS dp
  WHERE dp.session_id = p_session_id AND dp.revoked_at IS NULL
  ORDER BY dp.paired_at ASC;
END
$$;

ALTER FUNCTION public.list_paired_displays(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_paired_displays(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_paired_displays(uuid) TO authenticated;

CREATE FUNCTION public.revoke_display_pairing(p_display_pairing_id uuid)
RETURNS TABLE(id uuid, revoked boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_id uuid;
  v_revoked_at timestamptz;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT dp.id, dp.revoked_at INTO v_id, v_revoked_at
  FROM public.display_pairings AS dp
  JOIN public.sessions AS s ON s.id = dp.session_id
  WHERE dp.id = p_display_pairing_id AND s.host_id = v_auth_user_id
  FOR UPDATE OF dp;

  IF NOT FOUND THEN RAISE EXCEPTION 'PAIRING_NOT_FOUND_OR_FORBIDDEN'; END IF;

  IF v_revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;

  UPDATE public.display_pairings AS dp SET revoked_at = now() WHERE dp.id = v_id;
  RETURN QUERY SELECT v_id, true;
END
$$;

ALTER FUNCTION public.revoke_display_pairing(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_display_pairing(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_display_pairing(uuid) TO authenticated;

-- list_active_queue unifies queue reads for Host, session participant, and
-- paired display behind one SECURITY DEFINER function. It replaces a
-- PostgREST-embedded join (`.select('*, participants(display_name)')`) that
-- required the caller to have RLS visibility into BOTH queue and
-- participants simultaneously — true for Host and participant, but never
-- true for a paired display (FR-010 forbids it the participants table on
-- purpose). That JOIN silently returned participants=null for a paired
-- display, and the caller masked it with a `'Cantor'` placeholder fallback
-- instead of surfacing the failure. This function resolves display_name
-- internally, without granting any new access to public.participants: the
-- authorization check below is byte-for-byte the same USING clause as
-- queue_select_authorized_open_host_or_display above, so nothing gains
-- access to a queue row it couldn't already read via RLS, and the
-- participants policy is untouched (see research.md R15).
CREATE FUNCTION public.list_active_queue(p_session_id uuid)
RETURNS TABLE(
  id uuid,
  session_id uuid,
  participant_id uuid,
  song_title varchar(100),
  artist varchar(100),
  status varchar(20),
  "position" integer,
  created_at timestamptz,
  updated_at timestamptz,
  participant_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT (
    private.is_session_host(p_session_id)
    OR private.is_session_open(p_session_id)
    OR private.is_paired_display_open(p_session_id)
  ) THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT q.id, q.session_id, q.participant_id, q.song_title, q.artist, q.status,
    q."position", q.created_at, q.updated_at, p.display_name
  FROM public.queue AS q
  JOIN public.participants AS p ON p.id = q.participant_id
  WHERE q.session_id = p_session_id AND q.status IN ('pending', 'preparing', 'singing')
  ORDER BY q."position" ASC;
END
$$;

ALTER FUNCTION public.list_active_queue(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_active_queue(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_queue(uuid) TO authenticated;

-- Part 4: Realtime + reload -----------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='display_pairings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.display_pairings;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
