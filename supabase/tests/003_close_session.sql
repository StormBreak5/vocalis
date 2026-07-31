BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);
INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000011','authenticated','authenticated','close-host@test.local','x'),
('10000000-0000-4000-8000-000000000012','authenticated','authenticated','close-other@test.local','x'),
('10000000-0000-4000-8000-000000000013','authenticated','authenticated','close-member@test.local','x');
INSERT INTO public.sessions(id,code,host_id,status) VALUES
('20000000-0000-4000-8000-000000000011','CLO011','10000000-0000-4000-8000-000000000011','active'),
('20000000-0000-4000-8000-000000000012','CLO012','10000000-0000-4000-8000-000000000011','paused');
INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES ('30000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000011','Member','10000000-0000-4000-8000-000000000013');
INSERT INTO public.queue(id,session_id,participant_id,song_title,artist,status,position) VALUES ('40000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','Song','Artist','pending',1);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE close_first AS SELECT * FROM public.close_session('20000000-0000-4000-8000-000000000011');
SELECT is((SELECT status FROM close_first),'closed','active encerra');
SELECT ok((SELECT changed FROM close_first),'primeira chamada changed');
SELECT ok((SELECT closed_at IS NOT NULL FROM close_first),'closed_at preenchido');
CREATE TEMP TABLE close_retry AS SELECT * FROM public.close_session('20000000-0000-4000-8000-000000000011');
SELECT ok(NOT (SELECT changed FROM close_retry),'retry changed false');
SELECT is((SELECT closed_at FROM close_retry),(SELECT closed_at FROM close_first),'retry preserva timestamp');
CREATE TEMP TABLE close_paused AS SELECT * FROM public.close_session('20000000-0000-4000-8000-000000000012');
SELECT is((SELECT status FROM close_paused),'closed','paused encerra');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.participants WHERE session_id='20000000-0000-4000-8000-000000000011'),1,'Participant preservado');
SELECT is((SELECT count(*)::int FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000011'),1,'Queue preservada');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000012","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.close_session('20000000-0000-4000-8000-000000000011')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','outro Host rejeitado');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000013","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.close_session('20000000-0000-4000-8000-000000000011')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','Participant rejeitado');
SELECT throws_ok($$SELECT * FROM public.close_session('29999999-0000-4000-8000-000000000099')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','inexistente indistinguível');
RESET ROLE;
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.close_session(uuid)'::regprocedure),'postgres','owner postgres');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid='public.close_session(uuid)'::regprocedure),'SECURITY DEFINER');
SELECT ok(has_function_privilege('authenticated','public.close_session(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.close_session(uuid)','EXECUTE'),'ACL mínima');
SELECT * FROM finish();
ROLLBACK;
