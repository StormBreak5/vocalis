-- GATE FILE — proves SC-003: every write RPC in the project refuses a paired
-- display identity, including the two Host-only write RPCs this feature adds
-- (generate_display_pairing_code, revoke_display_pairing). A paired display
-- that could mint a pairing code or revoke another display would be exactly
-- the privilege escalation User Story 3 exists to prevent.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);

INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000161','authenticated','authenticated','priv-host@test.local','x'),
('10000000-0000-4000-8000-000000000162','authenticated','authenticated','priv-member@test.local','x'),
('10000000-0000-4000-8000-000000000163','authenticated','authenticated','priv-tv@test.local','x');

INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000161','PRV161','10000000-0000-4000-8000-000000000161','active',NULL);

INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES
('30000000-0000-4000-8000-000000000161','20000000-0000-4000-8000-000000000161','Member','10000000-0000-4000-8000-000000000162');

INSERT INTO public.queue(id,session_id,participant_id,song_title,artist,status,position) VALUES
('40000000-0000-4000-8000-000000000161','20000000-0000-4000-8000-000000000161','30000000-0000-4000-8000-000000000161','Song','Artist','pending',1);

-- id fixed as a literal on purpose: the tv identity has no SELECT grant on
-- the auth_user_id column (proven below), so it could never look up its own
-- pairing id via a WHERE auth_user_id=... query in real use either.
INSERT INTO public.display_pairings(id,session_id,auth_user_id) VALUES
('50000000-0000-4000-8000-000000000161','20000000-0000-4000-8000-000000000161','10000000-0000-4000-8000-000000000163');

-- Existence + ownership + ACL for the five new RPCs -------------------------

SELECT ok(to_regprocedure('public.generate_display_pairing_code(uuid)') IS NOT NULL,'generate existe');
SELECT ok(to_regprocedure('public.redeem_display_pairing_code(text,text)') IS NOT NULL,'redeem existe');
SELECT ok(to_regprocedure('public.get_display_session_details(uuid)') IS NOT NULL,'get_display_session_details existe');
SELECT ok(to_regprocedure('public.list_paired_displays(uuid)') IS NOT NULL,'list_paired_displays existe');
SELECT ok(to_regprocedure('public.revoke_display_pairing(uuid)') IS NOT NULL,'revoke_display_pairing existe');
SELECT ok(has_function_privilege('authenticated','public.get_display_session_details(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.get_display_session_details(uuid)','EXECUTE'),'get_display_session_details ACL mínima');
SELECT ok(has_function_privilege('authenticated','public.revoke_display_pairing(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.revoke_display_pairing(uuid)','EXECUTE'),'revoke_display_pairing ACL mínima');

-- Tabelas novas: DML direto bloqueado, exatamente como sessions/participants/queue

SELECT ok(NOT has_table_privilege('authenticated','public.display_pairings','INSERT,UPDATE,DELETE'),'display_pairings DML direto revogado para authenticated');
SELECT ok(NOT has_table_privilege('anon','public.display_pairings','INSERT,UPDATE,DELETE,SELECT'),'display_pairings totalmente bloqueado para anon');
SELECT ok(NOT has_table_privilege('authenticated','private.display_pairing_codes','SELECT,INSERT,UPDATE,DELETE'),'display_pairing_codes bloqueada para authenticated');
SELECT ok(has_column_privilege('authenticated','public.display_pairings','session_id','SELECT'),'session_id concedida (coluna de filtro Realtime)');
SELECT ok(NOT has_column_privilege('authenticated','public.display_pairings','auth_user_id','SELECT'),'auth_user_id NÃO concedida');

-- SC-003: as sete RPCs de escrita recusam identidade de telão pareado -------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000163","role":"authenticated"}',true);

SELECT throws_ok(
  $$SELECT * FROM public.create_queue_entry('20000000-0000-4000-8000-000000000161','Blocked','Artist')$$,
  'P0001','PARTICIPANT_NOT_FOUND_OR_FORBIDDEN','create_queue_entry recusa telão pareado');

SELECT throws_ok(
  $$SELECT public.cancel_queue_entry('40000000-0000-4000-8000-000000000161')$$,
  'P0001','QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN','cancel_queue_entry recusa telão pareado');

SELECT throws_ok(
  $$SELECT * FROM public.update_queue_status('40000000-0000-4000-8000-000000000161','preparing')$$,
  'P0001','QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN','update_queue_status recusa telão pareado');

SELECT throws_ok(
  $$SELECT * FROM public.update_session_status('20000000-0000-4000-8000-000000000161','paused')$$,
  'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','update_session_status recusa telão pareado');

SELECT throws_ok(
  $$SELECT * FROM public.close_session('20000000-0000-4000-8000-000000000161')$$,
  'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','close_session recusa telão pareado');

SELECT throws_ok(
  $$SELECT * FROM public.generate_display_pairing_code('20000000-0000-4000-8000-000000000161')$$,
  'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','generate_display_pairing_code recusa telão pareado (escalação de privilégio bloqueada)');

SELECT throws_ok(
  $$SELECT * FROM public.revoke_display_pairing('50000000-0000-4000-8000-000000000161')$$,
  'P0001','PAIRING_NOT_FOUND_OR_FORBIDDEN','revoke_display_pairing recusa telão pareado (não pode revogar nem a si mesmo)');

RESET ROLE;

-- Confirma que nenhuma das sete tentativas mutou nada -----------------------

SELECT is((SELECT status::text FROM public.queue WHERE id='40000000-0000-4000-8000-000000000161'),'pending','queue preservada após tentativas de escrita');
SELECT is((SELECT status FROM public.sessions WHERE id='20000000-0000-4000-8000-000000000161'),'active','session preservada após tentativas de escrita');
SELECT is((SELECT count(*)::int FROM private.display_pairing_codes WHERE session_id='20000000-0000-4000-8000-000000000161'),0,'nenhum código de pareamento foi cunhado pelo telão');
SELECT is((SELECT revoked_at FROM public.display_pairings WHERE session_id='20000000-0000-4000-8000-000000000161' AND auth_user_id='10000000-0000-4000-8000-000000000163'),NULL,'telão não conseguiu revogar o próprio pareamento');

SELECT * FROM finish();
ROLLBACK;
