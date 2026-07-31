# Tasks: Encerramento de Sessão

**Feature**: `003-close-session`  
**Fontes**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pré-requisitos**: não existe NEEDS CLARIFICATION. O01, S01, S02 e O02 estão refletidos em tarefas executáveis, com stack local anterior ao harness, matriz comportamental de RLS de `sessions`, negativas DML e comandos literais. Migrations, aplicações e gates são sequenciais e nunca recebem `[P]`.

## Phase 1 — Setup

Preparação estritamente necessária, incluindo a infraestrutura local determinística antes de qualquer corrida.

- [ ] T001 Verificar `git branch --show-current`, trocar ou criar a branch `003-close-session` da base aprovada e registrar branch/base em `specs/003-close-session/validation/baseline.md`
- [ ] T002 [P] Validar versões e scripts atuais de lint, typecheck, Vitest, Playwright, build e shadcn em `package.json`, `package-lock.json` e `components.json`
- [ ] T003 Restaurar a Supabase CLI pela estratégia única do plano: se `package.json`/`package-lock.json` já fixarem `supabase@2.106.0`, executar `npm ci`; se a dependência ainda estiver ausente, executar uma única vez `npm install --save-dev --save-exact supabase@2.106.0`; exigir `npx --no-install supabase --version` = `2.106.0` e, em ausência/divergência, interromper com essas instruções objetivas em `specs/003-close-session/validation/supabase-cli-preflight.md`
- [ ] T004 Executar somente o preflight não mutável da CLI: exigir `npx --no-install supabase --version` = `2.106.0` e inspecionar suporte com `npx --no-install supabase migration --help`, `npx --no-install supabase migration up --help`, `npx --no-install supabase migration list --help`, `npx --no-install supabase db reset --help`, `npx --no-install supabase test db --help` e `npx --no-install supabase gen types --help`; validar em `supabase/config.toml` que os comandos posteriores serão local-only, falhar objetivamente se CLI/versão/subcomando estiver ausente e registrar em `specs/003-close-session/validation/supabase-cli-preflight.md`
- [ ] T005 Habilitar somente `auth.enable_anonymous_sign_ins` para o ambiente local aprovado em `supabase/config.toml`
- [ ] T006 Iniciar exclusivamente a stack local com `npx --no-install supabase start`, rejeitar qualquer opção `--linked`/`--db-url` e registrar somente versão/estado sanitizado dos serviços em `specs/003-close-session/validation/supabase-local-runtime.md`
- [ ] T007 Executar `npx --no-install supabase status -o env` somente para confirmar Database/Auth/Realtime locais e validar sem exibir credenciais que o DB reportado é loopback/porta local; descartar a saída ao fim desta tarefa, não definir nem persistir `SUPABASE_TEST_DB_URL` e registrar apenas evidência sanitizada em `specs/003-close-session/validation/supabase-local-runtime.md`
- [ ] T008 Instalar `pg` e `@types/pg` como devDependencies com lock reproduzível em `package.json` e `package-lock.json`
- [ ] T009 Escrever primeiro os testes Node/Vitest do harness para URL local obrigatória, bloqueio de produção/remoto, três clients, timeouts, barreira observada e cleanup em `src/infrastructure/__tests__/supabase/postgres-race-harness.test.ts`
- [ ] T010 Implementar leitura process-scoped de `SUPABASE_TEST_DB_URL`, validação loopback/porta de `supabase/config.toml`, bloqueio de produção/TLS/remoto e falha amigável sem banco local em `src/infrastructure/__tests__/supabase/postgres-race-harness.ts`
- [ ] T011 Implementar `txA`, `txB` e `observer` como três `pg.Client` persistentes com connection/lock/statement/idle timeouts em `src/infrastructure/__tests__/supabase/postgres-race-harness.ts`
- [ ] T012 Implementar BEGIN, claims transacionais, captura de PIDs e barreira determinística baseada em `pg_blocking_pids`, sem timing como autoridade, em `src/infrastructure/__tests__/supabase/postgres-race-harness.ts`
- [ ] T013 Implementar fixtures isoladas, rollback/remoção/`Client.end()` em `finally` e registry de segurança em `afterAll` em `src/infrastructure/__tests__/supabase/postgres-race-harness.ts`
- [ ] T014 Criar `scripts/test-db-race-local.ps1` e ligar `test:db:race` em `package.json`: no mesmo processo PowerShell que inicia o Vitest, executar `npx --no-install supabase status -o env`, extrair `DB_URL` em memória, aceitar somente `localhost`/`127.0.0.1` e a porta de `supabase/config.toml`, abortar remoto/TLS/produção, disponibilizar `SUPABASE_TEST_DB_URL` apenas ao processo Vitest filho imediatamente iniciado e removê-la em `finally`, sem persistir ou registrar o segredo
- [ ] T015 Executar somente após T006–T014 `npx vitest run src/infrastructure/__tests__/supabase/postgres-race-harness.test.ts` e `npm run typecheck`; validar o bootstrap process-scoped, rejeição remota, três clients/barreira/cleanup e ausência de credencial persistida sem iniciar ainda as corridas da feature
- [ ] T016 [P] Adicionar o AlertDialog shadcn/ui base-nova em `src/components/ui/alert-dialog.tsx`
- [ ] T017 [P] Preparar fixtures JWT Host/participante/externo, limpeza service-role e snapshots em `src/infrastructure/__tests__/supabase/session-closure.helpers.ts`
- [ ] T018 [P] Preparar fixture Playwright com Host, dois participantes, Session por teste e cleanup em `e2e/fixtures/session-closure.fixture.ts`

**Checkpoint**: CLI validada sem mutação, stack Supabase exclusivamente local pronta, URL process-scoped validada, harness executado e fixtures preparadas.

## Phase 2 — Foundational

Tipos, erros, validação e estado compartilhado bloqueantes para todas as histórias.

