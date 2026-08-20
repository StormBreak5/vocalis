-- GATE — proves list_active_queue resolves the real participant name for
-- Host, session participant AND paired display alike, without granting the
-- paired display any new access to public.participants (see
-- specs/004-display-pairing/research.md R15). Also proves the participants
-- policy itself is untouched, mirroring the "policy catalog" section of
-- 004_display_pairing_rls.sql.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(20);

INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000171','authenticated','authenticated','laq-host-a@test.local','x'),
('10000000-0000-4000-8000-000000000172','authenticated','authenticated','laq-host-b@test.local','x'),
('10000000-0000-4000-8000-000000000173','authenticated','authenticated','laq-member-a@test.local','x'),
('10000000-0000-4000-8000-000000000174','authenticated','authenticated','laq-member-b@test.local','x'),
('10000000-0000-4000-8000-000000000175','authenticated','authenticated','laq-tv@test.local','x'),
('10000000-0000-4000-8000-000000000176','authenticated','authenticated','laq-tv-other@test.local','x'),
('10000000-0000-4000-8000-000000000177','authenticated','authenticated','laq-stranger@test.local','x');

INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000181','LAQ181','10000000-0000-4000-8000-000000000171','active',NULL),
('20000000-0000-4000-8000-000000000182','LAQ182','10000000-0000-4000-8000-000000000171','closed',now()),
('20000000-0000-4000-8000-000000000183','LAQ183','10000000-0000-4000-8000-000000000172','active',NULL);

INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES
('30000000-0000-4000-8000-000000000191','20000000-0000-4000-8000-000000000181','Marina Costa','10000000-0000-4000-8000-000000000173'),
('30000000-0000-4000-8000-000000000192','20000000-0000-4000-8000-000000000181','Diego Luz','10000000-0000-4000-8000-000000000174'),
('30000000-0000-4000-8000-000000000193','20000000-0000-4000-8000-000000000182','Closed Singer','10000000-0000-4000-8000-000000000173');

INSERT INTO public.queue(id,session_id,participant_id,song_title,artist,status,position) VALUES
('40000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000181','30000000-0000-4000-8000-000000000191','Evidências','Chitãozinho & Xororó','singing',1),
('40000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000181','30000000-0000-4000-8000-000000000192','Tempo Perdido','Legião Urbana','pending',2),
('40000000-0000-4000-8000-000000000203','20000000-0000-4000-8000-000000000181','30000000-0000-4000-8000-000000000191','Velha Infância','Tribalistas','cancelled',3),
('40000000-0000-4000-8000-000000000204','20000000-0000-4000-8000-000000000182','30000000-0000-4000-8000-000000000193','Leftover','Artist','pending',1);

INSERT INTO public.display_pairings(session_id,auth_user_id) VALUES
('20000000-0000-4000-8000-000000000181','10000000-0000-4000-8000-000000000175'),
('20000000-0000-4000-8000-000000000183','10000000-0000-4000-8000-000000000176');

-- SECTION A: Host lê a fila da própria sessão, nomes corretos, status filtrado

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000171","role":"authenticated"}',true);
CREATE TEMP TABLE host_read AS
  SELECT * FROM public.list_active_queue('20000000-0000-4000-8000-000000000181');
SELECT is((SELECT count(*)::int FROM host_read),2,'Host lê exatamente as 2 entradas ativas (cancelled excluída)');
SELECT is((SELECT participant_name FROM host_read WHERE id='40000000-0000-4000-8000-000000000201'),'Marina Costa','Host vê nome correto da entrada singing');
SELECT is((SELECT participant_name FROM host_read WHERE id='40000000-0000-4000-8000-000000000202'),'Diego Luz','Host vê nome correto da entrada pending');
SELECT is((SELECT count(*)::int FROM host_read WHERE id='40000000-0000-4000-8000-000000000203'),0,'entrada cancelled não aparece');
SELECT is((SELECT array_agg(id ORDER BY "position") FROM host_read),(SELECT array_agg(id) FROM (SELECT id FROM host_read ORDER BY "position") s),'resultado já vem ordenado por position ASC');
RESET ROLE;

-- SECTION B: participante da sessão lê a fila inteira, inclusive nome de OUTRO
-- participante — prova que a resolução de nome não depende de "é o próprio".

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000173","role":"authenticated"}',true);
CREATE TEMP TABLE member_read AS
  SELECT * FROM public.list_active_queue('20000000-0000-4000-8000-000000000181');
SELECT is((SELECT count(*)::int FROM member_read),2,'participante lê as 2 entradas ativas');
SELECT is((SELECT participant_name FROM member_read WHERE id='40000000-0000-4000-8000-000000000202'),'Diego Luz','participante vê o nome de OUTRO participante corretamente');
RESET ROLE;

-- SECTION C: telão pareado — a prova central deste gate. FR-010 (corrigida)
-- permite este nome; a policy de participants continua fechada (SEÇÃO F).

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000175","role":"authenticated"}',true);
CREATE TEMP TABLE tv_read AS
  SELECT * FROM public.list_active_queue('20000000-0000-4000-8000-000000000181');
SELECT is((SELECT count(*)::int FROM tv_read),2,'telão pareado lê as 2 entradas ativas');
SELECT is((SELECT participant_name FROM tv_read WHERE id='40000000-0000-4000-8000-000000000201'),'Marina Costa','telão pareado vê o nome real — não "Cantor"');
SELECT is((SELECT participant_name FROM tv_read WHERE id='40000000-0000-4000-8000-000000000202'),'Diego Luz','telão pareado vê o nome real da segunda entrada também');
SELECT is((SELECT count(*)::int FROM public.participants WHERE session_id='20000000-0000-4000-8000-000000000181'),0,'telão pareado continua sem NENHUM acesso direto a participants — SC-004 intacta');
RESET ROLE;

-- SECTION D: telão pareado a sessão fechada é recusado (mesma semântica de
-- queue_select_authorized_open_host_or_display: paired exige sessão aberta).

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000171","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.list_active_queue('20000000-0000-4000-8000-000000000182')),1,'Host lê fila mesmo com sessão closed (sem exigência de sessão aberta)');
RESET ROLE;

-- SECTION E: identidades sem vínculo são recusadas -------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000177","role":"authenticated"}',true);
SELECT throws_ok($$SELECT * FROM public.list_active_queue('20000000-0000-4000-8000-000000000181')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','identidade sem vínculo recusada');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000176","role":"authenticated"}',true);
SELECT throws_ok($$SELECT * FROM public.list_active_queue('20000000-0000-4000-8000-000000000181')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','telão pareado de OUTRA sessão recusado (isolamento)');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok($$SELECT * FROM public.list_active_queue('20000000-0000-4000-8000-000000000181')$$,'P0001','AUTH_REQUIRED','sem identidade autenticada recusado');
RESET ROLE;

-- SECTION F: ACL da função + policy de participants segue intocada ----------

SELECT ok(to_regprocedure('public.list_active_queue(uuid)') IS NOT NULL,'list_active_queue existe');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.list_active_queue(uuid)'::regprocedure),'postgres','owner é postgres');
SELECT ok(has_function_privilege('authenticated','public.list_active_queue(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.list_active_queue(uuid)','EXECUTE'),'ACL mínima: authenticated sim, anon não');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='participants'),1,'participants continua com exatamente uma policy — não ganhou nenhuma nova por causa desta RPC');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='participants' AND (qual ILIKE '%is_paired_display%' OR with_check ILIKE '%is_paired_display%')),0,'is_paired_display continua fora de qualquer policy de participants');

SELECT * FROM finish();
ROLLBACK;
