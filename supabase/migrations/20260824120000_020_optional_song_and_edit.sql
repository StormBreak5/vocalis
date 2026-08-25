-- Optional song info + participant-editable queue entries.
--
-- Nem todo cantor sabe o que vai cantar no momento de entrar na fila.
-- song_title/artist deixam de ser obrigatórios em create_queue_entry — um
-- valor ausente ou em branco é normalizado para NULL, nunca para string
-- vazia, para que os componentes de apresentação (participante, Host, telão)
-- tenham um único jeito de detectar "ainda não escolhido" (IS NULL) em vez de
-- terem que tratar '' como um segundo caso.
--
-- update_queue_song é a nova RPC de escrita que permite ao próprio
-- participante (ou ao Host, mesma autorização de cancel_queue_entry) definir
-- ou corrigir título/artista enquanto a música ainda não começou a tocar —
-- status 'pending' ou 'preparing', igual à janela de cancel_queue_entry.
-- Depois de 'singing' a edição é bloqueada (INVALID_STATUS_TRANSITION): o
-- Host e o telão já podem estar exibindo o valor antigo no palco.

BEGIN;

ALTER TABLE public.queue
  ALTER COLUMN song_title DROP NOT NULL,
  ALTER COLUMN artist DROP NOT NULL;

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
  v_song_title character varying;
  v_artist character varying;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT s.* INTO v_session FROM public.sessions AS s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF v_session.status='closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;
  IF v_session.status='paused' THEN RAISE EXCEPTION 'SESSION_PAUSED'; END IF;

  -- Ambos os campos são opcionais e independentes: dá pra saber a música sem
  -- saber o artista, ou entrar na fila sem nenhum dos dois. Em branco vira
  -- NULL; só o comprimento acima de 100 é invalido.
  v_song_title := nullif(trim(p_song_title), '');
  v_artist := nullif(trim(p_artist), '');
  IF (v_song_title IS NOT NULL AND char_length(v_song_title) > 100)
     OR (v_artist IS NOT NULL AND char_length(v_artist) > 100) THEN
    RAISE EXCEPTION 'INVALID_SONG';
  END IF;

  SELECT p.id INTO v_participant_id FROM public.participants AS p
  WHERE p.session_id=p_session_id AND p.auth_user_id=v_auth_user_id LIMIT 1;
  IF v_participant_id IS NULL THEN RAISE EXCEPTION 'PARTICIPANT_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF EXISTS(SELECT 1 FROM public.queue AS q WHERE q.session_id=p_session_id AND q.participant_id=v_participant_id AND q.status IN ('pending','preparing','singing')) THEN RAISE EXCEPTION 'ACTIVE_SONG_EXISTS'; END IF;
  SELECT count(*) INTO v_position FROM public.queue AS q WHERE q.session_id=p_session_id;
  IF v_position >= v_session.max_queue_entries THEN RAISE EXCEPTION 'QUEUE_FULL'; END IF;
  SELECT coalesce(max(q.position),0)+1 INTO v_position FROM public.queue AS q WHERE q.session_id=p_session_id;

  RETURN QUERY INSERT INTO public.queue AS q(session_id,participant_id,song_title,artist,status,position)
  VALUES(p_session_id,v_participant_id,v_song_title,v_artist,'pending',v_position)
  RETURNING q.id,q.session_id,q.participant_id,q.song_title,q.artist,q.status,q.position,q.created_at,q.updated_at;
END
$$;

ALTER FUNCTION public.create_queue_entry(uuid,character varying,character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_queue_entry(uuid,character varying,character varying) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_queue_entry(uuid,character varying,character varying) TO authenticated;

CREATE FUNCTION public.update_queue_song(p_queue_id uuid, p_song_title character varying, p_artist character varying)
RETURNS TABLE(id uuid,session_id uuid,participant_id uuid,song_title character varying,artist character varying,status character varying,"position" integer,created_at timestamptz,updated_at timestamptz)
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
  v_song_title character varying;
  v_artist character varying;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  v_song_title := nullif(trim(p_song_title), '');
  v_artist := nullif(trim(p_artist), '');
  IF (v_song_title IS NOT NULL AND char_length(v_song_title) > 100)
     OR (v_artist IS NOT NULL AND char_length(v_artist) > 100) THEN
    RAISE EXCEPTION 'INVALID_SONG';
  END IF;

  SELECT q.session_id INTO v_session_id FROM public.queue AS q WHERE q.id=p_queue_id;
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'; END IF;
  SELECT s.status INTO v_session_status FROM public.sessions AS s WHERE s.id=v_session_id FOR UPDATE;
  IF v_session_status='closed' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  SELECT q.* INTO v_queue FROM public.queue AS q WHERE q.id=p_queue_id AND q.session_id=v_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'; END IF;

  -- Mesma regra de autorização de cancel_queue_entry: o participante dono da
  -- música, ou o Host da sessão.
  IF NOT EXISTS(SELECT 1 FROM public.participants AS p WHERE p.id=v_queue.participant_id AND p.auth_user_id=v_auth_user_id)
     AND NOT EXISTS(SELECT 1 FROM public.sessions AS s WHERE s.id=v_session_id AND s.host_id=v_auth_user_id) THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF v_queue.status NOT IN ('pending','preparing') THEN RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'; END IF;

  UPDATE public.queue AS q SET song_title=v_song_title, artist=v_artist WHERE q.id=p_queue_id
  RETURNING q.* INTO v_queue;

  RETURN QUERY SELECT v_queue.id,v_queue.session_id,v_queue.participant_id,v_queue.song_title,v_queue.artist,v_queue.status,v_queue.position,v_queue.created_at,v_queue.updated_at;
END
$$;

ALTER FUNCTION public.update_queue_song(uuid,character varying,character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_queue_song(uuid,character varying,character varying) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_queue_song(uuid,character varying,character varying) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