- [ ] T019 [P] Completar SessionStatus, ClosedSession, CloseSessionInput, CloseSessionResult, HostSessionDetails, DTOs das RPCs de status, snapshot, payload e lifecycle sem `any` em `src/domain/session.types.ts`
- [ ] T020 [P] Adicionar AUTH_REQUIRED, SESSION_NOT_FOUND_OR_FORBIDDEN, QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN, INVALID_SESSION_STATE, OFFLINE e SESSION_CLOSED com mensagens aprovadas em `src/domain/errors.types.ts`
- [ ] T021 Escrever testes inicialmente falhos da tradução sanitizada e erros indistinguíveis em `src/application/__tests__/session-error.mapper.test.ts`
- [ ] T022 Implementar o mapper imediatamente após seu teste em `src/application/session/session-error.mapper.ts`
- [ ] T023 Escrever testes inicialmente falhos de UUID, status/closed_at, DTOs Host/status e payload Realtime em `src/domain/__tests__/session-lifecycle.test.ts`
- [ ] T024 Implementar schemas Zod e guards unknown→typed imediatamente após seu teste em `src/domain/session-lifecycle.ts`
- [ ] T025 [P] Criar mocks tipados de canal, auth, token refresh e Postgres Changes em `src/hooks/__tests__/session-lifecycle.mocks.ts`
- [ ] T026 Escrever testes inicialmente falhos do reducer, closed terminal, deduplicação, epoch e writesAllowed fail-closed em `src/hooks/__tests__/session-lifecycle.reducer.test.ts`
- [ ] T027 Implementar o reducer imediatamente após seu teste em `src/hooks/session-lifecycle.reducer.ts`
- [ ] T028 Escrever testes inicialmente falhos do provider, snapshot e capabilities em `src/components/__tests__/SessionLifecycleProvider.test.tsx`
- [ ] T029 Criar SessionLifecycleProvider/useSessionLifecycleContext imediatamente após seu teste em `src/components/session/SessionLifecycleProvider.tsx`
- [ ] T030 Executar `npx vitest run src/application/__tests__/session-error.mapper.test.ts src/domain/__tests__/session-lifecycle.test.ts src/hooks/__tests__/session-lifecycle.reducer.test.ts src/components/__tests__/SessionLifecycleProvider.test.tsx` e `npm run typecheck` de `package.json`

**Checkpoint**: todos os módulos importados por testes Foundational existem antes do typecheck da fase.

## Phase 3 — User Story 1: Host encerra a sala definitivamente (P1) — MVP

**Objetivo**: Owner encerra active/paused com confirmação, idempotência, autorização e preservação.

