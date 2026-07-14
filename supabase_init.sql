CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code char(6) NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  max_participants smallint NOT NULL DEFAULT 50,
  max_queue_entries smallint NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

CREATE INDEX sessions_host_id_idx ON sessions (host_id);
CREATE INDEX sessions_status_idx ON sessions (status) WHERE status != 'closed';

CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  disambiguation_index smallint NOT NULL DEFAULT 1,
  recovery_token_hash text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX participants_session_name_idx ON participants (session_id, display_name, disambiguation_index);
CREATE INDEX participants_id_idx ON participants (id);
CREATE INDEX participants_session_id_idx ON participants (session_id);
CREATE OR REPLACE FUNCTION create_session(p_host_id uuid)
RETURNS sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_candidate char(6);
  v_attempts int := 0;
  v_count int;
  v_alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
  v_alphabet_len int := length(v_alphabet);
  v_session sessions;
  i int;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 5 THEN
      RAISE EXCEPTION 'CODE_GENERATION_FAILED';
    END IF;

    -- Generate a 6-char code
    v_candidate := '';
    FOR i IN 1..6 LOOP
      v_candidate := v_candidate || substr(v_alphabet, floor(random() * v_alphabet_len + 1)::int, 1);
    END LOOP;

    SELECT count(*) INTO v_count FROM sessions WHERE code = v_candidate;
    IF v_count = 0 THEN
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO sessions (host_id, code, status)
  VALUES (p_host_id, v_candidate, 'active')
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;
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
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_select_public ON sessions
  FOR SELECT TO anon, authenticated USING (status != 'closed');

-- sessions_insert_blocked: implicit since no insert policy
-- sessions_delete_blocked: implicit since no delete policy

CREATE POLICY sessions_update_own ON sessions
  FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());


ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY participants_select_session ON participants
  FOR SELECT TO anon, authenticated USING (
    session_id IN (
      SELECT id FROM sessions WHERE status != 'closed'
    )
  );

-- participants_insert_blocked: implicit
-- participants_update_blocked: implicit
-- participants_delete_blocked: implicit
