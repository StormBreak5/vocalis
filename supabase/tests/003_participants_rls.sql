BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);
INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000051','authenticated','authenticated','pr-host@test.local','x'),
('10000000-0000-4000-8000-000000000052','authenticated','authenticated','pr-member@test.local','x'),
('10000000-0000-4000-8000-000000000053','authenticated','authenticated','pr-other@test.local','x');
INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000051','PRL051','10000000-0000-4000-8000-000000000051','active',NULL),
('20000000-0000-4000-8000-000000000052','PRL052','10000000-0000-4000-8000-000000000051','paused',NULL),
('20000000-0000-4000-8000-000000000053','PRL053','10000000-0000-4000-8000-000000000051','closed',now());
INSERT INTO public.participants(session_id,display_name,auth_user_id) VALUES
('20000000-0000-4000-8000-000000000051','Active','10000000-0000-4000-8000-000000000052'),
('20000000-0000-4000-8000-000000000052','Paused','10000000-0000-4000-8000-000000000052'),
('20000000-0000-4000-8000-000000000053','Closed','10000000-0000-4000-8000-000000000052');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.participants'::regclass),'RLS ativa');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE tablename='participants' AND policyname='participants_select_authorized_open_or_host'),1,'policy final');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE tablename='participants' AND policyname='participants_select_session'),0,'legada ausente');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000051","role":"authenticated"}',true);
SELECT is((SELECT count(id)::int FROM public.participants),3,'Host lê inclusive closed');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000052","role":"authenticated"}',true);
SELECT is((SELECT count(id)::int FROM public.participants),2,'membro lê somente open');
SELECT is((SELECT count(id)::int FROM public.participants WHERE session_id='20000000-0000-4000-8000-000000000053'),0,'membro não lê lista closed');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000053","role":"authenticated"}',true);
SELECT is((SELECT count(id)::int FROM public.participants),0,'externo não lê');
SELECT ok(NOT has_table_privilege('authenticated','public.participants','INSERT,UPDATE,DELETE'),'DML bloqueado');
SELECT lives_ok($$SELECT id FROM public.participants WHERE session_id='20000000-0000-4000-8000-000000000051'$$,'sem recursão');
SELECT * FROM finish();
ROLLBACK;