**Teste independente**: Owner encerra active/paused; repetições e concorrência preservam um closed_at; outro usuário falha; Participant/Queue permanecem.
- [ ] T031 [US1] Escrever invariantes permanentes em `supabase/tests/003_session_closure_invariants.sql` para status `active|paused|closed`, coerência de `closed_at`, compatibilidade dos dados, transições válidas e inspeção/ACL/comportamento de `private.enforce_session_state_transition()` conforme o plano
- [ ] T032 [US1] Preservar `supabase/tests/003_private_schema_post_015.sql` sem editar ou apagar e registrar em `specs/003-close-session/validation/gate-015.md` a instrução exata “não executar neste gate; preservar o arquivo”; o teste histórico não participa de nenhum gate
- [ ] T033 [US1] Escrever a ACL permanente pós-cutover em `supabase/tests/003_session_rls_helpers.sql`: owner do schema, USAGE mínimo de `authenticated`, ausência de CREATE para papéis web e EXECUTE somente nas funções aprovadas
- [ ] T034 [US1] Estender `supabase/tests/003_session_rls_helpers.sql` com catálogo dos três helpers UUID→boolean, owner `postgres`, SQL/STABLE/SECURITY DEFINER/PARALLEL UNSAFE, `search_path=''`, qualification e ACL exata
- [ ] T035 [US1] Estender `supabase/tests/003_session_rls_helpers.sql` com Host/member/external/null × active/paused/closed/missing/cross-session, retorno false seguro, leitura necessária ao Realtime e matriz sem recursão
- [ ] T036 [US1] Escrever o contrato de `public.join_session(p_code text,p_display_name text) RETURNS jsonb`, DTO sanitizado e active/paused/closed em `supabase/tests/003_join_session_contract.sql`
- [ ] T037 [US1] Estender `supabase/tests/003_join_session_contract.sql` com assinatura única, owner `postgres`, SECURITY DEFINER, VOLATILE, PARALLEL UNSAFE e `search_path=''` via `pg_proc`
- [ ] T038 [US1] Estender `supabase/tests/003_join_session_contract.sql` com ACL authenticated-only e negativas de EXECUTE para PUBLIC e anon
- [ ] T039 [US1] Estender `supabase/tests/003_join_session_contract.sql` com `auth.uid()`, entrada/recovery active, paused sem mutação, capacidade, validação e isolamento cross-session
- [ ] T040 [US1] Estender `supabase/tests/003_join_session_contract.sql` com SESSION_CLOSED antes de INSERT/`last_seen`, mensagem “Esta sala já foi encerrada.” e prova de nenhuma Participant criada ou alterada
- [ ] T041 [US1] Escrever o contrato de `public.create_queue_entry(p_session_id uuid,p_song_title varchar,p_artist varchar) RETURNS TABLE(...)` em `supabase/tests/003_create_queue_entry_contract.sql`
- [ ] T042 [US1] Estender `supabase/tests/003_create_queue_entry_contract.sql` com assinatura/retorno exatos, owner `postgres`, SECURITY DEFINER, VOLATILE, PARALLEL UNSAFE e `search_path=''`
- [ ] T043 [US1] Estender `supabase/tests/003_create_queue_entry_contract.sql` com ACL authenticated-only e negativas de EXECUTE para PUBLIC e anon
- [ ] T044 [US1] Estender `supabase/tests/003_create_queue_entry_contract.sql` com `auth.uid()`, Participant vinculado, active, paused, Microfone Justo, limites, posição e isolamento cross-session
- [ ] T045 [US1] Estender `supabase/tests/003_create_queue_entry_contract.sql` com SESSION_CLOSED antes de qualquer lookup mutável, mensagem amigável e prova de nenhum Queue insert/evento
- [ ] T046 [US1] Escrever o contrato de `public.cancel_queue_entry(p_queue_id uuid) RETURNS void` e resultado `AppSuccess<void>` em `supabase/tests/003_cancel_queue_entry_contract.sql`
- [ ] T047 [US1] Estender `supabase/tests/003_cancel_queue_entry_contract.sql` com assinatura/void, owner `postgres`, SECURITY DEFINER, VOLATILE, PARALLEL UNSAFE e `search_path=''` via `pg_proc`
- [ ] T048 [US1] Estender `supabase/tests/003_cancel_queue_entry_contract.sql` com ACL authenticated-only e negativas de EXECUTE para PUBLIC e anon
- [ ] T049 [US1] Estender `supabase/tests/003_cancel_queue_entry_contract.sql` com `auth.uid()`, Participant/Host owner, active/paused, transições permitidas, status inválido e isolamento cross-session
- [ ] T050 [US1] Estender `supabase/tests/003_cancel_queue_entry_contract.sql` com SESSION_CLOSED, mensagem amigável e prova de status/posição/timestamps inalterados
- [ ] T051 [P] [US1] Escrever contrato, assinatura `public.update_queue_status(p_queue_id uuid,p_new_status text)`, DTO, owner/search_path/ACL e autorização Host-only em `supabase/tests/003_update_queue_status.sql`
- [ ] T052 [US1] Estender `supabase/tests/003_update_queue_status.sql` com transições permitidas, terminais, mesmo status idempotente, SESSION_CLOSED e nenhuma mutação/evento indevido
- [ ] T053 [P] [US1] Escrever contrato, assinatura `public.update_session_status(p_session_id uuid,p_new_status text)`, DTO, owner/search_path/ACL e autorização Host-only em `supabase/tests/003_update_session_status.sql`
- [ ] T054 [US1] Estender `supabase/tests/003_update_session_status.sql` com active→paused, paused→active, mesmos estados idempotentes, target closed inválido e Session closed rejeitada
- [ ] T055 [P] [US1] Escrever pgTAP de `public.close_session(p_session_id uuid)`, DTO, auth/ownership, erro indistinguível, idempotência, primeiro `closed_at`, segurança e preservação em `supabase/tests/003_close_session_security.sql`
- [ ] T056 [P] [US1] Escrever pgTAP de `public.get_host_session_details(p_session_id uuid)`, sem overload, `auth.uid()`, ownership, DTO de sete campos, negativas e ACL em `supabase/tests/003_host_session_details.sql`
- [ ] T057 [US1] Escrever corrida pareada close×close nas duas ordens com txA/txB/observer, barreira `pg_blocking_pids`, um `changed=true`, um `changed=false` e um `closed_at` em `src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts`
- [ ] T058 [US1] Estender `src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts` com uma primeira chamada `changed=true` e exatamente 19 retries autenticados sequenciais `changed=false`, todos com o primeiro `closed_at` e sem efeito colateral
- [ ] T059 [US1] Escrever close×join nas duas ordens, Session-first e asserções pós-commit em `src/infrastructure/__tests__/session-writer-races.integration.test.ts`
- [ ] T060 [US1] Estender `src/infrastructure/__tests__/session-writer-races.integration.test.ts` com close×create_queue_entry nas duas ordens e asserção pós-commit
- [ ] T061 [US1] Estender `src/infrastructure/__tests__/session-writer-races.integration.test.ts` com close×cancel_queue_entry nas duas ordens e nenhuma mutação após closed
- [ ] T062 [US1] Estender `src/infrastructure/__tests__/session-writer-races.integration.test.ts` com close×update_session_status para pause nas duas ordens
- [ ] T063 [US1] Estender `src/infrastructure/__tests__/session-writer-races.integration.test.ts` com close×update_session_status para resume nas duas ordens
- [ ] T064 [US1] Estender `src/infrastructure/__tests__/session-writer-races.integration.test.ts` com close×update_queue_status nas duas ordens, revalidação pós-lock e ausência de deadlock
- [ ] T065 [US1] Escrever em `supabase/tests/003_session_privileges.sql` negativas de INSERT/UPDATE/DELETE direto, encerramento/reabertura direta, remoção/substituição de `closed_at`, participante/outro Host e positivas somente pelas RPCs autorizadas
- [ ] T066 [US1] Criar `supabase/migrations/20260729100000_015_session_closure_atomic.sql` com `BEGIN`, preflight, suporte a closed/closed_at, default/constraint coerentes e compatibilidade sem fabricar timestamp; não aplicar o arquivo antes de todas as tarefas T067–T084
- [ ] T067 [US1] Adicionar `CREATE SCHEMA IF NOT EXISTS private`, owner/ACL permanentes e os três helpers RLS qualificados com revokes/grants mínimos em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T068 [US1] Criar `private.enforce_session_state_transition() RETURNS trigger` e o trigger terminal com SECURITY INVOKER, owner `postgres`, `search_path=''`, qualification e nenhum EXECUTE web em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T069 [US1] Reescrever `public.join_session(text,text) RETURNS jsonb` com `auth.uid()`, lock Session-first, active/recovery, paused/closed sem mutação e DTO sanitizado em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T070 [US1] Aplicar owner/search_path/qualification, REVOKE ALL e GRANT EXECUTE authenticated-only à assinatura `join_session(text,text)` em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T071 [US1] Reescrever `public.create_queue_entry(uuid,varchar,varchar) RETURNS TABLE(...)` com `auth.uid()`, Session-first, paused/closed, Microfone Justo e posição em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T072 [US1] Aplicar owner/search_path/qualification, REVOKE ALL e GRANT EXECUTE authenticated-only à assinatura `create_queue_entry(uuid,varchar,varchar)` em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T073 [US1] Reescrever `public.cancel_queue_entry(uuid) RETURNS void` com `auth.uid()`, lock Session→Queue, autorização Participant/Host, active/paused e closed sem mutação em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T074 [US1] Aplicar owner/search_path/qualification, REVOKE ALL e GRANT EXECUTE authenticated-only à assinatura `cancel_queue_entry(uuid)` em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T075 [US1] Criar `public.update_queue_status(p_queue_id uuid,p_new_status text)` com Session→Queue, Host por `auth.uid()`, transições, closed, idempotência e DTO em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T076 [US1] Aplicar owner/search_path/qualification, REVOKE ALL e GRANT EXECUTE authenticated-only a `update_queue_status(uuid,text)` em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T077 [US1] Criar `public.update_session_status(p_session_id uuid,p_new_status text)` com Host por `auth.uid()`, Session lock, active↔paused, idempotência e impossibilidade de definir/alterar closed em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T078 [US1] Aplicar owner/search_path/qualification, REVOKE ALL e GRANT EXECUTE authenticated-only a `update_session_status(uuid,text)` em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T079 [US1] Criar `public.get_host_session_details(p_session_id uuid)` STABLE SECURITY DEFINER sem overload, ownership por `auth.uid()` e DTO sanitizado de sete campos em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T080 [US1] Aplicar owner/search_path/qualification, REVOKE ALL e GRANT EXECUTE authenticated-only a `get_host_session_details(uuid)` em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T081 [US1] Criar `public.close_session(p_session_id uuid)` idempotente, Session-locking, autorização por `auth.uid()`, active|paused→closed e DTO com o primeiro `closed_at` em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T082 [US1] Aplicar owner `postgres`, SECURITY DEFINER, `search_path=''`, qualification, REVOKE ALL e GRANT EXECUTE authenticated-only a `close_session(uuid)` em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T083 [US1] Executar `REVOKE INSERT, UPDATE, DELETE ON TABLE public.sessions, public.participants, public.queue FROM PUBLIC, anon, authenticated` e remover qualquer grant incompatível que permita criar/reverter closed ou mutar fila depois de closed em `supabase/migrations/20260729100000_015_session_closure_atomic.sql`
- [ ] T084 [US1] Fechar `supabase/migrations/20260729100000_015_session_closure_atomic.sql` com auditoria de ordem e `COMMIT` somente após schema, invariantes, todos os writers, `close_session` e revokes; provar por revisão que nenhum estado parcial é implantável
- [ ] T085 [US1] Aplicar a migration atômica 015 ao Supabase local com `npx --no-install supabase migration up --local` e registrar saída sanitizada em `specs/003-close-session/validation/migration-015.md`
- [ ] T086 [US1] Executar `npx --no-install supabase migration list --local`, confirmar `20260729100000` aplicado e registrar a history em `specs/003-close-session/validation/migration-015.md`
- [ ] T087 [US1] Executar imediatamente o gate SQL pós-015, nesta ordem: `npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local`; `npx --no-install supabase test db supabase/tests/003_session_rls_helpers.sql --local`; `npx --no-install supabase test db supabase/tests/003_join_session_contract.sql --local`; `npx --no-install supabase test db supabase/tests/003_create_queue_entry_contract.sql --local`; `npx --no-install supabase test db supabase/tests/003_cancel_queue_entry_contract.sql --local`; `npx --no-install supabase test db supabase/tests/003_update_queue_status.sql --local`; `npx --no-install supabase test db supabase/tests/003_update_session_status.sql --local`; `npx --no-install supabase test db supabase/tests/003_host_session_details.sql --local`; `npx --no-install supabase test db supabase/tests/003_close_session_security.sql --local`; `npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local`; não executar neste gate; preservar o arquivo `supabase/tests/003_private_schema_post_015.sql`; registrar em `specs/003-close-session/validation/gate-015.md`
- [ ] T088 [US1] Regenerar tipos pós-015 com `npx --no-install supabase gen types typescript --local --schema public > src/infrastructure/supabase/database.types.ts` antes de compilar qualquer consumidor das RPCs
- [ ] T089 [US1] Verificar todas as RPCs, `sessions.status`/`closed_at` e DTOs em `src/infrastructure/supabase/database.types.ts`, manter o cliente `Database` sem `any`/cast amplo e executar `npm run typecheck`
- [ ] T090 [US1] Executar `npm run test:db:race` para close×close/join/create/cancel/pause/resume/update-queue nas duas ordens e um close + 19 retries sequenciais; exigir barreira observada, um único `closed_at` e nenhum writer após commit de closed, registrando em `specs/003-close-session/validation/gate-015-concurrency.md`
- [ ] T091 [US1] Concluir o gate atômico em `specs/003-close-session/validation/gate-015.md`: confirmar invariantes, todos os writers, `close_session`, privilégios diretos, reabertura e alteração/remoção de `closed_at`; bloquear criação ou aplicação da migration 016 enquanto qualquer asserção falhar
- [ ] T092 [US1] Escrever testes de projeção mínima, `getHostSessionDetails(sessionId)`, DTO e negativas em `src/infrastructure/__tests__/session.queries.test.ts`
- [ ] T093 [US1] Implementar projeções id/code/status/closed_at e Host RPC tipada, sem SELECT amplo, em `src/infrastructure/supabase/queries/session.queries.ts`
- [ ] T094 [US1] Executar `npx vitest run src/infrastructure/__tests__/session.queries.test.ts` e `npm run typecheck`
- [ ] T095 [US1] Escrever testes de consulta inicial/resync, offline, payload inválido e acesso negado em `src/application/__tests__/get-session-status.action.test.ts`
- [ ] T096 [US1] Implementar consulta inicial/resync tipada e fail-closed em `src/application/session/get-session-status.action.ts`
- [ ] T097 [US1] Executar `npx vitest run src/application/__tests__/get-session-status.action.test.ts` e `npm run typecheck`
- [ ] T098 [US1] Escrever testes da action tipada `update_queue_status`, DTO interno, AppSuccess público, autorização/closed/idempotência e erro amigável em `src/application/__tests__/update-queue-status.action.test.ts`
- [ ] T099 [US1] Substituir UPDATE direto pela RPC `update_queue_status` em `src/application/queue/update-queue-status.action.ts`
- [ ] T100 [US1] Executar `npx vitest run src/application/__tests__/update-queue-status.action.test.ts` e `npm run typecheck`
- [ ] T101 [US1] Escrever testes da action tipada `update_session_status`, active↔paused, idempotência, closed/target closed e autorização em `src/application/__tests__/update-session-status.action.test.ts`
- [ ] T102 [US1] Substituir UPDATE direto pela RPC `update_session_status` em `src/application/session/update-session-status.action.ts`
- [ ] T103 [US1] Executar `npx vitest run src/application/__tests__/update-session-status.action.test.ts` e `npm run typecheck`
- [ ] T104 [US1] Substituir leituras amplas por projeção mínima/Host RPC mantendo Server Components em `app/sala/[code]/dj/page.tsx` e `app/sala/[code]/page.tsx`
- [ ] T105 [US1] Executar o gate de aplicação compatível com queries/status/actions, `npm run typecheck` e `npm run build`, registrando em `specs/003-close-session/validation/gate-015-application.md` antes da contração de leitura
- [ ] T106 [US1] Escrever matriz comportamental de sessions em `supabase/tests/003_sessions_rls.sql` para Host/member/external × active/paused/closed, UUID/código conhecido, colunas mínimas, Realtime e ausência de recursão/policy residual
- [ ] T107 [P] [US1] Escrever matriz RLS de participants para Host/member/external × open/closed, colunas, Realtime, recursão e UPDATE/DELETE em `supabase/tests/003_participants_rls.sql`
- [ ] T108 [P] [US1] Escrever matriz RLS de queue para Host/member/external × open/closed, IDs conhecidos, isolamento, recursão e INSERT/UPDATE/DELETE em `supabase/tests/003_queue_rls.sql`
- [ ] T109 [US1] Escrever catálogo exato de `pg_policies`, ausência das cinco policies legadas, quatro policies SELECT finais, duas deny preservadas e nenhum USING/WITH CHECK true em `supabase/tests/003_policy_catalog.sql`
- [ ] T110 [US1] Criar `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql` com `BEGIN` e escopo exclusivo de policies finais, grants mínimos de leitura, publication Realtime e schema reload; proibir alterações de status, writers ou `close_session` neste arquivo
- [ ] T111 [US1] Executar antes de qualquer CREATE POLICY os DROP de `sessions_select_public` e `sessions_update_own` em `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`
- [ ] T112 [US1] Executar antes de qualquer CREATE POLICY o DROP de `participants_select_session` em `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`
- [ ] T113 [US1] Executar antes de qualquer CREATE POLICY os DROP de `"Users can read active queue of their session"` e `"Host can update queue"` em `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`
- [ ] T114 [US1] Executar REVOKE SELECT de tabela em sessions e revokes de leitura incompatíveis em participants/queue antes dos grants mínimos em `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`
- [ ] T115 [US1] Conceder somente SELECT(id,code,status,closed_at) de sessions a anon/authenticated e SELECT aprovado de participants/queue a authenticated sob RLS, sem grant amplo ao Host, em `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`
- [ ] T116 [US1] Criar `sessions_select_open` e `sessions_select_owned_or_member` com roles/USING exatos e sem USING/WITH CHECK true em `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`
- [ ] T117 [US1] Criar `participants_select_authorized_open_or_host` somente após seus testes, usando helpers aprovados, em `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`
- [ ] T118 [US1] Criar `queue_select_authorized_open_or_host`, preservar as duas deny policies e manter writes diretos revogados em `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`
- [ ] T119 [US1] Adicionar `public.sessions` idempotentemente à publication, solicitar schema reload e executar `COMMIT` em `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`, confirmando que o arquivo contém somente o cutover final de RLS/leitura/Realtime
- [ ] T120 [US1] Aplicar a migration 016 ao Supabase local com `npx --no-install supabase migration up --local` e registrar saída sanitizada em `specs/003-close-session/validation/migration-016.md`
- [ ] T121 [US1] Executar `npx --no-install supabase migration list --local`, confirmar `20260729101000` aplicado e registrar a history em `specs/003-close-session/validation/migration-016.md`
- [ ] T122 [US1] Regenerar tipos finais com `npx --no-install supabase gen types typescript --local --schema public > src/infrastructure/supabase/database.types.ts`
- [ ] T123 [US1] Verificar close/session/Host/writer RPCs, `status`/`closed_at` e DTOs finais em `src/infrastructure/supabase/database.types.ts`, mantendo `Database` sem `any`/cast amplo
- [ ] T124 [US1] Criar somente após os tipos finais o teste tipado de publication e entrega Realtime via `close_session` para Host/member positiva e externo negativa em `src/infrastructure/__tests__/session-realtime.integration.test.ts`
- [ ] T125 [US1] Executar `npm run typecheck` e avançar somente se `src/infrastructure/__tests__/session-realtime.integration.test.ts` compilar com `close_session` presente em `Database`
- [ ] T126 [US1] Executar o gate final de banco, RLS, grants e Realtime pós-016, nesta ordem: `npx --no-install supabase test db supabase/tests/003_session_rls_helpers.sql --local`; `npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local`; `npx --no-install supabase test db supabase/tests/003_policy_catalog.sql --local`; `npx --no-install supabase test db supabase/tests/003_sessions_rls.sql --local`; `npx --no-install supabase test db supabase/tests/003_participants_rls.sql --local`; `npx --no-install supabase test db supabase/tests/003_queue_rls.sql --local`; `npx vitest run src/infrastructure/__tests__/session-realtime.integration.test.ts`; não executar neste gate; preservar o arquivo `supabase/tests/003_private_schema_post_015.sql`; registrar em `specs/003-close-session/validation/gate-016.md`
- [ ] T127 [US1] Escrever E2E inicialmente falho do Host para active/paused, confirmação/cancelamento, duplo envio, outro Host e resposta perdida em `e2e/close-session-host.spec.ts`
- [ ] T128 [US1] Escrever testes da close action, resposta incerta, ausência de sucesso otimista e retry bloqueado até resync em `src/application/__tests__/close-session.action.test.ts`
- [ ] T129 [US1] Implementar `closeSessionAction` usando a RPC tipada em `src/application/session/close-session.action.ts`
- [ ] T130 [US1] Executar `npx vitest run src/application/__tests__/close-session.action.test.ts` e `npm run typecheck`
- [ ] T131 [US1] Escrever testes do botão Host-only/destructive/48px/confirmação/loading/clique duplicado, feedback acessível, resposta incerta, nenhum sucesso otimista e retry pós-resync em `src/components/__tests__/CloseSessionButton.test.tsx`
- [ ] T132 [US1] Implementar `CloseSessionButton` com loading, feedback de erro/incerteza, deduplicação, offline e retry pós-resync em `src/components/session/CloseSessionButton.tsx`
- [ ] T133 [US1] Executar `npx vitest run src/components/__tests__/CloseSessionButton.test.tsx` e `npm run typecheck`; exigir feedback visível/acessível e nenhum sucesso otimista
- [ ] T134 [US1] Integrar o botão na área destrutiva, sem usar ocultação visual como autorização, em `app/sala/[code]/dj/page.tsx`
- [ ] T135 [US1] Executar `npx playwright test e2e/close-session-host.spec.ts` e registrar migrations 015/016, histories, gates, tipos, RPCs, policies e harness em `specs/003-close-session/validation/us1.md`

