BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);
INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000061','authenticated','authenticated','qr-host@test.local','x'),
('10000000-0000-4000-8000-000000000062','authenticated','authenticated','qr-member@test.local','x'),
('10000000-0000-4000-8000-000000000063','authenticated','authenticated','qr-external@test.local','x');
INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000061','QRL061','10000000-0000-4000-8000-000000000061','active',NULL),
('20000000-0000-4000-8000-000000000062','QRL062','10000000-0000-4000-8000-000000000061','closed',now());
INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES
('30000000-0000-4000-8000-000000000061','20000000-0000-4000-8000-000000000061','Active','10000000-0000-4000-8000-000000000062'),
('30000000-0000-4000-8000-000000000062','20000000-0000-4000-8000-000000000062','Closed','10000000-0000-4000-8000-000000000062');
INSERT INTO public.queue(session_id,participant_id,song_title,artist,status,position) VALUES
('20000000-0000-4000-8000-000000000061','30000000-0000-4000-8000-000000000061','Active','Artist','pending',1),
('20000000-0000-4000-8000-000000000062','30000000-0000-4000-8000-000000000062','Closed','Artist','pending',1);
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.queue'::regclass),'RLS ativa');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE tablename='queue' AND policyname='queue_select_authorized_open_host_or_display'),1,'policy final');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE tablename='queue' AND policyname='Users can read active queue of their session'),0,'legada ausente');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000061","role":"authenticated"}',true);
SELECT is((SELECT count(id)::int FROM public.queue),2,'Host lê fila preservada closed');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000062","role":"authenticated"}',true);
SELECT is((SELECT count(id)::int FROM public.queue),1,'membro lê somente fila open');
SELECT is((SELECT count(id)::int FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000062'),0,'membro não lê queue closed');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000063","role":"authenticated"}',true);
SELECT is((SELECT count(id)::int FROM public.queue),0,'externo não lê');
SELECT ok(NOT has_table_privilege('authenticated','public.queue','INSERT,UPDATE,DELETE'),'DML direto bloqueado');
SELECT lives_ok($$SELECT id FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000061'$$,'sem recursão');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE tablename='queue' AND (qual='true' OR with_check='true')),0,'sem policy permissiva true');
SELECT * FROM finish();
ROLLBACK;
