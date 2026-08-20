BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(28);

INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000111','authenticated','authenticated','dpc-host-a@test.local','x'),
('10000000-0000-4000-8000-000000000112','authenticated','authenticated','dpc-host-b@test.local','x'),
('10000000-0000-4000-8000-000000000113','authenticated','authenticated','dpc-tv1@test.local','x'),
('10000000-0000-4000-8000-000000000114','authenticated','authenticated','dpc-tv2@test.local','x'),
('10000000-0000-4000-8000-000000000115','authenticated','authenticated','dpc-tv3@test.local','x');

INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000111','DPC111','10000000-0000-4000-8000-000000000111','active',NULL),
('20000000-0000-4000-8000-000000000112','DPC112','10000000-0000-4000-8000-000000000111','paused',NULL),
('20000000-0000-4000-8000-000000000113','DPC113','10000000-0000-4000-8000-000000000111','closed',now()),
('20000000-0000-4000-8000-000000000114','DPC114','10000000-0000-4000-8000-000000000112','active',NULL);

-- generate_display_pairing_code -----------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000111","role":"authenticated"}',true);
CREATE TEMP TABLE gen_active AS SELECT * FROM public.generate_display_pairing_code('20000000-0000-4000-8000-000000000111');
SELECT is((SELECT char_length(code) FROM gen_active),6,'código ativo tem 6 caracteres');
SELECT ok((SELECT (expires_at - now()) BETWEEN interval '4 minutes 55 seconds' AND interval '5 minutes 5 seconds' FROM gen_active),'expires_at ~5 minutos à frente');
CREATE TEMP TABLE gen_paused AS SELECT * FROM public.generate_display_pairing_code('20000000-0000-4000-8000-000000000112');
SELECT is((SELECT char_length(code) FROM gen_paused),6,'código gerado também em paused');
SELECT throws_ok($$SELECT * FROM public.generate_display_pairing_code('20000000-0000-4000-8000-000000000113')$$,'P0001','SESSION_CLOSED','sessão fechada rejeitada');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000112","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.generate_display_pairing_code('20000000-0000-4000-8000-000000000111')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','não-Host rejeitado');
RESET ROLE;

-- Índice único parcial: prova a garantia que impede colisão de código ativo. A
-- entropia real (33^6) impede forçar uma colisão de forma determinística num
-- teste black-box sem controlar random(); o índice em si é o que a RPC
-- depende para nunca inserir dois códigos ativos iguais.
SELECT throws_ok(
  $$INSERT INTO private.display_pairing_codes(session_id,code,expires_at,created_by)
    VALUES ('20000000-0000-4000-8000-000000000111',(SELECT code FROM gen_active),now()+interval '5 minutes','10000000-0000-4000-8000-000000000111')$$,
  '23505','duplicate key value violates unique constraint "display_pairing_codes_active_code_idx"','índice único parcial rejeita código ativo duplicado');

-- redeem_display_pairing_code --------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000113","role":"authenticated"}',true);
CREATE TEMP TABLE redeem_ok AS SELECT * FROM public.redeem_display_pairing_code('DPC111',(SELECT code FROM gen_active));
SELECT is((SELECT session_id FROM redeem_ok),'20000000-0000-4000-8000-000000000111'::uuid,'resgate válido retorna a sessão certa');
SELECT ok((SELECT paired FROM redeem_ok),'resgate válido retorna paired=true');
RESET ROLE;
SELECT is((SELECT consumed_at IS NOT NULL FROM private.display_pairing_codes WHERE session_id='20000000-0000-4000-8000-000000000111' AND consumed_by='10000000-0000-4000-8000-000000000113'),true,'código marcado consumido');
SELECT is((SELECT count(*)::int FROM public.display_pairings WHERE session_id='20000000-0000-4000-8000-000000000111' AND auth_user_id='10000000-0000-4000-8000-000000000113' AND revoked_at IS NULL),1,'display_pairings criado');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000114","role":"authenticated"}',true);
SELECT throws_ok($$SELECT * FROM public.redeem_display_pairing_code('DPC111',(SELECT code FROM gen_active))$$,'P0001','PAIRING_CODE_INVALID','código já consumido: mesmo resgate falha para outra TV (proxy de concorrência — ver relatório)');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.display_pairings WHERE session_id='20000000-0000-4000-8000-000000000111' AND auth_user_id='10000000-0000-4000-8000-000000000114'),0,'segunda TV não ganhou pareamento');

