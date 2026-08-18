-- GATE FILE — proves SC-004: participants stays inaccessible to a paired
-- display in every session state, while sessions/queue open the new path.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(41);

INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000121','authenticated','authenticated','rls-host-a@test.local','x'),
('10000000-0000-4000-8000-000000000122','authenticated','authenticated','rls-host-b@test.local','x'),
('10000000-0000-4000-8000-000000000123','authenticated','authenticated','rls-member-a@test.local','x'),
('10000000-0000-4000-8000-000000000124','authenticated','authenticated','rls-tv1@test.local','x'),
('10000000-0000-4000-8000-000000000125','authenticated','authenticated','rls-tv2@test.local','x'),
('10000000-0000-4000-8000-000000000126','authenticated','authenticated','rls-tv-cross@test.local','x'),
('10000000-0000-4000-8000-000000000127','authenticated','authenticated','rls-external@test.local','x'),
('10000000-0000-4000-8000-000000000128','authenticated','authenticated','rls-tv3@test.local','x');

INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000131','RLD131','10000000-0000-4000-8000-000000000121','active',NULL),
('20000000-0000-4000-8000-000000000132','RLD132','10000000-0000-4000-8000-000000000121','paused',NULL),
('20000000-0000-4000-8000-000000000133','RLD133','10000000-0000-4000-8000-000000000121','closed',now()),
('20000000-0000-4000-8000-000000000134','RLD134','10000000-0000-4000-8000-000000000121','active',NULL),
('20000000-0000-4000-8000-000000000135','RLD135','10000000-0000-4000-8000-000000000122','active',NULL);

INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES
('30000000-0000-4000-8000-000000000141','20000000-0000-4000-8000-000000000131','Member','10000000-0000-4000-8000-000000000123'),
('30000000-0000-4000-8000-000000000142','20000000-0000-4000-8000-000000000132','Member','10000000-0000-4000-8000-000000000123'),
('30000000-0000-4000-8000-000000000143','20000000-0000-4000-8000-000000000133','Member','10000000-0000-4000-8000-000000000123'),
('30000000-0000-4000-8000-000000000144','20000000-0000-4000-8000-000000000134','Member','10000000-0000-4000-8000-000000000123');

INSERT INTO public.queue(id,session_id,participant_id,song_title,artist,status,position) VALUES
('40000000-0000-4000-8000-000000000151','20000000-0000-4000-8000-000000000131','30000000-0000-4000-8000-000000000141','Active','Artist','pending',1),
('40000000-0000-4000-8000-000000000152','20000000-0000-4000-8000-000000000132','30000000-0000-4000-8000-000000000142','Paused','Artist','pending',1),
('40000000-0000-4000-8000-000000000153','20000000-0000-4000-8000-000000000133','30000000-0000-4000-8000-000000000143','Closed','Artist','pending',1),
('40000000-0000-4000-8000-000000000154','20000000-0000-4000-8000-000000000134','30000000-0000-4000-8000-000000000144','ForClose','Artist','pending',1);

-- tv2 (125) paired to all three fixed-state sessions at once: one identity,
-- three distinct display_pairings rows, one per session_id.
INSERT INTO public.display_pairings(session_id,auth_user_id) VALUES
('20000000-0000-4000-8000-000000000131','10000000-0000-4000-8000-000000000125'),
('20000000-0000-4000-8000-000000000132','10000000-0000-4000-8000-000000000125'),
('20000000-0000-4000-8000-000000000133','10000000-0000-4000-8000-000000000125');

-- tv_cross (126) paired ONLY to session_b (135), never to session_active (131).
INSERT INTO public.display_pairings(session_id,auth_user_id) VALUES
('20000000-0000-4000-8000-000000000135','10000000-0000-4000-8000-000000000126');

-- tv1 (124) paired to session_active (131), dedicated to the revoke section.
-- id fixed as a literal on purpose: authenticated has no SELECT grant on the
-- auth_user_id column, so a WHERE auth_user_id=... lookup under that role
-- (even as the owning Host) fails at the column-privilege check, before RLS.
INSERT INTO public.display_pairings(id,session_id,auth_user_id) VALUES
('50000000-0000-4000-8000-000000000124','20000000-0000-4000-8000-000000000131','10000000-0000-4000-8000-000000000124');

-- tv3 (128) paired to session_for_close (134), dedicated to the close_session
-- side-effect section.
INSERT INTO public.display_pairings(session_id,auth_user_id) VALUES
('20000000-0000-4000-8000-000000000134','10000000-0000-4000-8000-000000000128');

