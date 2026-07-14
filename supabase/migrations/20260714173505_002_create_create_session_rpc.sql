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
