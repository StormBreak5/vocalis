CREATE TYPE join_session_result AS (
  participant participants,
  recovery_token text
);

CREATE OR REPLACE FUNCTION join_session(p_code text, p_display_name text)
RETURNS join_session_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_normalized_code char(6);
  v_session sessions;
  v_participant_count int;
  v_recovery_token text;
  v_hash text;
  v_disambiguation_index smallint;
  v_participant participants;
  v_result join_session_result;
BEGIN
  v_normalized_code := upper(trim(p_code));

  SELECT * INTO v_session FROM sessions WHERE code = v_normalized_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'SESSION_CLOSED';
  END IF;

  IF v_session.status = 'paused' THEN
    RAISE EXCEPTION 'SESSION_PAUSED';
  END IF;

  SELECT count(*) INTO v_participant_count FROM participants WHERE session_id = v_session.id;
  IF v_participant_count >= v_session.max_participants THEN
    RAISE EXCEPTION 'SESSION_FULL';
  END IF;

  v_recovery_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_recovery_token, 'sha256'), 'hex');

  SELECT COALESCE(MAX(disambiguation_index), 0) + 1 INTO v_disambiguation_index
  FROM participants
  WHERE session_id = v_session.id AND display_name = trim(p_display_name);

  INSERT INTO participants (session_id, display_name, disambiguation_index, recovery_token_hash)
  VALUES (v_session.id, trim(p_display_name), v_disambiguation_index, v_hash)
  RETURNING * INTO v_participant;

  v_result.participant := v_participant;
  v_result.recovery_token := v_recovery_token;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION recover_participant(p_participant_id uuid, p_recovery_token text, p_code text)
RETURNS participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_normalized_code char(6);
  v_session sessions;
  v_participant participants;
  v_hash text;
BEGIN
  v_normalized_code := upper(trim(p_code));

  SELECT * INTO v_session FROM sessions WHERE code = v_normalized_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'SESSION_CLOSED';
  END IF;

  SELECT * INTO v_participant FROM participants WHERE id = p_participant_id AND session_id = v_session.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARTICIPANT_NOT_FOUND';
  END IF;

  v_hash := encode(digest(p_recovery_token, 'sha256'), 'hex');
  IF v_participant.recovery_token_hash != v_hash THEN
    RAISE EXCEPTION 'INVALID_TOKEN';
  END IF;

  UPDATE participants SET last_seen = now() WHERE id = p_participant_id
  RETURNING * INTO v_participant;

  RETURN v_participant;
END;
$$;