**Checkpoint US1**: Owner encerra; a migration atômica 015 e seu gate bloqueante passam antes da migration final 016; idempotência, writers, privilégios, RLS e Realtime estão validados.
## Phase 4 — User Story 2: Todos recebem o encerramento sem F5 (P1)

**Objetivo**: Host e participantes autorizados recebem closed por Realtime e veem modal não dispensável.

**Teste independente**: Três contextos recebem o modal sem F5; externo não recebe; modal não fecha.

- [ ] T136 [US2] Escrever testes do canal para JWT, topic, sessions/UPDATE, filtro, colunas e todos `.on()` antes de `.subscribe()` em `src/hooks/__tests__/useSessionLifecycle.test.tsx`
- [ ] T137 [US2] Estender `src/hooks/__tests__/useSessionLifecycle.test.tsx` para payload, closed terminal, evento duplicado, cleanup, troca de Session e Strict Mode
- [ ] T138 [US2] Implementar criação do canal, setAuth, `.on()`→`.subscribe()`, filtro/colunas e cleanup em `src/hooks/useSessionLifecycle.ts`
- [ ] T139 [US2] Implementar payload, closed, deduplicação, Strict Mode e troca de Session em `src/hooks/useSessionLifecycle.ts`
- [ ] T140 [US2] Integrar hook/reducer/epoch/canal ao provider em `src/components/session/SessionLifecycleProvider.tsx`
- [ ] T141 [US2] Implementar epoch para invalidar callbacks/respostas após closed/troca em `src/components/session/SessionLifecycleProvider.tsx`
- [ ] T142 [US2] Executar `npx vitest run src/hooks/__tests__/useSessionLifecycle.test.tsx src/components/__tests__/SessionLifecycleProvider.test.tsx` e `npm run typecheck` de `package.json`
- [ ] T143 [US2] Escrever testes do modal para textos, sem X/Cancel, Escape/outside, foco, 48px, mobile e prevalência sobre loading em `src/components/__tests__/SessionClosedDialog.test.tsx`
- [ ] T144 [US2] Implementar imediatamente SessionClosedDialog em `src/components/session/SessionClosedDialog.tsx`
- [ ] T145 [US2] Tornar o conteúdo inerte e manter fila atrás do modal em `src/components/session/SessionClosedDialog.tsx`
- [ ] T146 [US2] Executar `npx vitest run src/components/__tests__/SessionClosedDialog.test.tsx` e `npm run typecheck` de `package.json`
- [ ] T147 [P] [US2] Estender `src/infrastructure/__tests__/session-realtime.integration.test.ts` com evento closed único para cada cliente autorizado e nenhum evento ao externo
- [ ] T148 [P] [US2] Escrever em `e2e/close-session-realtime.spec.ts` E2E com três contextos e modal sem F5/não dispensável, incluindo medição automatizada de exatamente 20 entregas: início na resposta persistida de `close_session`, fim quando o cliente conectado exibe o modal, cálculo nearest-rank `p95 = sorted[ceil(0.95 × 20) - 1]`, asserção `p95 <= 2000 ms` e captura de browser/versão, região `local`, viewport mobile, perfil de rede estável e ambiente Supabase local
- [ ] T149 [US2] Escrever E2E controlado em `e2e/close-session-slow-network.spec.ts` usando Chromium, viewport mobile `390×844`, perfil Slow 3G via CDP (`400 Kbps` download, `200 Kbps` upload, `400 ms` RTT), timeout de incerteza `8 s` e timeout Playwright `60 s`; validar loading imediato, botão desabilitado, ausência de sucesso otimista e de modal antes do commit observado, timeout/queda com mensagem amigável, escritas bloqueadas em estado incerto, resync antes de retry, modal somente após confirmação real e uma chamada por tentativa; salvar timestamps, contador de chamadas, browser/versão, viewport, throttling, timeout e resultado em `specs/003-close-session/validation/slow-network-e2e.json`
- [ ] T150 [P] [US2] Montar provider/modal no Host mantendo Server Component em `app/sala/[code]/dj/page.tsx`
- [ ] T151 [P] [US2] Montar provider/modal no participante sem duplicação em `app/sala/[code]/page.tsx`
- [ ] T152 [US2] Integrar resultado confirmado/incerto do close sem depender do evento em `src/components/session/CloseSessionButton.tsx`
- [ ] T153 [US2] Executar integração Realtime, hook/modal e `npx playwright test e2e/close-session-realtime.spec.ts e2e/close-session-slow-network.spec.ts --project=chromium`; salvar as 20 durações em `specs/003-close-session/validation/realtime-p95/automated-local.json`, a evidência controlada de loading/incerteza/resync/commit/chamadas em `specs/003-close-session/validation/slow-network-e2e.json` e o resultado em `specs/003-close-session/validation/us2.md`; manter o p95 local como diagnóstico, não substituto da validação real T203

