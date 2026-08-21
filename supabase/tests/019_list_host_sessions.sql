-- GATE — prova que list_host_sessions() só devolve as sessões do próprio
-- Host chamador (nunca as de outro Host), agrega song_count/participant_count
-- corretamente mesmo para sessão encerrada, ordena por created_at DESC, e
-- devolve lista vazia (não erro) para quem nunca criou sessão.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(17);

INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000501','authenticated','authenticated','lhs-host-a@test.local','x'),
('10000000-0000-4000-8000-000000000502','authenticated','authenticated','lhs-host-b@test.local','x'),
('10000000-0000-4000-8000-000000000503','authenticated','authenticated','lhs-singer-a1-one@test.local','x'),
('10000000-0000-4000-8000-000000000504','authenticated','authenticated','lhs-singer-a1-two@test.local','x'),
('10000000-0000-4000-8000-000000000505','authenticated','authenticated','lhs-singer-a2@test.local','x'),
('10000000-0000-4000-8000-000000000506','authenticated','authenticated','lhs-singer-b1@test.local','x'),
('10000000-0000-4000-8000-000000000507','authenticated','authenticated','lhs-stranger@test.local','x');

-- A1 é a mais antiga e está encerrada; A2 é mais recente e ainda ativa —
-- ordenação DESC deve trazer A2 primeiro.
INSERT INTO public.sessions(id,code,host_id,status,created_at,closed_at) VALUES
('20000000-0000-4000-8000-000000000511','LHS511','10000000-0000-4000-8000-000000000501','closed','2026-08-01T10:00:00Z','2026-08-01T12:00:00Z'),
('20000000-0000-4000-8000-000000000512','LHS512','10000000-0000-4000-8000-000000000501','active','2026-08-10T10:00:00Z',NULL),
('20000000-0000-4000-8000-000000000513','LHS513','10000000-0000-4000-8000-000000000502','active','2026-08-05T10:00:00Z',NULL);

INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES
('30000000-0000-4000-8000-000000000521','20000000-0000-4000-8000-000000000511','Singer A1 One','10000000-0000-4000-8000-000000000503'),
('30000000-0000-4000-8000-000000000522','20000000-0000-4000-8000-000000000511','Singer A1 Two','10000000-0000-4000-8000-000000000504'),
('30000000-0000-4000-8000-000000000523','20000000-0000-4000-8000-000000000512','Singer A2','10000000-0000-4000-8000-000000000505'),
('30000000-0000-4000-8000-000000000524','20000000-0000-4000-8000-000000000513','Singer B1','10000000-0000-4000-8000-000000000506');

-- Sessão A1: 2 completed, 1 cancelled, 1 pending — song_count deve contar só
-- as 2 completed. Sessão A2 e B1: 1 completed cada.
INSERT INTO public.queue(id,session_id,participant_id,song_title,artist,status,position) VALUES
('40000000-0000-4000-8000-000000000531','20000000-0000-4000-8000-000000000511','30000000-0000-4000-8000-000000000521','Evidências','Chitãozinho & Xororó','completed',1),
('40000000-0000-4000-8000-000000000532','20000000-0000-4000-8000-000000000511','30000000-0000-4000-8000-000000000522','Tempo Perdido','Legião Urbana','completed',2),
('40000000-0000-4000-8000-000000000533','20000000-0000-4000-8000-000000000511','30000000-0000-4000-8000-000000000521','Velha Infância','Tribalistas','cancelled',3),
('40000000-0000-4000-8000-000000000534','20000000-0000-4000-8000-000000000511','30000000-0000-4000-8000-000000000522','Leftover','Artist','pending',4),
('40000000-0000-4000-8000-000000000535','20000000-0000-4000-8000-000000000512','30000000-0000-4000-8000-000000000523','Garota de Ipanema','Tom Jobim','completed',1),
('40000000-0000-4000-8000-000000000536','20000000-0000-4000-8000-000000000513','30000000-0000-4000-8000-000000000524','Ai Se Eu Te Pego','Michel Teló','completed',1);

-- SECTION A: Host A lê só as próprias 2 sessões, mais recente primeiro,
-- contagens corretas inclusive na sessão já encerrada.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000501","role":"authenticated"}',true);
CREATE TEMP TABLE host_a_read AS
  SELECT *, row_number() OVER () AS rn FROM public.list_host_sessions();
SELECT is((SELECT count(*)::int FROM host_a_read),2,'Host A lê exatamente as próprias 2 sessões');
SELECT is((SELECT id FROM host_a_read WHERE rn=1),'20000000-0000-4000-8000-000000000512','sessão mais recente (A2) vem primeiro');
SELECT is((SELECT id FROM host_a_read WHERE rn=2),'20000000-0000-4000-8000-000000000511','sessão mais antiga (A1, encerrada) vem depois');
SELECT is((SELECT song_count FROM host_a_read WHERE id='20000000-0000-4000-8000-000000000511'),2,'A1 (encerrada): song_count conta só completed (2), exclui cancelled e pending');
SELECT is((SELECT participant_count FROM host_a_read WHERE id='20000000-0000-4000-8000-000000000511'),2,'A1 (encerrada): participant_count agrega corretamente mesmo com a sessão fechada');
SELECT is((SELECT song_count FROM host_a_read WHERE id='20000000-0000-4000-8000-000000000512'),1,'A2 (ativa): song_count correto');
SELECT is((SELECT participant_count FROM host_a_read WHERE id='20000000-0000-4000-8000-000000000512'),1,'A2 (ativa): participant_count correto');
SELECT is((SELECT count(*)::int FROM host_a_read WHERE id='20000000-0000-4000-8000-000000000513'),0,'Host A nunca vê a sessão do Host B');
RESET ROLE;

-- SECTION B: Host B lê só a própria sessão.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000502","role":"authenticated"}',true);
CREATE TEMP TABLE host_b_read AS
  SELECT * FROM public.list_host_sessions();
SELECT is((SELECT count(*)::int FROM host_b_read),1,'Host B lê exatamente 1 sessão');
SELECT is((SELECT id FROM host_b_read LIMIT 1),'20000000-0000-4000-8000-000000000513','Host B vê a própria sessão (B1)');
SELECT is((SELECT song_count FROM host_b_read LIMIT 1),1,'B1: song_count correto');
SELECT is((SELECT participant_count FROM host_b_read LIMIT 1),1,'B1: participant_count correto');
RESET ROLE;

-- SECTION C: identidade autenticada que nunca criou sessão recebe lista
-- vazia, não erro.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000507","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.list_host_sessions()),0,'quem nunca criou sessão recebe lista vazia, não erro');
RESET ROLE;

-- SECTION D: sem identidade autenticada é recusado.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok($$SELECT * FROM public.list_host_sessions()$$,'P0001','AUTH_REQUIRED','sem identidade autenticada recusado');
RESET ROLE;

-- SECTION E: ACL da função ---------------------------------------------------

SELECT ok(to_regprocedure('public.list_host_sessions()') IS NOT NULL,'list_host_sessions existe');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.list_host_sessions()'::regprocedure),'postgres','owner é postgres');
SELECT ok(has_function_privilege('authenticated','public.list_host_sessions()','EXECUTE') AND NOT has_function_privilege('anon','public.list_host_sessions()','EXECUTE'),'ACL mínima: authenticated sim, anon não');

SELECT * FROM finish();
ROLLBACK;
