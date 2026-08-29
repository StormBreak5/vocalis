-- Rate limit na criação de salas.
--
-- create_session() não tinha nenhum freio: uma identidade anônima podia criar
-- salas em loop. O rate limit de anonymous sign-in do Supabase é por IP e não
-- cobre isto (a mesma identidade reusa o token). Adiciona um teto por
-- auth.uid(): no máximo 10 salas por hora. Combinado com o limite de sign-in
-- por IP do Supabase, fecha o abuso trivial.
--
-- Reescreve o corpo atual de create_session() (migration 017) sem outras
-- mudanças. ACL e ownership permanecem idênticos.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_session()
RETURNS public.sessions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_recent_count int;
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

  SELECT count(*) INTO v_recent_count
  FROM public.sessions
  WHERE host_id = v_auth_user_id
    AND created_at > now() - interval '1 hour';

  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'SESSION_RATE_LIMIT';
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

COMMIT;
