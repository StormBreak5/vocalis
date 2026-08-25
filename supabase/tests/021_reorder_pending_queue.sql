-- GATE — prova que reorder_queue permite ao Host reordenar só as entradas
-- 'pending' da própria sessão, preservando a posição relativa de entradas
-- 'preparing'/'singing' interleaved, recusa quando o conjunto de ids
-- enviado não bate exatamente com o conjunto pending atual
-- (INVALID_QUEUE_ORDER), e é negada para quem não é Host, sessão encerrada
-- ou identidade não autenticada.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(18);

INSERT INTO auth.users(id,aud,role,email,encrypted_password) VALUES
('10000000-0000-4000-8000-000000000701','authenticated','authenticated','rpq-host@test.local','x'),
('10000000-0000-4000-8000-000000000702','authenticated','authenticated','rpq-stranger@test.local','x'),
('10000000-0000-4000-8000-000000000703','authenticated','authenticated','rpq-singer-a@test.local','x'),
('10000000-0000-4000-8000-000000000704','authenticated','authenticated','rpq-singer-b@test.local','x'),
('10000000-0000-4000-8000-000000000705','authenticated','authenticated','rpq-singer-c@test.local','x'),
('10000000-0000-4000-8000-000000000706','authenticated','authenticated','rpq-singer-d@test.local','x');

INSERT INTO public.sessions(id,code,host_id,status,closed_at) VALUES
('20000000-0000-4000-8000-000000000711','RPQ711','10000000-0000-4000-8000-000000000701','active',NULL),
('20000000-0000-4000-8000-000000000712','RPQ712','10000000-0000-4000-8000-000000000701','closed',now());

-- Todos os 4 participantes ficam na sessão ativa (711) — a sessão fechada
-- (712) não precisa de participante/queue nenhum, já que o teste de
-- SESSION_CLOSED (SECTION E) recusa antes de tocar qualquer linha de queue.
INSERT INTO public.participants(id,session_id,display_name,auth_user_id) VALUES
('30000000-0000-4000-8000-000000000721','20000000-0000-4000-8000-000000000711','Singer A','10000000-0000-4000-8000-000000000703'),
('30000000-0000-4000-8000-000000000722','20000000-0000-4000-8000-000000000711','Singer B','10000000-0000-4000-8000-000000000704'),
('30000000-0000-4000-8000-000000000723','20000000-0000-4000-8000-000000000711','Singer C','10000000-0000-4000-8000-000000000705'),
('30000000-0000-4000-8000-000000000724','20000000-0000-4000-8000-000000000711','Singer D','10000000-0000-4000-8000-000000000706');

-- Fila da sessão ativa: A(pending,1), X(preparing,2), B(pending,3),
-- C(pending,4) — X está interleaved deliberadamente entre B e C para provar
-- que reordenar não perturba o rank dela.
INSERT INTO public.queue(id,session_id,participant_id,song_title,artist,status,position) VALUES
('40000000-0000-4000-8000-000000000731','20000000-0000-4000-8000-000000000711','30000000-0000-4000-8000-000000000721','Song A','Artist A','pending',1),
('40000000-0000-4000-8000-000000000732','20000000-0000-4000-8000-000000000711','30000000-0000-4000-8000-000000000722','Song X','Artist X','preparing',2),
('40000000-0000-4000-8000-000000000733','20000000-0000-4000-8000-000000000711','30000000-0000-4000-8000-000000000723','Song B','Artist B','pending',3),
('40000000-0000-4000-8000-000000000734','20000000-0000-4000-8000-000000000711','30000000-0000-4000-8000-000000000724','Song C','Artist C','pending',4);

-- SECTION A: Host reordena C,A,B (a ordem enviada) — X (preparing)
-- permanece intocada e continua "no meio" (posição 2), provando que o
-- conjunto de valores de position pending [1,3,4] só trocou de dono.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000701","role":"authenticated"}',true);
CREATE TEMP TABLE reordered AS
  SELECT * FROM public.reorder_queue(
    '20000000-0000-4000-8000-000000000711',
    ARRAY['40000000-0000-4000-8000-000000000734','40000000-0000-4000-8000-000000000731','40000000-0000-4000-8000-000000000733']::uuid[]
  );
SELECT is((SELECT count(*)::int FROM reordered),3,'reorder_queue devolve as 3 linhas pending afetadas');
SELECT is((SELECT position FROM reordered WHERE id='40000000-0000-4000-8000-000000000734'),1,'C (1º na nova ordem) fica com a menor position do pool pending (1)');
SELECT is((SELECT position FROM reordered WHERE id='40000000-0000-4000-8000-000000000731'),3,'A (2º na nova ordem) fica com a position do meio do pool pending (3)');
SELECT is((SELECT position FROM reordered WHERE id='40000000-0000-4000-8000-000000000733'),4,'B (3º na nova ordem) fica com a maior position do pool pending (4)');
SELECT is((SELECT position FROM public.queue WHERE id='40000000-0000-4000-8000-000000000732'),2,'X (preparing) mantém a própria position — nunca é tocada por reorder_queue');
SELECT is(
  (SELECT array_agg(id ORDER BY position) FROM public.queue WHERE session_id='20000000-0000-4000-8000-000000000711'),
  ARRAY['40000000-0000-4000-8000-000000000734','40000000-0000-4000-8000-000000000732','40000000-0000-4000-8000-000000000731','40000000-0000-4000-8000-000000000733']::uuid[],
  'ORDER BY position ASC agora lê C, X, A, B — X continua "antes" de A e B, exatamente como antes do reorder'
);
RESET ROLE;