-- código expirado
INSERT INTO private.display_pairing_codes(session_id,code,expires_at,created_by)
VALUES ('20000000-0000-4000-8000-000000000112','EXPRD1',now()-interval '1 minute','10000000-0000-4000-8000-000000000111');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000114","role":"authenticated"}',true);
SELECT throws_ok($$SELECT * FROM public.redeem_display_pairing_code('DPC112','EXPRD1')$$,'P0001','PAIRING_CODE_INVALID','código expirado rejeitado');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.display_pairings WHERE session_id='20000000-0000-4000-8000-000000000112'),0,'código expirado não pareia');

-- código de sala inexistente: PAIRING_CODE_INVALID, não SESSION_NOT_FOUND
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000115","role":"authenticated"}',true);
SELECT throws_ok($$SELECT * FROM public.redeem_display_pairing_code('ZZZZZZ','ABCDEF')$$,'P0001','PAIRING_CODE_INVALID','sala inexistente colapsa em PAIRING_CODE_INVALID');
RESET ROLE;

-- isolamento entre sessões: código de uma sessão não vale para outra
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000112","role":"authenticated"}',true);
CREATE TEMP TABLE gen_for_isolation AS SELECT * FROM public.generate_display_pairing_code('20000000-0000-4000-8000-000000000114');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000115","role":"authenticated"}',true);
SELECT throws_ok($$SELECT * FROM public.redeem_display_pairing_code('DPC111',(SELECT code FROM gen_for_isolation))$$,'P0001','PAIRING_CODE_INVALID','código de outra sessão rejeitado (isolamento)');
RESET ROLE;

-- re-pareamento após revogação
UPDATE public.display_pairings SET revoked_at = now()
WHERE session_id='20000000-0000-4000-8000-000000000111' AND auth_user_id='10000000-0000-4000-8000-000000000113';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000111","role":"authenticated"}',true);
CREATE TEMP TABLE gen_repair AS SELECT * FROM public.generate_display_pairing_code('20000000-0000-4000-8000-000000000111');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000113","role":"authenticated"}',true);
CREATE TEMP TABLE redeem_repair AS SELECT * FROM public.redeem_display_pairing_code('DPC111',(SELECT code FROM gen_repair));
SELECT ok((SELECT paired FROM redeem_repair),'re-pareamento após revogação sucede');
RESET ROLE;
SELECT is((SELECT revoked_at FROM public.display_pairings WHERE session_id='20000000-0000-4000-8000-000000000111' AND auth_user_id='10000000-0000-4000-8000-000000000113'),NULL,'revoked_at volta a NULL após re-pareamento');

-- list_paired_displays ---------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000112","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.list_paired_displays('20000000-0000-4000-8000-000000000114')),0,'lista vazia');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000115","role":"authenticated"}',true);
SELECT public.redeem_display_pairing_code('DPC114',(SELECT code FROM gen_for_isolation));
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000112","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.list_paired_displays('20000000-0000-4000-8000-000000000114')),1,'lista com um pareamento');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000112","role":"authenticated"}',true);
CREATE TEMP TABLE gen_second_tv AS SELECT * FROM public.generate_display_pairing_code('20000000-0000-4000-8000-000000000114');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000114","role":"authenticated"}',true);
SELECT public.redeem_display_pairing_code('DPC114',(SELECT code FROM gen_second_tv));
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000112","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.list_paired_displays('20000000-0000-4000-8000-000000000114')),2,'lista com múltiplos pareamentos');
RESET ROLE;

UPDATE public.display_pairings SET revoked_at = now()
WHERE session_id='20000000-0000-4000-8000-000000000114' AND auth_user_id='10000000-0000-4000-8000-000000000115';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000112","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.list_paired_displays('20000000-0000-4000-8000-000000000114')),1,'pareamento revogado excluído da lista');
SELECT throws_ok($$SELECT * FROM public.list_paired_displays('20000000-0000-4000-8000-000000000111')$$,'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','não-Host recusado em list_paired_displays');
RESET ROLE;

-- pg_proc / ACL ------------------------------------------------------------

SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.generate_display_pairing_code(uuid)'::regprocedure),'postgres','generate owner postgres');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid='public.generate_display_pairing_code(uuid)'::regprocedure),'generate SECURITY DEFINER');
SELECT ok(has_function_privilege('authenticated','public.generate_display_pairing_code(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.generate_display_pairing_code(uuid)','EXECUTE'),'generate ACL mínima');
SELECT ok(has_function_privilege('authenticated','public.redeem_display_pairing_code(text,text)','EXECUTE') AND NOT has_function_privilege('anon','public.redeem_display_pairing_code(text,text)','EXECUTE'),'redeem ACL mínima');
SELECT ok(has_function_privilege('authenticated','public.list_paired_displays(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.list_paired_displays(uuid)','EXECUTE'),'list ACL mínima');

SELECT * FROM finish();
ROLLBACK;
