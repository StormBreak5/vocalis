-- GATE — prova que create_queue_entry aceita título/artista ausentes ou em
-- branco (normalizados para NULL, nunca ''), que update_queue_song permite
-- ao próprio participante (ou ao Host, mesma autorização de
-- cancel_queue_entry) corrigir esses campos enquanto a música ainda não
-- começou a tocar, e que a edição é recusada fora dessa janela (singing em
-- diante, sessão encerrada, ou identidade sem vínculo com a entrada).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);

INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000601','authenticated','authenticated','ose-host@test.local','x'),
('10000000-0000-4000-8000-000000000602','authenticated','authenticated','ose-singer-a@test.local','x'),
('10000000-0000-4000-8000-000000000603','authenticated','authenticated','ose-singer-b@test.local','x'),
('10000000-0000-4000-8000-000000000604','authenticated','authenticated','ose-stranger@test.local','x'),
('10000000-0000-4000-8000-000000000605','authenticated','authenticated','ose-singer-c@test.local','x'),
('10000000-0000-4000-8000-000000000606','authenticated','authenticated','ose-singer-d@test.local','x');

INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000611','OSE611','10000000-0000-4000-8000-000000000601','active',NULL),
('20000000-0000-4000-8000-000000000612','OSE612','10000000-0000-4000-8000-000000000601','closed',now());

-- Singer A e Singer B ficam livres (sem entrada ativa pré-existente): são
-- justamente quem exercita create_queue_entry nas seções A/B/C/E abaixo, e o
-- índice único parcial (session_id, participant_id) WHERE status IN
-- ('pending','preparing','singing') só permite UMA entrada ativa por
-- participante — Singer C e Singer D são identidades à parte, dedicadas às
-- entradas de id fixo abaixo, para não colidir com esse índice.
INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES
('30000000-0000-4000-8000-000000000621','20000000-0000-4000-8000-000000000611','Singer A','10000000-0000-4000-8000-000000000602'),
('30000000-0000-4000-8000-000000000622','20000000-0000-4000-8000-000000000611','Singer B','10000000-0000-4000-8000-000000000603'),
('30000000-0000-4000-8000-000000000624','20000000-0000-4000-8000-000000000611','Singer C','10000000-0000-4000-8000-000000000605'),
('30000000-0000-4000-8000-000000000625','20000000-0000-4000-8000-000000000611','Singer D','10000000-0000-4000-8000-000000000606'),
('30000000-0000-4000-8000-000000000623','20000000-0000-4000-8000-000000000612','Closed Singer','10000000-0000-4000-8000-000000000602');

-- Entradas com id fixo, inseridas diretamente (fora da RPC) para que possam
-- ser referenciadas por valor literal dentro do texto de throws_ok — a RPC
-- gera o id via gen_random_uuid(), então não dá pra prever o valor para
-- interpolar num literal $$...$$ como o resto da suíte pgTAP deste projeto
-- faz (ver 003_session_writers.sql, 004_display_pairing_privileges.sql etc).
INSERT INTO public.queue(id,session_id,participant_id,song_title,artist,status,position) VALUES
('40000000-0000-4000-8000-000000000641','20000000-0000-4000-8000-000000000611','30000000-0000-4000-8000-000000000624','Pending Song','Pending Artist','pending',1),
('40000000-0000-4000-8000-000000000642','20000000-0000-4000-8000-000000000611','30000000-0000-4000-8000-000000000625','Singing Song','Singing Artist','singing',2),
('40000000-0000-4000-8000-000000000631','20000000-0000-4000-8000-000000000612','30000000-0000-4000-8000-000000000623','Leftover','Artist','pending',1);

-- SECTION A: create_queue_entry aceita título/artista ausentes -------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000602","role":"authenticated"}',true);
CREATE TEMP TABLE created_a AS
  SELECT * FROM public.create_queue_entry('20000000-0000-4000-8000-000000000611', NULL, NULL);
SELECT is((SELECT song_title FROM created_a),NULL,'song_title ausente vira NULL, não string vazia');
SELECT is((SELECT artist FROM created_a),NULL,'artist ausente vira NULL');
SELECT is((SELECT status FROM created_a),'pending','entrada criada como pending mesmo sem música definida');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000603","role":"authenticated"}',true);
CREATE TEMP TABLE created_b AS
  SELECT * FROM public.create_queue_entry('20000000-0000-4000-8000-000000000611', '   ', 'Legião Urbana');
SELECT is((SELECT song_title FROM created_b),NULL,'título em branco (só espaços) também vira NULL');
SELECT is((SELECT artist FROM created_b),'Legião Urbana','artista informado é preservado mesmo com título ausente');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000602","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.create_queue_entry('20000000-0000-4000-8000-000000000611', repeat('a',101), NULL)$$,
  'P0001','INVALID_SONG','título com mais de 100 caracteres é recusado mesmo sendo opcional');
RESET ROLE;