**Checkpoint US2**: Autorizados recebem sem F5; externo não; modal não dispensa.

## Phase 5 — User Story 3: Estado final após desconexão ou refresh (P1)

**Objetivo**: Carga, refresh e eventos de reconexão recuperam closed sem polling.

**Teste independente**: Cliente offline ou sem evento recupera closed por consulta autorizada e mantém escritas bloqueadas.

- [ ] T154 [US3] Estender testes do hook para first/re-SUBSCRIBED, online, visibility/pageshow/BFCache, TOKEN_REFRESHED, CHANNEL_ERROR, TIMED_OUT, CLOSED e evento perdido em `src/hooks/__tests__/useSessionLifecycle.test.tsx`
- [ ] T155 [P] [US3] Estender testes de query para refresh/URL closed, Host/member, externo e nenhuma Queue/Participant em `src/infrastructure/__tests__/session.queries.test.ts`
- [ ] T156 [P] [US3] Escrever teste estático de exclusão de sala/RSC/actions/auth/RPC do cache em `src/infrastructure/__tests__/service-worker-policy.test.ts`
- [ ] T157 [US3] Escrever E2E para refresh e URL direta closed com externo sem enumeração em `e2e/close-session-recovery.spec.ts`
- [ ] T158 [US3] Escrever E2E para offline, evento perdido, aba suspensa, BFCache e token renovado em `e2e/close-session-reconnect.spec.ts`
- [ ] T159 [US3] Implementar resync fail-closed em todos os gatilhos, sem setInterval, em `src/hooks/useSessionLifecycle.ts`
- [ ] T160 [US3] Integrar TOKEN_REFRESHED/setAuth/resync mantendo um canal em `src/hooks/useSessionLifecycle.ts`
- [ ] T161 [US3] Manter writesAllowed=false até point read open confirmado em `src/components/session/SessionLifecycleProvider.tsx`
- [ ] T162 [US3] Ajustar rota participante para snapshot mínimo/modal closed/sem Queue-Participant em `app/sala/[code]/page.tsx`
- [ ] T163 [US3] Ajustar rota Host para getHostSessionDetails(sessionId)/closed/sem Queue-Participant em `app/sala/[code]/dj/page.tsx`
- [ ] T164 [US3] Restringir consultas Participant à fronteira open/closed em `src/infrastructure/supabase/queries/participant.queries.ts`
- [ ] T165 [US3] Restringir Service Worker ao shell/assets e excluir dados privados em `public/sw.js`
- [ ] T166 [US3] Executar testes de hook/query/SW e E2E recovery/reconnect; registrar ausência de polling em `specs/003-close-session/validation/us3.md`

