-- Keep newly generated room codes aligned with the UI validator.
-- I and O are excluded to avoid confusion with 1 and 0.
CREATE OR REPLACE FUNCTION public.create_session(p_host_id uuid)
RETURNS public.sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_candidate char(6);
  v_attempts int := 0;
  v_count int;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_alphabet_len int := length(v_alphabet);
  v_session public.sessions;
  i int;
BEGIN
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
  VALUES (p_host_id, v_candidate, 'active')
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;