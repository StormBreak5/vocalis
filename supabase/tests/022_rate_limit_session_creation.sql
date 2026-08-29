BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

-- Function surface preservado -----------------------------------------------

SELECT ok(to_regprocedure('public.create_session()') IS NOT NULL, 'create_session() ainda existe');
SELECT ok(has_function_privilege('authenticated', 'public.create_session()', 'EXECUTE'), 'authenticated executa');
SELECT ok(NOT has_function_privilege('anon', 'public.create_session()', 'EXECUTE'), 'anon não executa');

-- Fixtures -----------------------------------------------------------------

INSERT INTO auth.users(id, aud, role, email, encrypted_password, is_anonymous) VALUES
('10000000-0000-4000-8000-0000000002a1', 'authenticated', 'authenticated', NULL, 'x', true);

-- 10 salas na última hora para o mesmo host --------------------------------

INSERT INTO public.sessions(code, host_id, status, created_at)
SELECT
  'RL' || repeat(chr(65 + g), 4),
  '10000000-0000-4000-8000-0000000002a1',
  'active',
  now() - interval '10 minutes'
FROM generate_series(1, 10) AS g;

SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-0000000002a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.create_session()$$,
  'P0001',
  'SESSION_RATE_LIMIT',
  '11ª sala em uma hora é rejeitada'
);

RESET ROLE;

-- Salas antigas (>1h) não contam ------------------------------------------

UPDATE public.sessions
SET created_at = now() - interval '2 hours'
WHERE host_id = '10000000-0000-4000-8000-0000000002a1';

SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-0000000002a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.create_session()$$,
  'com as salas anteriores fora da janela de 1h, criar de novo funciona'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