**Checkpoint US3**: Carga e sinais event-driven convergem para closed sem polling.

## Phase 6 — User Story 4: Toda escrita é bloqueada após closed (P1)

**Objetivo**: Servidor e UI recusam toda mutação após closed e preservam os dados.

**Teste independente**: Join/create/cancel/update/pause-resume falham após closed sem alterar Session, Participant ou Queue.

- [ ] T167 [P] [US4] Escrever testes de SESSION_CLOSED, AppSuccess<void> exato do cancel e sucesso tardio ignorado em `src/application/__tests__/closed-session-writers.test.ts`
- [ ] T168 [P] [US4] Escrever testes de controles desabilitados e sem toast tardio em `src/components/__tests__/SessionWriteControls.test.tsx`
- [ ] T169 [P] [US4] Escrever teste de preservação de contagem, campos, posições e status em `src/infrastructure/__tests__/session-closure-preservation.integration.test.ts`
- [ ] T170 [US4] Escrever E2E para join/create/cancel/update/pause-resume recusados e dados intactos em `e2e/close-session-write-blocking.spec.ts`
- [ ] T171 [P] [US4] Integrar joinSessionAction ao contrato `public.join_session(text,text) RETURNS jsonb`, traduzir SESSION_CLOSED e impedir recovery indevido em `src/application/participant/join-session.action.ts`
- [ ] T172 [P] [US4] Integrar createQueueEntryAction ao contrato `public.create_queue_entry(uuid,varchar,varchar)`, traduzir SESSION_CLOSED e preservar Microfone Justo/paused em `src/application/queue/create-queue-entry.action.ts`
- [ ] T173 [P] [US4] Integrar cancelQueueEntryAction ao contrato `public.cancel_queue_entry(uuid) RETURNS void` com somente AppSuccess<void>/{ok:true}, sem DTO, e epoch seguro em `src/application/queue/cancel-queue-entry.action.ts`
- [ ] T174 [P] [US4] Aplicar writesAllowed/epoch e ignorar resposta tardia em `src/components/queue/RequestSongForm.tsx`
- [ ] T175 [P] [US4] Aplicar writesAllowed/epoch aos botões e feedbacks em `src/components/queue/QueueItem.tsx`
- [ ] T176 [US4] Propagar capabilities e fila read-only em `src/components/queue/QueueList.tsx`
- [ ] T177 [P] [US4] Bloquear pause/resume offline/incerto/closed em `src/components/session/SessionStatusToggle.tsx`
- [ ] T178 [US4] Impedir callbacks/resync Queue após terminal e limpar canal em `src/hooks/useActiveQueue.ts`
- [ ] T179 [US4] Executar writers SQL/RPC, corridas, preservação, UI e `e2e/close-session-write-blocking.spec.ts`; registrar resultados em `specs/003-close-session/validation/us4.md`

**Checkpoint US4**: Nenhuma escrita posterior; dados preservados.

## Phase 7 — User Story 5: Usuário volta ao início (P2)

