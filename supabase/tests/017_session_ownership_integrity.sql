BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);

-- Function surface -----------------------------------------------------

SELECT ok(to_regprocedure('public.create_session()') IS NOT NULL,'create_session() existe');
SELECT ok(to_regprocedure('public.create_session(uuid)') IS NULL,'assinatura antiga create_session(uuid) removida');
SELECT ok(to_regprocedure('public.recover_participant(uuid,text,text)') IS NULL,'recover_participant removida');

SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.create_session()'::regprocedure),'postgres','owner postgres');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid='public.create_session()'::regprocedure),'SECURITY DEFINER');
SELECT is((SELECT proconfig[1] FROM pg_proc WHERE oid='public.create_session()'::regprocedure),'search_path=""','search_path vazio');
SELECT ok((SELECT proacl IS NOT NULL FROM pg_proc WHERE oid='public.create_session()'::regprocedure),'ACL explícita, não default');
SELECT ok(has_function_privilege('authenticated','public.create_session()','EXECUTE'),'authenticated executa');
SELECT ok(NOT has_function_privilege('anon','public.create_session()','EXECUTE'),'anon não executa');
SELECT ok(NOT has_function_privilege('public','public.create_session()','EXECUTE'),'PUBLIC não executa');

-- Fixtures ---------------------------------------------------------------

INSERT INTO auth.users(id,aud,role,email,encrypted_password,is_anonymous) VALUES
('10000000-0000-4000-8000-000000000091','authenticated','authenticated','own-host@test.local','x',false),
('10000000-0000-4000-8000-000000000092','authenticated','authenticated',NULL,'x',true),
('10000000-0000-4000-8000-000000000093','authenticated','authenticated','own-external@test.local','x',false);

-- Ownership is derived from auth.uid(), never from client input ----------

SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000091","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE own_session AS SELECT * FROM public.create_session();
SELECT is((SELECT host_id::text FROM own_session),'10000000-0000-4000-8000-000000000091','sessão pertence a auth.uid() do chamador');
RESET ROLE;

-- Anonymous-authenticated Supabase users can still create a room ---------

SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000092","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE anon_session AS SELECT * FROM public.create_session();
SELECT is((SELECT host_id::text FROM anon_session),'10000000-0000-4000-8000-000000000092','usuário anônimo autenticado cria sala normalmente');
RESET ROLE;

-- No authenticated identity: rejected by the function itself -------------

SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.create_session()$$,'P0001','AUTH_REQUIRED','sem auth.uid() é rejeitado');
RESET ROLE;

-- anon role is rejected at the grant level, before the function runs -----

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.create_session()$$,'42501',NULL,'anon bloqueado por ACL, não alcança a função');
RESET ROLE;

-- Composite referential integrity: queue.participant_id must belong ------
-- to queue.session_id ------------------------------------------------------

INSERT INTO public.sessions(id,code,host_id,status) VALUES
('20000000-0000-4000-8000-000000000091','OWN091','10000000-0000-4000-8000-000000000091','active'),
('20000000-0000-4000-8000-000000000092','OWN092','10000000-0000-4000-8000-000000000091','active');
INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES
('30000000-0000-4000-8000-000000000091','20000000-0000-4000-8000-000000000091','Member','10000000-0000-4000-8000-000000000093');

SELECT ok(
  (SELECT count(*)::int FROM pg_constraint WHERE conname='participants_id_session_id_key') = 1,
  'unique (id, session_id) em participants presente'
);
SELECT ok(
  (SELECT count(*)::int FROM pg_constraint WHERE conname='queue_participant_session_fk') = 1,
  'FK composta queue(participant_id, session_id) presente'
);
SELECT ok(
  (SELECT count(*)::int FROM pg_constraint WHERE conname='queue_participant_id_fkey') = 0,
  'FK simples redundante removida (evita ambiguidade de embed no PostgREST)'
);

SELECT throws_ok(
  $$INSERT INTO public.queue(session_id,participant_id,song_title,artist,status,position)
    VALUES ('20000000-0000-4000-8000-000000000092','30000000-0000-4000-8000-000000000091','Song','Artist','pending',1)$$,
  '23503',
  NULL,
  'fila com participante de outra sessão é rejeitada pelo banco'
);

SELECT lives_ok(
  $$INSERT INTO public.queue(session_id,participant_id,song_title,artist,status,position)
    VALUES ('20000000-0000-4000-8000-000000000091','30000000-0000-4000-8000-000000000091','Song','Artist','pending',1)$$,
  'fila com participante da mesma sessão continua funcionando'
);

-- Grants on existing tables/functions were not widened -------------------

SELECT ok(NOT has_table_privilege('anon','public.queue','INSERT,UPDATE,DELETE'),'queue DML ainda bloqueado para anon');
SELECT ok(NOT has_table_privilege('authenticated','public.queue','INSERT,UPDATE,DELETE'),'queue DML ainda bloqueado para authenticated');
SELECT ok(has_function_privilege('authenticated','public.join_session(text,text)','EXECUTE') AND NOT has_function_privilege('anon','public.join_session(text,text)','EXECUTE'),'join_session ACL inalterada');

SELECT * FROM finish();
ROLLBACK;
