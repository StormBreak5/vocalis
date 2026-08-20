BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);
INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000041','authenticated','authenticated','rls-host@test.local','x'),
('10000000-0000-4000-8000-000000000042','authenticated','authenticated','rls-member@test.local','x'),
('10000000-0000-4000-8000-000000000043','authenticated','authenticated','rls-external@test.local','x');
INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000041','RLS041','10000000-0000-4000-8000-000000000041','active',NULL),
('20000000-0000-4000-8000-000000000042','RLS042','10000000-0000-4000-8000-000000000041','paused',NULL),
('20000000-0000-4000-8000-000000000043','RLS043','10000000-0000-4000-8000-000000000041','closed',now());
INSERT INTO public.participants(session_id,display_name,auth_user_id) VALUES
('20000000-0000-4000-8000-000000000041','Member A','10000000-0000-4000-8000-000000000042'),
('20000000-0000-4000-8000-000000000042','Member P','10000000-0000-4000-8000-000000000042'),
('20000000-0000-4000-8000-000000000043','Member C','10000000-0000-4000-8000-000000000042');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.sessions'::regclass),'RLS habilitada');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='sessions' AND policyname='sessions_select_owned_member_or_display'),1,'policy final presente');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND policyname IN ('sessions_select_public','sessions_update_own','participants_select_session','Users can read active queue of their session','Host can update queue')),0,'policies legadas ausentes');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true')),0,'sem predicado true');
SELECT ok(EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sessions'),'sessions em Realtime');
SELECT ok(has_column_privilege('authenticated','public.sessions','id','SELECT') AND has_column_privilege('authenticated','public.sessions','code','SELECT') AND has_column_privilege('authenticated','public.sessions','status','SELECT') AND has_column_privilege('authenticated','public.sessions','closed_at','SELECT'),'quatro colunas permitidas');
SELECT ok(NOT has_column_privilege('authenticated','public.sessions','host_id','SELECT'),'host_id proibido');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000041","role":"authenticated"}',true);
SELECT is((SELECT count(id)::int FROM public.sessions),3,'Host lê active paused closed');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000042","role":"authenticated"}',true);
SELECT is((SELECT count(id)::int FROM public.sessions),3,'membro lê status active paused closed');
SELECT is((SELECT count(id)::int FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000043'),1,'membro detecta closed por UUID');
SELECT is((SELECT count(id)::int FROM public.sessions WHERE code='RLS043'),1,'membro detecta closed por código relacionado');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000043","role":"authenticated"}',true);
SELECT is((SELECT count(id)::int FROM public.sessions),0,'externo não lê');
SELECT is((SELECT count(id)::int FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000043'),0,'UUID conhecido não amplia');
SELECT is((SELECT count(id)::int FROM public.sessions WHERE code='RLS043'),0,'código conhecido não amplia');
SELECT lives_ok($$SELECT id,code,status,closed_at FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000041'$$,'consulta Realtime sem recursão');
SELECT * FROM finish();
ROLLBACK;
