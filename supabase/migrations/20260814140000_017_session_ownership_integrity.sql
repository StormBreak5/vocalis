-- Security fix: session ownership integrity.
--
-- 1. create_session(uuid) let the caller assert an arbitrary host_id.
--    Because no REVOKE was ever issued, Postgres' default EXECUTE grant to
--    PUBLIC also let anon/authenticated call it directly with any known
--    UUID. Replace it with an argument-less create_session() that derives
--    the owner from auth.uid() inside the function, and lock EXECUTE down
--    to authenticated only.
-- 2. recover_participant still references participants.recovery_token_hash,
--    a column dropped in 20260714220000_005_participants_auth_user_id.sql.
--    It has no production caller (superseded by join_session's auth.uid()
--    based recovery in 20260714220700_012_update_join_session_rpc.sql) and
--    is a broken, still-executable surface. Remove it.
-- 3. queue.participant_id and queue.session_id were only constrained by
--    independent single-column foreign keys, so nothing in the database
--    stopped a row from pairing a participant with a session other than
--    the participant's own. Replace the plain queue.participant_id foreign
--    key with a composite one against participants(id, session_id) so the
--    database enforces that a queue row's participant always belongs to
--    that same session. The composite key is a strict superset of the
--    single-column check it replaces (participants.id is already unique on
--    its own via its primary key), so this does not weaken referential
--    integrity; it also keeps a single foreign-key path from queue to
--    participants, which PostgREST's implicit embedding (e.g.
--    `.select('*, participants(display_name)')` in
--    list-active-queue.action.ts) requires to stay unambiguous.

BEGIN;

-- Preflight: fail loudly instead of silently fixing or truncating data if
-- any existing queue row already pairs a participant with a foreign session.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.queue AS q
    JOIN public.participants AS p ON p.id = q.participant_id
    WHERE p.session_id IS DISTINCT FROM q.session_id
  ) THEN
    RAISE EXCEPTION 'QUEUE_PARTICIPANT_SESSION_MISMATCH: existing queue rows reference a participant from a different session; resolve manually before re-running this migration';
  END IF;
END
$$;

-- 1. create_session ownership fix ------------------------------------------

DROP FUNCTION IF EXISTS public.create_session(uuid);

CREATE FUNCTION public.create_session()
RETURNS public.sessions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_candidate char(6);
  v_attempts int := 0;
  v_count int;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_alphabet_len int := length(v_alphabet);
  v_session public.sessions;
  i int;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 5 THEN
      RAISE EXCEPTION 'CODE_GENERATION_FAILED';
    END IF;

    v_candidate := '';
    FOR i IN 1..6 LOOP
      v_candidate := v_candidate || substr(v_alphabet, floor(random() * v_alphabet_len + 1)::int, 1);
    END LOOP;

    SELECT count(*) INTO v_count FROM public.sessions WHERE code = v_candidate;
    IF v_count = 0 THEN
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.sessions (host_id, code, status)
  VALUES (v_auth_user_id, v_candidate, 'active')
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

ALTER FUNCTION public.create_session() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_session() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_session() TO authenticated;

-- 2. Remove the obsolete, broken recover_participant RPC --------------------

DROP FUNCTION IF EXISTS public.recover_participant(uuid, text, text);

-- 3. Composite referential integrity between queue, participants, sessions --

ALTER TABLE public.participants
  ADD CONSTRAINT participants_id_session_id_key UNIQUE (id, session_id);

ALTER TABLE public.queue
  DROP CONSTRAINT queue_participant_id_fkey,
  ADD CONSTRAINT queue_participant_session_fk
  FOREIGN KEY (participant_id, session_id)
  REFERENCES public.participants (id, session_id)
  ON DELETE CASCADE;

COMMIT;