**Objetivo**: Saída limpa somente o contexto da sala e preserva autenticação.

**Teste independente**: Voltar para o início, Back/popstate/gesto e revisita mantêm cleanup e recuperação corretos.

- [ ] T180 [US5] Escrever testes de cleanup room-scoped preservando auth/cookies/outra sala em `src/hooks/__tests__/session-room-cleanup.test.ts`
- [ ] T181 [US5] Implementar imediatamente cleanup room-scoped sem signOut/tokens/cookies/outra sala em `src/hooks/session-room-cleanup.ts`
- [ ] T182 [US5] Executar `npx vitest run src/hooks/__tests__/session-room-cleanup.test.ts` e `npm run typecheck` de `package.json`
- [ ] T183 [US5] Estender testes do modal com Voltar, cleanup→router.replace, Back, popstate, gesto mobile, BFCache e novo acesso closed em `src/components/__tests__/SessionClosedDialog.test.tsx`
- [ ] T184 [US5] Escrever E2E para Voltar, Back, popstate, gesto mobile, Forward/deep link, múltiplas abas e auth em `e2e/close-session-leave.spec.ts`
- [ ] T185 [US5] Estender `e2e/close-session-leave.spec.ts` com SC-008: iniciar cronômetro no clique “Voltar para o início”, confirmar URL `/` em até 5 segundos e registrar navegador, viewport mobile e perfil de rede sem incluir latência do evento Realtime
- [ ] T186 [US5] Integrar cleanup ao leaveSession em `src/components/session/SessionLifecycleProvider.tsx`
- [ ] T187 [US5] Ligar modal a cleanup/router.replace sem history trap/beforeunload em `src/components/session/SessionClosedDialog.tsx`
- [ ] T188 [US5] Limpar canal de participantes sem afetar outros canais em `src/components/participant/ParticipantsList.tsx`
- [ ] T189 [US5] Executar testes de modal/cleanup e `npx playwright test e2e/close-session-leave.spec.ts` em `package.json`
- [ ] T190 [US5] Executar o cenário SC-008 em `e2e/close-session-leave.spec.ts` e salvar duração, navegador, viewport, perfil de rede e resultado verificável em `specs/003-close-session/validation/sc-008-navigation.md`
- [ ] T191 [US5] Registrar navegação, abas, auth e cache em `specs/003-close-session/validation/us5.md`

**Checkpoint US5**: Saída room-scoped; revisita recupera closed do banco.

## Phase 8 — Polish & Cross-Cutting Concerns

Auditorias, correções e o único gate final completo da feature.

- [ ] T192 Auditar WCAG 2.1 AA, incluindo feedback de erro/incerteza do botão, em `specs/003-close-session/validation/accessibility.md`
- [ ] T193 Corrigir achados de acessibilidade em `src/components/session/CloseSessionButton.tsx` e `src/components/session/SessionClosedDialog.tsx`
- [ ] T194 Revisar Mobile Chrome/Safari, dark mode, uma mão e 48×48 em `specs/003-close-session/validation/mobile.md`
- [ ] T195 Corrigir achados mobile em `src/components/session/CloseSessionButton.tsx`, `src/components/session/SessionClosedDialog.tsx`, `src/components/queue/QueueItem.tsx` e `src/components/session/SessionStatusToggle.tsx`
- [ ] T196 Revisar as migrations atômicas 015–016 para auth.uid(), ownership, owner, search_path, locks, revokes de escrita, RLS, RPCs de status e cutover em `specs/003-close-session/validation/security-review.md`
- [ ] T197 Auditar pg_proc/ACL, Host/status RPCs, table/column privileges e SELECTs negativos em `specs/003-close-session/validation/database-security.md`
- [ ] T198 Executar a matriz consolidada Host/member/external × open/closed nos comandos `npx --no-install supabase test db supabase/tests/003_sessions_rls.sql --local`, `npx --no-install supabase test db supabase/tests/003_participants_rls.sql --local`, `npx --no-install supabase test db supabase/tests/003_queue_rls.sql --local`, `npx --no-install supabase test db supabase/tests/003_session_rls_helpers.sql --local`, `npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local` e `npx --no-install supabase test db supabase/tests/003_policy_catalog.sql --local`, registrando isolamento e ausência de recursão em `specs/003-close-session/validation/rls-matrix.md`
- [ ] T199 Revisar `.on()`→`.subscribe()`, setAuth, filtro, RLS, Strict Mode, resync e cleanup em `src/hooks/useSessionLifecycle.ts`, `src/hooks/useActiveQueue.ts` e `src/components/participant/ParticipantsList.tsx`
- [ ] T200 Revisar offline, ausência de polling/background sync e BFCache em `src/components/session/SessionLifecycleProvider.tsx`, `src/hooks/useSessionLifecycle.ts`, `src/hooks/useOnlineStatus.ts` e `public/sw.js`
- [ ] T201 Auditar/corrigir tokens e dados privados em `specs/003-close-session/validation/security-cache.md` e `public/sw.js`
- [ ] T202 Atualizar comandos e cenários executados em `specs/003-close-session/quickstart.md`
- [ ] T203 Executar em staging ou ambiente real representativo, nunca produção, exatamente 20 entregas Realtime observadas entre confirmação persistida de `close_session` e modal visível; calcular nearest-rank `p95 = sorted[ceil(0.95 × 20) - 1]`, exigir `p95 <= 2000 ms` e registrar durações, browser/versão, região Supabase, viewport mobile, perfil de rede estável e ambiente usado em `specs/003-close-session/validation/realtime-p95/real-environment.json`, distinguindo esta aceitação real do teste automatizado local T153 e consolidando Host + dois participantes/preservação em `specs/003-close-session/validation/final-manual-and-preservation.md`
- [ ] T204 Executar o “gate final da feature” após todas as implementações: `npx --no-install supabase db reset --local`; não executar nem incluir `supabase/tests/003_private_schema_post_015.sql` neste gate e preservar o arquivo; executar nesta ordem `npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local`; `npx --no-install supabase test db supabase/tests/003_session_rls_helpers.sql --local`; `npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local`; `npx --no-install supabase test db supabase/tests/003_policy_catalog.sql --local`; `npx --no-install supabase test db supabase/tests/003_sessions_rls.sql --local`; `npx --no-install supabase test db supabase/tests/003_participants_rls.sql --local`; `npx --no-install supabase test db supabase/tests/003_queue_rls.sql --local`; `npx --no-install supabase test db supabase/tests/003_join_session_contract.sql --local`; `npx --no-install supabase test db supabase/tests/003_create_queue_entry_contract.sql --local`; `npx --no-install supabase test db supabase/tests/003_cancel_queue_entry_contract.sql --local`; `npx --no-install supabase test db supabase/tests/003_update_queue_status.sql --local`; `npx --no-install supabase test db supabase/tests/003_update_session_status.sql --local`; `npx --no-install supabase test db supabase/tests/003_host_session_details.sql --local`; `npx --no-install supabase test db supabase/tests/003_close_session_security.sql --local`; depois `npm run test:db:race`, `npx vitest run`, `npm run test:e2e`, `npm run lint`, `npm run typecheck` e `npm run build`; registrar resultados e bloquear conclusão em qualquer falha em `specs/003-close-session/validation/final-gate.md`