-- SECTION B: conjunto de ids que não bate com o pending atual é recusado —
-- id ausente, id estranho (não pertence à sessão/não é pending) e
-- duplicata, todos como INVALID_QUEUE_ORDER.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000701","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.reorder_queue('20000000-0000-4000-8000-000000000711', ARRAY['40000000-0000-4000-8000-000000000734','40000000-0000-4000-8000-000000000731']::uuid[])$$,
  'P0001','INVALID_QUEUE_ORDER','array faltando um id pending é recusado');
SELECT throws_ok(
  $$SELECT * FROM public.reorder_queue('20000000-0000-4000-8000-000000000711', ARRAY['40000000-0000-4000-8000-000000000734','40000000-0000-4000-8000-000000000731','40000000-0000-4000-8000-000000000733','40000000-0000-4000-8000-000000000732']::uuid[])$$,
  'P0001','INVALID_QUEUE_ORDER','array incluindo a entrada preparing (não-pending) é recusado');
SELECT throws_ok(
  $$SELECT * FROM public.reorder_queue('20000000-0000-4000-8000-000000000711', ARRAY['40000000-0000-4000-8000-000000000734','40000000-0000-4000-8000-000000000734','40000000-0000-4000-8000-000000000731']::uuid[])$$,
  'P0001','INVALID_QUEUE_ORDER','array com id duplicado é recusado');
SELECT throws_ok(
  $$SELECT * FROM public.reorder_queue('20000000-0000-4000-8000-000000000711', ARRAY['99999999-0000-4000-8000-000000000000','40000000-0000-4000-8000-000000000731','40000000-0000-4000-8000-000000000733']::uuid[])$$,
  'P0001','INVALID_QUEUE_ORDER','array com id inexistente é recusado');
RESET ROLE;

-- SECTION C: caso trivial — reenviar a MESMA ordem atual (0 mudança
-- efetiva) é um no-op válido, não erro.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000701","role":"authenticated"}',true);
SELECT lives_ok(
  $$SELECT * FROM public.reorder_queue('20000000-0000-4000-8000-000000000711', ARRAY['40000000-0000-4000-8000-000000000734','40000000-0000-4000-8000-000000000731','40000000-0000-4000-8000-000000000733']::uuid[])$$,
  'reenviar a ordem atual (idempotente) não gera erro'
);
RESET ROLE;

-- SECTION D: não-Host é recusado -----------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000702","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.reorder_queue('20000000-0000-4000-8000-000000000711', ARRAY['40000000-0000-4000-8000-000000000734','40000000-0000-4000-8000-000000000731','40000000-0000-4000-8000-000000000733']::uuid[])$$,
  'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','identidade que não é Host da sessão é recusada');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000703","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.reorder_queue('20000000-0000-4000-8000-000000000711', ARRAY['40000000-0000-4000-8000-000000000734','40000000-0000-4000-8000-000000000731','40000000-0000-4000-8000-000000000733']::uuid[])$$,
  'P0001','SESSION_NOT_FOUND_OR_FORBIDDEN','o próprio participante dono de uma das músicas não pode reordenar a fila (só o Host pode)');
RESET ROLE;

-- SECTION E: sessão encerrada é recusada -----------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000701","role":"authenticated"}',true);
SELECT throws_ok(
  $$SELECT * FROM public.reorder_queue('20000000-0000-4000-8000-000000000712', ARRAY[]::uuid[])$$,
  'P0001','SESSION_CLOSED','sessão encerrada recusa reorder mesmo vindo do Host');
RESET ROLE;

-- SECTION F: sem identidade autenticada é recusado -------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok(
  $$SELECT * FROM public.reorder_queue('20000000-0000-4000-8000-000000000711', ARRAY[]::uuid[])$$,
  'P0001','AUTH_REQUIRED','sem identidade autenticada é recusado');
RESET ROLE;

-- SECTION G: ACL da função --------------------------------------------------

SELECT ok(to_regprocedure('public.reorder_queue(uuid,uuid[])') IS NOT NULL,'reorder_queue existe');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.reorder_queue(uuid,uuid[])'::regprocedure),'postgres','owner é postgres');
SELECT ok(
  has_function_privilege('authenticated','public.reorder_queue(uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('anon','public.reorder_queue(uuid,uuid[])','EXECUTE'),
  'ACL mínima: authenticated sim, anon não');

SELECT * FROM finish();
ROLLBACK;