-- SECTION B: update_queue_song — dono da entrada corrige a própria música ---

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000603","role":"authenticated"}',true);
CREATE TEMP TABLE updated_by_owner AS
  SELECT * FROM public.update_queue_song((SELECT id FROM created_b),'Tempo Perdido','Legião Urbana');
SELECT is((SELECT song_title FROM updated_by_owner),'Tempo Perdido','dono da entrada consegue definir o título depois de já estar na fila');
SELECT is((SELECT artist FROM updated_by_owner),'Legião Urbana','dono da entrada consegue definir o artista');
SELECT is((SELECT status FROM updated_by_owner),'pending','edição não altera o status da entrada');
RESET ROLE;

-- SECTION C: Host também pode corrigir (mesma autorização de cancel_queue_entry)

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000601","role":"authenticated"}',true);
CREATE TEMP TABLE updated_by_host AS
  SELECT * FROM public.update_queue_song((SELECT id FROM created_b),'Evidências','Chitãozinho & Xororó');
SELECT is((SELECT song_title FROM updated_by_host),'Evidências','Host também pode corrigir título de qualquer entrada da própria sessão');
RESET ROLE;

-- SECTION D: estranho sem vínculo é recusado (mesmo erro genérico de cancel) -

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000604","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.update_queue_song('40000000-0000-4000-8000-000000000641','Outra','Outra')$$,
  'P0001','QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN','identidade sem vínculo com a entrada é recusada');
RESET ROLE;

-- SECTION E: fora da janela pending/preparing é recusado; preparing ainda é
-- permitido (a mesma janela de cancel_queue_entry cobre só pending, mas
-- update_queue_song deliberadamente também libera preparing — ver comentário
-- na migration).

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000606","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.update_queue_song('40000000-0000-4000-8000-000000000642','Outra','Outra')$$,
  'P0001','INVALID_STATUS_TRANSITION','não é possível editar uma entrada que já está cantando (mesmo sendo o dono)');
RESET ROLE;

UPDATE public.queue SET status='preparing' WHERE id=(SELECT id FROM created_b);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000603","role":"authenticated"}',true);
CREATE TEMP TABLE updated_while_preparing AS
  SELECT * FROM public.update_queue_song((SELECT id FROM created_b),'Ainda dá tempo','Ainda dá tempo');
SELECT is((SELECT song_title FROM updated_while_preparing),'Ainda dá tempo','edição ainda é permitida em preparing, não só em pending');
RESET ROLE;

-- SECTION F: sessão encerrada bloqueia a edição -------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000601","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.update_queue_song('40000000-0000-4000-8000-000000000631','Novo','Novo')$$,
  'P0001','SESSION_CLOSED','sessão encerrada recusa edição mesmo vindo do Host');
RESET ROLE;

-- SECTION G: entrada inexistente e ausência de identidade --------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000601","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.update_queue_song('40000000-0000-4000-8000-000000000999','Novo','Novo')$$,
  'P0001','QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN','entrada inexistente é recusada');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok(
  $$SELECT * FROM public.update_queue_song('40000000-0000-4000-8000-000000000641','Novo','Novo')$$,
  'P0001','AUTH_REQUIRED','sem identidade autenticada é recusado em update_queue_song');
SELECT throws_ok(
  $$SELECT * FROM public.create_queue_entry('20000000-0000-4000-8000-000000000611', NULL, NULL)$$,
  'P0001','AUTH_REQUIRED','sem identidade autenticada é recusado em create_queue_entry');
RESET ROLE;

-- SECTION H: ACL das funções --------------------------------------------------

SELECT ok(to_regprocedure('public.update_queue_song(uuid,character varying,character varying)') IS NOT NULL,'update_queue_song existe');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.update_queue_song(uuid,character varying,character varying)'::regprocedure),'postgres','owner é postgres');
SELECT ok(
  has_function_privilege('authenticated','public.update_queue_song(uuid,character varying,character varying)','EXECUTE')
  AND NOT has_function_privilege('anon','public.update_queue_song(uuid,character varying,character varying)','EXECUTE'),
  'ACL mínima de update_queue_song: authenticated sim, anon não');
SELECT ok(
  has_function_privilege('authenticated','public.create_queue_entry(uuid,character varying,character varying)','EXECUTE')
  AND NOT has_function_privilege('anon','public.create_queue_entry(uuid,character varying,character varying)','EXECUTE'),
  'ACL de create_queue_entry segue authenticated sim, anon não após a migration');

-- SECTION I: coluna do banco continua opcional --------------------------------

SELECT ok(NOT attnotnull,'queue.song_title não é mais NOT NULL') FROM pg_attribute
  WHERE attrelid='public.queue'::regclass AND attname='song_title';
SELECT ok(NOT attnotnull,'queue.artist não é mais NOT NULL') FROM pg_attribute
  WHERE attrelid='public.queue'::regclass AND attname='artist';

SELECT * FROM finish();
ROLLBACK;