## Dependências e ordem

### Totais e fases

- Total: **204 tarefas**; **28** possuem `[P]`.
- Setup `T001–T018` → Foundational `T019–T030`.
- US1/MVP `T031–T135` → US2 `T136–T153` → US3 `T154–T166`.
- US4 `T167–T179` depende do banco US1 e lifecycle US2/US3.
- US5 `T180–T191` depende do modal/lifecycle US2/US3.
- Polish e gate final `T192–T204` dependem de todas as histórias.

### Drivers, testes e módulos TypeScript

1. `T003–T007` fixam a CLI, iniciam a stack e validam serviços locais sem transportar credenciais; `T008–T013` preparam driver/harness; `T014` cria o wrapper que obtém e consome a URL no mesmo processo do Vitest; `T015` valida esse bootstrap sem executar ainda as corridas da feature.
2. Pares Foundational permanecem teste→implementação: `T021→T022`, `T023→T024`, `T026→T027`, `T028→T029`; o gate da fase é `T030`.
3. Contratos SQL são escritos em `T036–T056` antes da migration atômica; as corridas são escritas em `T057–T064` e os privilégios diretos em `T065`.
4. Após tipos pós-015: `T092→T093→T094` (queries), `T095→T096→T097` (get status), `T098→T099→T100` (Queue status) e `T101→T102→T103` (pause/resume).
5. Após o gate final de banco: `T127` prepara o E2E; `T128→T129→T130` implementam a close action; `T131→T132→T133` implementam botão/feedback; `T134–T135` integram e validam.
6. Hook `T136–T142`, modal `T143–T146` e cleanup `T180–T182` mantêm blocos teste→implementação→execução sem gate global entre teste e módulo.

### Migrations, aplicação e dois gates

1. `T031–T065` escrevem todos os testes de invariantes, helpers, writers, close, concorrência e privilégios antes do SQL.
2. Migration atômica 015: criar integralmente `T066–T084` no único arquivo `20260729100000_015_session_closure_atomic.sql` → aplicar `T085` → verificar history `T086` → executar imediatamente o gate SQL, incluindo `003_session_privileges.sql`, em `T087` → gerar/verificar tipos `T088–T089` → executar corridas/retries `T090` → fechar o gate bloqueante `T091`. Nenhuma parte de closed é aplicada antes de todos os writers, revokes e `close_session` estarem na mesma transação.
3. A aplicação compatível `T092–T105` e os testes finais de RLS `T106–T109` ocorrem somente depois do gate atômico verde e antes da contração de leitura.
4. Migration final 016: criar exclusivamente policies/grants de leitura/Realtime em `T110–T119` → aplicar `T120` → verificar history `T121` → regenerar/verificar tipos `T122–T123` → criar/compilar Realtime tipado `T124–T125` → executar o gate final de banco/RLS/grants/Realtime `T126`.
5. Migrations, aplicações, history, geração de tipos e gates são sequenciais e não recebem `[P]`; rollback permanece forward-only. O arquivo histórico `supabase/tests/003_private_schema_post_015.sql` é preservado e não entra em qualquer gate.

### Hardening das três RPCs existentes

- `public.join_session(text,text) RETURNS jsonb`: contrato/pg_proc/ACL/auth/closed `T036–T040`, SQL/ACL na 015 `T069–T070`, gate `T087`, corrida `T090`, aplicação `T171` e validação US4 `T179`.
- `public.create_queue_entry(uuid,varchar,varchar) RETURNS TABLE(...)`: contrato `T041–T045`, SQL/ACL na 015 `T071–T072`, gate `T087`, corrida `T090`, aplicação `T172` e validação US4 `T179`.
- `public.cancel_queue_entry(uuid) RETURNS void`: contrato `T046–T050`, SQL/ACL na 015 `T073–T074`, gate `T087`, corrida `T090`, aplicação `T173` e validação US4 `T179`.

### Policies e isolamento

- Testes `T106–T109` cobrem privilégios de leitura, Host, membro, externo, open/closed, recursão e catálogo exato.
- Drops obrigatórios: `T111` remove policies legadas de sessions; `T112` remove `participants_select_session`; `T113` remove as duas policies incompatíveis de Queue.
- Grants mínimos `T114–T115` precedem as policies finais `T116–T118`; publication/schema reload fecham a única migration RLS em `T119`.
- O conjunto final é validado em `T126`, consolidado em `T198` e reexecutado no gate da feature `T204`.

### Concorrência e retries

- `T057` usa três conexões somente para close×close; `T059–T064` usam o mesmo harness para writers pareados nas duas ordens.
- `T058` executa um close seguido de dezenove retries sequenciais: um `changed=true`, dezenove `changed=false`, um `closed_at` e nenhum efeito colateral.
- `T014` garante que `SUPABASE_TEST_DB_URL` nasce e é consumida no mesmo processo que inicia Vitest; `T090` é a execução do harness após a 015 e antes da 016.

### Caminho crítico

`T001–T007 → T008–T018 → T019–T030 → T031–T065 → T066–T091 → T092–T109 → T110–T126 → T127–T135 → T136–T153 → T154–T166 → T167–T179 → T180–T191 → T192–T204`.

### Paralelização real

- `T002` pode avançar em paralelo; `T003–T007` são bloqueantes; UI/fixtures `T016–T018` usam arquivos distintos.
- Testes SQL marcados `[P]` usam arquivos distintos; extensões do mesmo arquivo permanecem sequenciais.
- `T107` e `T108` são paralelos, mas bloqueiam respectivamente `T117` e `T118`.
- Rotas Host/participante `T150/T151` são paralelas somente após provider/modal; actions/controles US4 com `[P]` usam arquivos distintos.
- Nenhuma tarefa `[P]` edita migration, `package.json`, `database.types.ts` ou arquivo de teste compartilhado simultaneamente.

### Checkpoints, conclusão independente e MVP-first

- Infraestrutura/harness: `T015`; Foundational: `T030`.
- US1 `T135`: Host encerra active/paused; a migration atômica 015 passa integralmente antes da 016; privilégios, writers, idempotência, RLS, Realtime e tipos estão validados.
- US2 `T153`: Host e participantes recebem closed sem F5; modal não dispensa; p95 local e rede lenta são evidenciados, mantendo a aceitação real em `T203`.
- US3 `T166`: carga inicial, refresh, URL direta e sinais event-driven convergem para closed sem polling.
- US4 `T179`: join/create/cancel/update/pause-resume recusam closed e preservam dados.
- US5 `T191`: cleanup room-scoped, navegação e SC-008 são validados.
- Estratégia MVP-first: executar Setup + Foundational + US1 e validar `T135`; a feature conclui somente no gate `T204`.
