BEGIN;

CREATE OR REPLACE FUNCTION private.is_session_host(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_session_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.sessions AS s WHERE s.id=p_session_id AND s.host_id=auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.is_session_member(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_session_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.participants AS p WHERE p.session_id=p_session_id AND p.auth_user_id=auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.is_session_open(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_session_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.sessions AS s WHERE s.id=p_session_id AND s.status IN ('active','paused'))
    AND (private.is_session_host(p_session_id) OR private.is_session_member(p_session_id))
$$;

ALTER FUNCTION private.is_session_host(uuid) OWNER TO postgres;
ALTER FUNCTION private.is_session_member(uuid) OWNER TO postgres;
ALTER FUNCTION private.is_session_open(uuid) OWNER TO postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.is_session_host(uuid), private.is_session_member(uuid), private.is_session_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_session_host(uuid), private.is_session_member(uuid), private.is_session_open(uuid) TO authenticated;

DROP POLICY IF EXISTS sessions_select_public ON public.sessions;
DROP POLICY IF EXISTS sessions_update_own ON public.sessions;
DROP POLICY IF EXISTS participants_select_session ON public.participants;
DROP POLICY IF EXISTS "Users can read active queue of their session" ON public.queue;
DROP POLICY IF EXISTS "Host can update queue" ON public.queue;
DROP POLICY IF EXISTS sessions_select_owned_or_member ON public.sessions;
DROP POLICY IF EXISTS participants_select_authorized_open_or_host ON public.participants;
DROP POLICY IF EXISTS queue_select_authorized_open_or_host ON public.queue;

REVOKE SELECT ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.participants, public.queue FROM PUBLIC, anon, authenticated;

CREATE POLICY sessions_select_owned_or_member ON public.sessions
FOR SELECT TO authenticated
USING (private.is_session_host(id) OR private.is_session_member(id));

CREATE POLICY participants_select_authorized_open_or_host ON public.participants
FOR SELECT TO authenticated
USING (private.is_session_host(session_id) OR private.is_session_open(session_id));

CREATE POLICY queue_select_authorized_open_or_host ON public.queue
FOR SELECT TO authenticated
USING (private.is_session_host(session_id) OR private.is_session_open(session_id));

GRANT SELECT (id, code, status, closed_at) ON TABLE public.sessions TO authenticated;
GRANT SELECT ON TABLE public.participants, public.queue TO authenticated;

CREATE OR REPLACE FUNCTION public.get_host_session_details(p_session_id uuid)
RETURNS TABLE(id uuid,code text,status text,closed_at timestamptz,created_at timestamptz,max_participants smallint,max_queue_entries smallint)
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
  IF NOT EXISTS(SELECT 1 FROM public.sessions AS s WHERE s.id=p_session_id AND s.host_id=v_auth_user_id) THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  RETURN QUERY SELECT s.id,s.code::text,s.status,s.closed_at,s.created_at,s.max_participants,s.max_queue_entries
  FROM public.sessions AS s WHERE s.id=p_session_id AND s.host_id=v_auth_user_id;
END
$$;
ALTER FUNCTION public.get_host_session_details(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_host_session_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_host_session_details(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
