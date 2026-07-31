BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(21);
SELECT ok(to_regprocedure('public.join_session(text,text)') IS NOT NULL,'join existe');
SELECT ok(to_regprocedure('public.create_queue_entry(uuid,character varying,character varying)') IS NOT NULL,'create existe');
SELECT ok(to_regprocedure('public.cancel_queue_entry(uuid)') IS NOT NULL,'cancel existe');
SELECT ok(to_regprocedure('public.update_queue_status(uuid,text)') IS NOT NULL,'update queue existe');
SELECT ok(to_regprocedure('public.update_session_status(uuid,text)') IS NOT NULL,'update session existe');
SELECT is((SELECT prorettype::regtype::text FROM pg_proc WHERE oid='public.cancel_queue_entry(uuid)'::regprocedure),'void','cancel retorna void');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid='public.create_queue_entry(uuid,character varying,character varying)'::regprocedure),'writers SECURITY DEFINER');
SELECT is((SELECT proconfig[1] FROM pg_proc WHERE oid='public.update_session_status(uuid,text)'::regprocedure),'search_path=""','search_path vazio');
INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000031','authenticated','authenticated','writer-host@test.local','x'),
('10000000-0000-4000-8000-000000000032','authenticated','authenticated','writer-member@test.local','x'),
('10000000-0000-4000-8000-000000000033','authenticated','authenticated','writer-new@test.local','x');
INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000031','WRT031','10000000-0000-4000-8000-000000000031','active',NULL),
('20000000-0000-4000-8000-000000000032','WRT032','10000000-0000-4000-8000-000000000031','paused',NULL),
('20000000-0000-4000-8000-000000000033','WRT033','10000000-0000-4000-8000-000000000031','closed',now());
INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES
('30000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000031','Member','10000000-0000-4000-8000-000000000032'),
('30000000-0000-4000-8000-000000000034','20000000-0000-4000-8000-000000000031','Other',NULL),
('30000000-0000-4000-8000-000000000033','20000000-0000-4000-8000-000000000033','Member','10000000-0000-4000-8000-000000000032');
INSERT INTO public.queue(id,session_id,participant_id,song_title,artist,status,position) VALUES
('40000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000034','Pending','Artist','pending',1),
('40000000-0000-4000-8000-000000000033','20000000-0000-4000-8000-000000000033','30000000-0000-4000-8000-000000000033','Closed','Artist','pending',1);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000032","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT * FROM public.create_queue_entry('20000000-0000-4000-8000-000000000031','New song','Artist')$$,'create active');
SELECT throws_ok($$SELECT * FROM public.create_queue_entry('20000000-0000-4000-8000-000000000033','Blocked','Artist')$$,'P0001','SESSION_CLOSED','create closed bloqueado');
SELECT throws_ok($$SELECT public.cancel_queue_entry('40000000-0000-4000-8000-000000000033')$$,'P0001','SESSION_CLOSED','cancel closed bloqueado');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000033","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.join_session('WRT031','New Member')$$,'join active');
SELECT throws_ok($$SELECT public.join_session('WRT032','Paused Member')$$,'P0001','SESSION_PAUSED','join paused bloqueado');
SELECT throws_ok($$SELECT public.join_session('WRT033','Closed Member')$$,'P0001','SESSION_CLOSED','join closed bloqueado');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000031","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT * FROM public.update_queue_status('40000000-0000-4000-8000-000000000031','preparing')$$,'Host atualiza queue active');
SELECT throws_ok($$SELECT * FROM public.update_queue_status('40000000-0000-4000-8000-000000000033','preparing')$$,'P0001','SESSION_CLOSED','update queue closed bloqueado');
SELECT lives_ok($$SELECT * FROM public.update_session_status('20000000-0000-4000-8000-000000000031','paused')$$,'pause permitido');
SELECT throws_ok($$SELECT * FROM public.update_session_status('20000000-0000-4000-8000-000000000033','active')$$,'P0001','SESSION_CLOSED','resume closed bloqueado');
SELECT throws_ok($$SELECT * FROM public.update_session_status('20000000-0000-4000-8000-000000000031','closed')$$,'P0001','INVALID_STATUS_TRANSITION','status writer não define closed');
RESET ROLE;
SELECT is((SELECT status::text FROM public.queue WHERE id='40000000-0000-4000-8000-000000000033'),'pending','queue closed preservada');
SELECT is((SELECT count(*)::int FROM public.participants WHERE session_id='20000000-0000-4000-8000-000000000033'),1,'participants closed preservados');
SELECT * FROM finish();
ROLLBACK;
