BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(18);

SELECT ok(EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='private'),'schema private existe');
SELECT is((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='private'),'postgres','owner private');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='private' AND a.grantee=0 AND a.privilege_type='CREATE') AND NOT has_schema_privilege('anon','private','CREATE') AND NOT has_schema_privilege('authenticated','private','CREATE'),'sem CREATE web');
SELECT ok(to_regprocedure('private.enforce_session_state_transition()') IS NOT NULL,'função terminal existe');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='private.enforce_session_state_transition()'::regprocedure),'postgres','owner da função');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='private.enforce_session_state_transition()'::regprocedure),'SECURITY INVOKER');
SELECT is((SELECT provolatile::text FROM pg_proc WHERE oid='private.enforce_session_state_transition()'::regprocedure),'v','VOLATILE');
SELECT is((SELECT proconfig[1] FROM pg_proc WHERE oid='private.enforce_session_state_transition()'::regprocedure),'search_path=""','search_path vazio');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='private.enforce_session_state_transition()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'),'sem EXECUTE público');
SELECT ok(EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='sessions_enforce_state_transition' AND NOT tgisinternal),'trigger vinculado');
SELECT ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname='sessions_status_check' AND conrelid='public.sessions'::regclass),'constraint status');
SELECT ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname='sessions_closed_at_coherence_check' AND conrelid='public.sessions'::regclass),'constraint coerência');

INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','inv-host@test.local','x');
INSERT INTO public.sessions(id,code,host_id,status) VALUES ('20000000-0000-4000-8000-000000000001','INV001','10000000-0000-4000-8000-000000000001','active');
SELECT lives_ok($$UPDATE public.sessions SET status='paused' WHERE id='20000000-0000-4000-8000-000000000001'$$,'active para paused');
SELECT lives_ok($$UPDATE public.sessions SET status='closed',closed_at=clock_timestamp() WHERE id='20000000-0000-4000-8000-000000000001'$$,'paused para closed');
SELECT throws_ok($$UPDATE public.sessions SET status='active',closed_at=NULL WHERE id='20000000-0000-4000-8000-000000000001'$$,'P0001','SESSION_CLOSED_TERMINAL','reabertura bloqueada');
SELECT throws_ok($$UPDATE public.sessions SET closed_at=closed_at+interval '1 second' WHERE id='20000000-0000-4000-8000-000000000001'$$,'P0001','SESSION_CLOSED_TERMINAL','primeiro closed_at imutável');
SELECT throws_ok($$UPDATE public.sessions SET closed_at=NULL WHERE id='20000000-0000-4000-8000-000000000001'$$,'P0001','SESSION_CLOSED_TERMINAL','remoção de closed_at bloqueada');
SELECT throws_ok($$INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES ('20000000-0000-4000-8000-000000000002','INV002','10000000-0000-4000-8000-000000000001','active',now())$$,'23514',NULL,'coerência rejeita active com timestamp');
SELECT * FROM finish();
ROLLBACK;
