BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sessions
    WHERE (status = 'closed') IS DISTINCT FROM (closed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'SESSION_STATE_PREFLIGHT_FAILED';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS private;
ALTER SCHEMA private OWNER TO postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_closed_at_coherence_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_check CHECK (status IN ('active','paused','closed')),
  ADD CONSTRAINT sessions_closed_at_coherence_check CHECK ((status = 'closed') = (closed_at IS NOT NULL));

CREATE OR REPLACE FUNCTION private.enforce_session_state_transition()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
PARALLEL UNSAFE
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    IF NEW.status <> 'closed' OR NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
      RAISE EXCEPTION 'SESSION_CLOSED_TERMINAL';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'closed' THEN
    IF OLD.status NOT IN ('active','paused') OR NEW.closed_at IS NULL THEN
      RAISE EXCEPTION 'INVALID_SESSION_STATE_TRANSITION';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('active','paused') OR NEW.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_SESSION_STATE_TRANSITION';
  END IF;

  RETURN NEW;
END
$$;
ALTER FUNCTION private.enforce_session_state_transition() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_session_state_transition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sessions_enforce_state_transition ON public.sessions;
CREATE TRIGGER sessions_enforce_state_transition
BEFORE UPDATE OF status, closed_at ON public.sessions
FOR EACH ROW EXECUTE FUNCTION private.enforce_session_state_transition();

CREATE OR REPLACE FUNCTION public.join_session(p_code text, p_display_name text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_session public.sessions%ROWTYPE;
  v_participant public.participants%ROWTYPE;
  v_count integer;
  v_disambiguation smallint;
  v_name text := trim(p_display_name);
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_name IS NULL OR char_length(v_name) < 1 OR char_length(v_name) > 50 THEN RAISE EXCEPTION 'INVALID_DISPLAY_NAME'; END IF;

  SELECT s.* INTO v_session FROM public.sessions AS s
  WHERE s.code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF v_session.status = 'closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;
  IF v_session.status = 'paused' THEN RAISE EXCEPTION 'SESSION_PAUSED'; END IF;

  SELECT p.* INTO v_participant FROM public.participants AS p
  WHERE p.session_id = v_session.id AND p.auth_user_id = v_auth_user_id
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.participants SET last_seen = now() WHERE id = v_participant.id
    RETURNING * INTO v_participant;
    RETURN jsonb_build_object('participant', jsonb_build_object(
      'id',v_participant.id,'session_id',v_participant.session_id,'display_name',v_participant.display_name,
      'disambiguation_index',v_participant.disambiguation_index,'joined_at',v_participant.joined_at,
      'last_seen',v_participant.last_seen,'created_at',v_participant.created_at));
  END IF;

  SELECT count(*) INTO v_count FROM public.participants AS p WHERE p.session_id = v_session.id;
  IF v_count >= v_session.max_participants THEN RAISE EXCEPTION 'SESSION_FULL'; END IF;

  SELECT (coalesce(max(p.disambiguation_index),0)+1)::smallint INTO v_disambiguation
  FROM public.participants AS p WHERE p.session_id=v_session.id AND lower(p.display_name)=lower(v_name);

  INSERT INTO public.participants(session_id,display_name,disambiguation_index,auth_user_id)
  VALUES(v_session.id,v_name,v_disambiguation,v_auth_user_id) RETURNING * INTO v_participant;

  RETURN jsonb_build_object('participant', jsonb_build_object(
    'id',v_participant.id,'session_id',v_participant.session_id,'display_name',v_participant.display_name,
    'disambiguation_index',v_participant.disambiguation_index,'joined_at',v_participant.joined_at,
    'last_seen',v_participant.last_seen,'created_at',v_participant.created_at));
END
$$;

DROP FUNCTION IF EXISTS public.create_queue_entry(uuid, character varying, character varying);
CREATE FUNCTION public.create_queue_entry(p_session_id uuid, p_song_title character varying, p_artist character varying)
RETURNS TABLE(id uuid,session_id uuid,participant_id uuid,song_title character varying,artist character varying,status character varying,"position" integer,created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_session public.sessions%ROWTYPE;
  v_participant_id uuid;
  v_position integer;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT s.* INTO v_session FROM public.sessions AS s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF v_session.status='closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;
  IF v_session.status='paused' THEN RAISE EXCEPTION 'SESSION_PAUSED'; END IF;
  IF trim(p_song_title)='' OR char_length(trim(p_song_title))>100 OR trim(p_artist)='' OR char_length(trim(p_artist))>100 THEN RAISE EXCEPTION 'INVALID_SONG'; END IF;

  SELECT p.id INTO v_participant_id FROM public.participants AS p
  WHERE p.session_id=p_session_id AND p.auth_user_id=v_auth_user_id LIMIT 1;
  IF v_participant_id IS NULL THEN RAISE EXCEPTION 'PARTICIPANT_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF EXISTS(SELECT 1 FROM public.queue AS q WHERE q.session_id=p_session_id AND q.participant_id=v_participant_id AND q.status IN ('pending','preparing','singing')) THEN RAISE EXCEPTION 'ACTIVE_SONG_EXISTS'; END IF;
  SELECT count(*) INTO v_position FROM public.queue AS q WHERE q.session_id=p_session_id;
  IF v_position >= v_session.max_queue_entries THEN RAISE EXCEPTION 'QUEUE_FULL'; END IF;
  SELECT coalesce(max(q.position),0)+1 INTO v_position FROM public.queue AS q WHERE q.session_id=p_session_id;

  RETURN QUERY INSERT INTO public.queue AS q(session_id,participant_id,song_title,artist,status,position)
  VALUES(p_session_id,v_participant_id,trim(p_song_title),trim(p_artist),'pending',v_position)
  RETURNING q.id,q.session_id,q.participant_id,q.song_title,q.artist,q.status,q.position,q.created_at,q.updated_at;
END
$$;

DROP FUNCTION IF EXISTS public.cancel_queue_entry(uuid);
CREATE FUNCTION public.cancel_queue_entry(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_session_id uuid;
  v_session_status text;
  v_queue public.queue%ROWTYPE;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT q.session_id INTO v_session_id FROM public.queue AS q WHERE q.id=p_queue_id;
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'; END IF;
  SELECT s.status INTO v_session_status FROM public.sessions AS s WHERE s.id=v_session_id FOR UPDATE;
  IF v_session_status='closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;
  SELECT q.* INTO v_queue FROM public.queue AS q WHERE q.id=p_queue_id AND q.session_id=v_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.participants AS p WHERE p.id=v_queue.participant_id AND p.auth_user_id=v_auth_user_id)
     AND NOT EXISTS(SELECT 1 FROM public.sessions AS s WHERE s.id=v_session_id AND s.host_id=v_auth_user_id) THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  IF v_queue.status <> 'pending' THEN RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'; END IF;
  UPDATE public.queue SET status='cancelled' WHERE id=p_queue_id;
END
$$;

CREATE OR REPLACE FUNCTION public.update_queue_status(p_queue_id uuid, p_new_status text)
RETURNS TABLE(id uuid,status text,updated_at timestamptz,changed boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_session_id uuid;
  v_session_status text;
  v_queue public.queue%ROWTYPE;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT q.session_id INTO v_session_id FROM public.queue AS q WHERE q.id=p_queue_id;
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'; END IF;
  SELECT s.status INTO v_session_status FROM public.sessions AS s
  WHERE s.id=v_session_id AND s.host_id=v_auth_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF v_session_status='closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;
  SELECT q.* INTO v_queue FROM public.queue AS q WHERE q.id=p_queue_id AND q.session_id=v_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF p_new_status=v_queue.status THEN RETURN QUERY SELECT v_queue.id,v_queue.status::text,v_queue.updated_at,false; RETURN; END IF;
  IF NOT ((v_queue.status='pending' AND p_new_status IN ('preparing','cancelled')) OR
          (v_queue.status='preparing' AND p_new_status IN ('singing','cancelled')) OR
          (v_queue.status='singing' AND p_new_status IN ('completed','cancelled'))) THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION';
  END IF;
  UPDATE public.queue AS q SET status=p_new_status WHERE q.id=p_queue_id RETURNING q.* INTO v_queue;
  RETURN QUERY SELECT v_queue.id,v_queue.status::text,v_queue.updated_at,true;
END
$$;

CREATE OR REPLACE FUNCTION public.update_session_status(p_session_id uuid, p_new_status text)
RETURNS TABLE(id uuid,status text,changed boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_session public.sessions%ROWTYPE;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_new_status NOT IN ('active','paused') THEN RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'; END IF;
  SELECT s.* INTO v_session FROM public.sessions AS s WHERE s.id=p_session_id AND s.host_id=v_auth_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF v_session.status='closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;
  IF v_session.status=p_new_status THEN RETURN QUERY SELECT v_session.id,v_session.status,false; RETURN; END IF;
  UPDATE public.sessions AS s SET status=p_new_status WHERE s.id=p_session_id RETURNING s.* INTO v_session;
  RETURN QUERY SELECT v_session.id,v_session.status,true;
END
$$;

CREATE OR REPLACE FUNCTION public.close_session(p_session_id uuid)
RETURNS TABLE(session_id uuid,status text,closed_at timestamptz,changed boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_session public.sessions%ROWTYPE;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT s.* INTO v_session FROM public.sessions AS s WHERE s.id=p_session_id AND s.host_id=v_auth_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF v_session.status='closed' THEN
    RETURN QUERY SELECT v_session.id,v_session.status,v_session.closed_at,false;
    RETURN;
  END IF;
  UPDATE public.sessions AS s SET status='closed',closed_at=clock_timestamp() WHERE s.id=p_session_id RETURNING s.* INTO v_session;
  RETURN QUERY SELECT v_session.id,v_session.status,v_session.closed_at,true;
END
$$;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.participants FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.queue FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.join_session(text,text) OWNER TO postgres;
ALTER FUNCTION public.create_queue_entry(uuid,character varying,character varying) OWNER TO postgres;
ALTER FUNCTION public.cancel_queue_entry(uuid) OWNER TO postgres;
ALTER FUNCTION public.update_queue_status(uuid,text) OWNER TO postgres;
ALTER FUNCTION public.update_session_status(uuid,text) OWNER TO postgres;
ALTER FUNCTION public.close_session(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.join_session(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_queue_entry(uuid,character varying,character varying) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_queue_entry(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_queue_status(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_session_status(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_session(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_session(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_queue_entry(uuid,character varying,character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_queue_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_queue_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_session(uuid) TO authenticated;

COMMIT;