-- SECTION A: sessions/queue/participants for a paired display across states --

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000125","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000131'),1,'telão pareado lê sessions active');
SELECT is((SELECT count(*)::int FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000132'),1,'telão pareado lê sessions paused');
SELECT is((SELECT count(*)::int FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000133'),1,'telão pareado lê sessions closed (para renderizar DisplayClosedState)');
SELECT is((SELECT count(*)::int FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000131'),1,'telão pareado lê queue active');
SELECT is((SELECT count(*)::int FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000132'),1,'telão pareado lê queue paused');
SELECT is((SELECT count(*)::int FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000133'),0,'telão pareado NÃO lê queue closed');
SELECT is((SELECT count(*)::int FROM public.participants WHERE session_id='20000000-0000-4000-8000-000000000131'),0,'telão pareado NÃO lê participants active — SC-004');
SELECT is((SELECT count(*)::int FROM public.participants WHERE session_id='20000000-0000-4000-8000-000000000132'),0,'telão pareado NÃO lê participants paused — SC-004');
SELECT is((SELECT count(*)::int FROM public.participants WHERE session_id='20000000-0000-4000-8000-000000000133'),0,'telão pareado NÃO lê participants closed — SC-004');
SELECT is((SELECT count(*)::int FROM public.participants),0,'telão pareado NÃO lê participants em nenhuma sessão, sem filtro — SC-004');
RESET ROLE;

-- SECTION B: isolamento — identidade paireada a OUTRA sessão não amplia -----

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000126","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000131'),0,'telão de outra sessão não lê sessions');
SELECT is((SELECT count(*)::int FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000131'),0,'telão de outra sessão não lê queue');
SELECT throws_ok($$SELECT * FROM public.get_display_session_details('20000000-0000-4000-8000-000000000131')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','telão de outra sessão recusado em get_display_session_details');
RESET ROLE;

-- SECTION C: get_display_session_details — matriz completa de identidades ---

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000121","role":"authenticated"}',true);
SELECT is((SELECT status FROM public.get_display_session_details('20000000-0000-4000-8000-000000000131')),'active','Host lê detalhes active');
SELECT is((SELECT status FROM public.get_display_session_details('20000000-0000-4000-8000-000000000133')),'closed','Host lê detalhes closed');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000125","role":"authenticated"}',true);
SELECT is((SELECT status FROM public.get_display_session_details('20000000-0000-4000-8000-000000000131')),'active','telão pareado ativo lê detalhes active');
SELECT is((SELECT status FROM public.get_display_session_details('20000000-0000-4000-8000-000000000133')),'closed','telão pareado ativo lê detalhes closed');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000123","role":"authenticated"}',true);
SELECT throws_ok($$SELECT * FROM public.get_display_session_details('20000000-0000-4000-8000-000000000131')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','participante comum (não pareado) recusado');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000127","role":"authenticated"}',true);
SELECT throws_ok($$SELECT * FROM public.get_display_session_details('20000000-0000-4000-8000-000000000131')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','visitante sem vínculo recusado');
RESET ROLE;

-- SECTION D: revoke_display_pairing ------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000121","role":"authenticated"}',true);
CREATE TEMP TABLE revoke_first AS
  SELECT * FROM public.revoke_display_pairing('50000000-0000-4000-8000-000000000124');
SELECT ok((SELECT revoked FROM revoke_first),'Host dono revoga com sucesso');
CREATE TEMP TABLE revoke_retry AS
  SELECT * FROM public.revoke_display_pairing('50000000-0000-4000-8000-000000000124');
SELECT ok(NOT (SELECT revoked FROM revoke_retry),'revogação repetida é idempotente (revoked=false)');
SELECT is((SELECT id FROM revoke_first),(SELECT id FROM revoke_retry),'mesmo id nas duas chamadas');
SELECT throws_ok($$SELECT * FROM public.revoke_display_pairing('99999999-0000-4000-8000-000000000000')$$,'P0001','PAIRING_NOT_FOUND_OR_FORBIDDEN','pareamento inexistente recusado');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000122","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.revoke_display_pairing('50000000-0000-4000-8000-000000000124')$$,
  'P0001','PAIRING_NOT_FOUND_OR_FORBIDDEN','Host de outra sessão não revoga pareamento alheio');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000124","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000131'),0,'telão revogado perde leitura de sessions (diferente de closed)');
SELECT is((SELECT count(*)::int FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000131'),0,'telão revogado perde leitura de queue');
SELECT throws_ok($$SELECT * FROM public.get_display_session_details('20000000-0000-4000-8000-000000000131')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','telão revogado recusado em get_display_session_details');
RESET ROLE;

-- SECTION E: encerrar a sessão revoga acesso à fila SEM tocar display_pairings

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000128","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000134'),1,'telão pareado lê queue antes do encerramento');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000121","role":"authenticated"}',true);
SELECT public.close_session('20000000-0000-4000-8000-000000000134');
RESET ROLE;

SELECT is((SELECT revoked_at FROM public.display_pairings WHERE session_id='20000000-0000-4000-8000-000000000134' AND auth_user_id='10000000-0000-4000-8000-000000000128'),NULL,'close_session NÃO grava revoked_at em display_pairings');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000128","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000134'),1,'telão pareado ainda lê sessions após encerramento (status closed)');
SELECT is((SELECT status FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000134'),'closed','status observado é closed');
SELECT is((SELECT count(*)::int FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000134'),0,'telão pareado perde queue só por efeito de status, não de revogação');
RESET ROLE;

-- SECTION F: catálogo de policies --------------------------------------------

SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='sessions' AND policyname='sessions_select_owned_member_or_display'),1,'policy nova de sessions presente');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='sessions' AND policyname='sessions_select_owned_or_member'),0,'policy antiga de sessions ausente');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='queue' AND policyname='queue_select_authorized_open_host_or_display'),1,'policy nova de queue presente');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='queue' AND policyname='queue_select_authorized_open_or_host'),0,'policy antiga de queue ausente');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='participants' AND policyname='participants_select_authorized_open_or_host'),1,'policy de participants segue com o MESMO nome da migration 016 — não foi tocada');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='participants'),1,'participants tem exatamente uma policy (nenhuma nova foi adicionada)');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='participants' AND (qual ILIKE '%is_paired_display%' OR with_check ILIKE '%is_paired_display%')),0,'is_paired_display não aparece em nenhuma policy de participants');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='display_pairings' AND policyname='display_pairings_select_host'),1,'policy de display_pairings presente');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.display_pairings'::regclass),'RLS ativa em display_pairings');

SELECT * FROM finish();
ROLLBACK;
