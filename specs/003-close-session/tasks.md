# Tasks: Encerramento de Sessão

**Feature**: `003-close-session` | **Fonte**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

## Phase 1 — Setup

- [ ] T001 Verificar branch `003-close-session`, `.specify/feature.json` apontando `specs/003-close-session` e `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` retornando esse FEATURE_DIR; abortar em main/002 e registrar em `specs/003-close-session/validation/baseline.md`
- [ ] T002 Inventariar scripts, versões, componentes e dependências atuais sem alterar configuração em `package.json`, `package-lock.json`, `components.json` e `supabase/config.toml`
- [ ] T003 Fixar Supabase CLI `2.106.0` como devDependency exata, com lock reproduzível, em `package.json` e `package-lock.json`
- [ ] T004 Executar preflight somente leitura com versão e `--help` de migration, migration up/list, db reset, test db e gen types; registrar falha objetiva em `specs/003-close-session/validation/supabase-cli-preflight.md`
- [ ] T005 Habilitar Anonymous Auth somente no ambiente local, iniciar `supabase start`, validar Database/Auth/Realtime e status loopback sem imprimir segredos em `supabase/config.toml` e `specs/003-close-session/validation/supabase-local-runtime.md`
- [ ] T006 Adicionar `pg` e `@types/pg` como devDependencies em `package.json` e `package-lock.json`
- [ ] T007 Escrever testes do bootstrap loopback-only, três clients, barreira e cleanup em `src/infrastructure/__tests__/supabase/postgres-race-harness.test.ts`
- [ ] T008 Implementar `src/infrastructure/__tests__/supabase/postgres-race-harness.ts`, `scripts/test-db-race-local.ps1` e `test:db:race` em `package.json`, obtendo/validando DB_URL e iniciando Vitest no mesmo processo sem persistir credenciais
- [ ] T009 [P] Preparar fixtures JWT Host/Participant/external, isolamento e cleanup em `src/infrastructure/__tests__/supabase/session-closure.helpers.ts`
- [ ] T010 [P] Adicionar AlertDialog shadcn/ui base-nova em `src/components/ui/alert-dialog.tsx`
- [ ] T011 [P] Preparar fixture Playwright Host + dois Participants por Session isolada em `e2e/fixtures/session-closure.fixture.ts`

## Phase 2 — Foundational

- [ ] T012 [P] Definir SessionStatus, ClosedSession, DTOs de todas as RPCs, snapshots, payload Realtime e lifecycle sem `any` em `src/domain/session.types.ts`
- [ ] T013 [P] Definir erros de domínio e mensagens sanitizadas, incluindo SESSION_CLOSED, em `src/domain/errors.types.ts`
- [ ] T014 Escrever testes do mapper de erros e respostas indistinguíveis em `src/application/__tests__/session-error.mapper.test.ts`
- [ ] T015 Implementar mapper e executar seu teste imediatamente em `src/application/session/session-error.mapper.ts`
- [ ] T016 Escrever testes de schemas/payload, reducer terminal, epoch e writesAllowed fail-closed em `src/domain/__tests__/session-lifecycle.test.ts` e `src/hooks/__tests__/session-lifecycle.reducer.test.ts`
- [ ] T017 Implementar schemas/guards em `src/domain/session-lifecycle.ts` e reducer em `src/hooks/session-lifecycle.reducer.ts`, depois executar os testes da tarefa anterior
- [ ] T018 Escrever testes do contexto/provider e capabilities em `src/components/__tests__/SessionLifecycleProvider.test.tsx`
- [ ] T019 Implementar base de `SessionLifecycleProvider` e contexto em `src/components/session/SessionLifecycleProvider.tsx`, executar testes Foundational e `npm run typecheck`

## Phase 3 — User Story 1: Host encerra a sala definitivamente (P1)

- [ ] T020 [P] [US1] Escrever pgTAP de constraint, transições, trigger/pg_proc/pg_trigger e baseline válida em `supabase/tests/003_session_closure_invariants.sql`
- [ ] T021 [P] [US1] Escrever pgTAP consolidado de join/create/cancel/update-queue/update-session, return types, auth, locks, closed e write ACL em `supabase/tests/003_session_writers.sql`
- [ ] T022 [P] [US1] Escrever pgTAP de close_session, owner/non-owner, DTO, idempotência, timestamp e preservação em `supabase/tests/003_close_session.sql`
- [ ] T023 [P] [US1] Escrever testes SQL de um close + 19 retries sequenciais e invariantes pós-corrida em `supabase/tests/003_session_concurrency.sql`
- [ ] T024 [P] [US1] Escrever pgTAP stage-aware em `supabase/tests/003_session_privileges.sql`: após 015 executar DML/EXECUTE/terminalidade; quando `to_regprocedure('public.get_host_session_details(uuid)')` deixar de ser null após 016, usar SQL dinâmico nesse ramo para acrescentar table/column privileges, SELECT negativos e grants/revokes finais
- [ ] T025 [P] [US1] Escrever matriz RLS de sessions Host/member/external/unlinked × active/paused/closed, negação externa por UUID/código, colunas, Realtime, recursão e policies residuais em `supabase/tests/003_sessions_rls.sql`
- [ ] T026 [P] [US1] Escrever matriz RLS de participants com os mesmos papéis/estados, isolamento, recursão e DML bloqueado em `supabase/tests/003_participants_rls.sql`
- [ ] T027 [P] [US1] Escrever matriz RLS de queue com os mesmos papéis/estados, isolamento, recursão e DML bloqueado em `supabase/tests/003_queue_rls.sql`
- [ ] T028 [US1] Escrever corridas pareadas determinísticas close×close/join/create/cancel/pause/resume/update-queue em `src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts`
- [ ] T029 [US1] Criar a primeira parte transacional de `supabase/migrations/20260729100000_015_session_closure_atomic.sql`: preflight, `CREATE SCHEMA IF NOT EXISTS private` com owner/ACL seguros, `sessions_status_check`, `sessions_closed_at_coherence_check` e `private.enforce_session_state_transition() RETURNS trigger` em `LANGUAGE plpgsql`, `VOLATILE`, `SECURITY INVOKER`, `PARALLEL UNSAFE`, owner `postgres`, `SET search_path = ''`, referências qualificadas, `REVOKE ALL ON FUNCTION private.enforce_session_state_transition() FROM PUBLIC, anon, authenticated`, nenhum GRANT web, trigger terminal e metadados verificáveis por `pg_proc`/ACL
- [ ] T030 [US1] Adicionar a `supabase/migrations/20260729100000_015_session_closure_atomic.sql` `DROP FUNCTION IF EXISTS public.create_queue_entry(uuid, character varying, character varying)` e `DROP FUNCTION IF EXISTS public.cancel_queue_entry(uuid)`, recriar `join_session(text,text) RETURNS jsonb`, create com DTO TABLE e cancel `RETURNS void`, todos Session-first, owner postgres, search_path vazio, REVOKE geral e EXECUTE authenticated
- [ ] T031 [US1] Concluir `supabase/migrations/20260729100000_015_session_closure_atomic.sql` com `update_queue_status(uuid,text)`, `update_session_status(uuid,text)` sem target closed, `close_session(uuid)` idempotente, revokes de INSERT/UPDATE/DELETE diretos e COMMIT somente após toda a fronteira de escrita
- [ ] T032 [US1] Aplicar somente a migration 015 localmente com `npx --no-install supabase migration up --local` e registrar em `specs/003-close-session/validation/migration-015.md`
- [ ] T033 [US1] Verificar `20260729100000` em `npx --no-install supabase migration list --local` e registrar history em `specs/003-close-session/validation/migration-015.md`
- [ ] T034 [US1] Gerar `src/infrastructure/supabase/database.types.ts` após 015 com `System.IO.File.WriteAllText` e `UTF8Encoding(false)`, sem redirecionamento simples
- [ ] T035 [US1] Validar bytes UTF-8 sem BOM/UTF-16, funções pós-015 no generic Database e `npm run typecheck`; registrar em `specs/003-close-session/validation/types-015.md`
- [ ] T036 [US1] Executar, nesta ordem, `supabase test db` local para `supabase/tests/003_session_closure_invariants.sql`, `supabase/tests/003_session_writers.sql`, `supabase/tests/003_close_session.sql`, `supabase/tests/003_session_concurrency.sql` e `supabase/tests/003_session_privileges.sql` no ramo DML/EXECUTE pós-015; bloquear 016 em qualquer falha e registrar em `specs/003-close-session/validation/gate-015.md`
- [ ] T037 [US1] Executar `npm run test:db:race` com três conexões, duas ordens e um close + 19 retries sequenciais; registrar em `specs/003-close-session/validation/gate-015-concurrency.md`
- [ ] T038 [US1] Criar a primeira parte de `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`: helpers RLS SQL/STABLE/SECURITY DEFINER com owner postgres, search_path vazio, schema qualification, USAGE/EXECUTE somente authenticated e testes sem recursão; DROP de `sessions_select_public`, `sessions_update_own`, `participants_select_session`, `"Users can read active queue of their session"` e `"Host can update queue"`; REVOKE SELECT amplo; policies `sessions_select_owned_or_member`, `participants_select_authorized_open_or_host`, `queue_select_authorized_open_or_host`; preservar somente as deny policies aprovadas e aplicar grants mínimos
- [ ] T039 [US1] Concluir `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql` com `public.get_host_session_details(uuid) RETURNS TABLE(id uuid,code text,status text,closed_at timestamptz,created_at timestamptz,max_participants smallint,max_queue_entries smallint)`, auth por ownership, owner/search_path/ACL, publication Session idempotente, schema reload e COMMIT
- [ ] T040 [US1] Aplicar somente a migration 016 localmente com `npx --no-install supabase migration up --local` e registrar em `specs/003-close-session/validation/migration-016.md`
- [ ] T041 [US1] Verificar `20260729101000` em migration history e registrar em `specs/003-close-session/validation/migration-016.md`
- [ ] T042 [US1] Regenerar `src/infrastructure/supabase/database.types.ts` após 016 com WriteAllText UTF-8 sem BOM
- [ ] T043 [US1] Validar encoding, get_host_session_details, schema final e `npm run typecheck`; registrar em `specs/003-close-session/validation/types-016.md`
- [ ] T044 [US1] Criar teste tipado de publication/entrega Session para Host/member e negação externa em `src/infrastructure/__tests__/session-realtime.integration.test.ts`
- [ ] T045 [US1] Executar, nesta ordem, `supabase test db` local para `supabase/tests/003_session_privileges.sql`, `supabase/tests/003_sessions_rls.sql`, `supabase/tests/003_participants_rls.sql` e `supabase/tests/003_queue_rls.sql`, depois `src/infrastructure/__tests__/session-realtime.integration.test.ts`; registrar `pg_policies`, grants e isolamento em `specs/003-close-session/validation/gate-016.md`
- [ ] T046 [US1] Escrever testes de projeção mínima e get_host_session_details em `src/infrastructure/__tests__/session.queries.test.ts`
- [ ] T047 [US1] Implementar queries tipadas e executar seus testes em `src/infrastructure/supabase/queries/session.queries.ts`
- [ ] T048 [US1] Escrever testes de close action, resposta incerta e ausência de sucesso otimista em `src/application/__tests__/close-session.action.test.ts`
- [ ] T049 [US1] Implementar close action tipada e executar seus testes em `src/application/session/close-session.action.ts`
- [ ] T050 [US1] Escrever testes Host-only/destructive/48px/loading/deduplicação/erro/incerteza em `src/components/__tests__/CloseSessionButton.test.tsx`
- [ ] T051 [US1] Implementar/integrar CloseSessionButton e executar testes em `src/components/session/CloseSessionButton.tsx` e `app/sala/[code]/dj/page.tsx`
- [ ] T052 [US1] Executar E2E de active/paused, cancelamento, outro Host, retry e dados preservados em `e2e/close-session-host.spec.ts`; registrar checkpoint em `specs/003-close-session/validation/us1.md`

## Phase 4 — User Story 2: Todos recebem o encerramento sem F5 (P1)

- [ ] T053 [US2] Escrever testes de canal JWT, `.on()` antes de subscribe, filtro, payload, cleanup, Strict Mode e deduplicação em `src/hooks/__tests__/useSessionLifecycle.test.tsx`
- [ ] T054 [US2] Implementar assinatura Session Realtime e epoch em `src/hooks/useSessionLifecycle.ts`
- [ ] T055 [US2] Escrever testes do modal para textos, foco, 48px, sem X/Escape/outside e precedência em `src/components/__tests__/SessionClosedDialog.test.tsx`
- [ ] T056 [US2] Implementar modal/inert overlay em `src/components/session/SessionClosedDialog.tsx`
- [ ] T057 [P] [US2] Montar provider/modal no Host mantendo Server Component em `app/sala/[code]/dj/page.tsx`
- [ ] T058 [P] [US2] Montar provider/modal no Participant mantendo Server Component em `app/sala/[code]/page.tsx`
- [ ] T059 [US2] Estender integração Realtime para evento único autorizado e negação externa em `src/infrastructure/__tests__/session-realtime.integration.test.ts`
- [ ] T060 [US2] Escrever E2E Host + dois Participants e exatamente 20 entregas/p95 em `e2e/close-session-realtime.spec.ts`
- [ ] T061 [US2] Escrever cenário Slow 3G, loading, incerteza, resync e chamada única em `e2e/close-session-slow-network.spec.ts`
- [ ] T062 [US2] Executar testes US2 e salvar evidências em `specs/003-close-session/validation/us2.md`, `specs/003-close-session/validation/realtime-p95/automated-local.json` e `specs/003-close-session/validation/slow-network-e2e.json`

## Phase 5 — User Story 3: Estado final após desconexão ou refresh (P1)

- [ ] T063 [P] [US3] Estender testes de hook/query para initial load, reconnect, token, online, visible, BFCache e evento perdido em `src/hooks/__tests__/useSessionLifecycle.test.tsx` e `src/infrastructure/__tests__/session.queries.test.ts`
- [ ] T064 [P] [US3] Escrever teste de política do Service Worker para excluir sala/RSC/Auth/RPC/dados privados em `src/infrastructure/__tests__/service-worker-policy.test.ts`
- [ ] T065 [US3] Escrever E2E de refresh, URL direta, offline, evento perdido, aba suspensa e token renovado em `e2e/close-session-recovery.spec.ts` e `e2e/close-session-reconnect.spec.ts`
- [ ] T066 [US3] Implementar resync fail-closed orientado a eventos em `src/hooks/useSessionLifecycle.ts`
- [ ] T067 [US3] Ajustar carregamento inicial closed e evitar Queue/Participant em `app/sala/[code]/page.tsx` e `app/sala/[code]/dj/page.tsx`
- [ ] T068 [US3] Restringir consultas Participant e atualizar Service Worker sem cache privado em `src/infrastructure/supabase/queries/participant.queries.ts` e `public/sw.js`
- [ ] T069 [US3] Executar testes de hook/query/SW e E2E recovery/reconnect; registrar em `specs/003-close-session/validation/us3.md`
- [ ] T070 [US3] Auditar ausência de setInterval/polling e writes fail-closed em `specs/003-close-session/validation/us3-no-polling.md`

## Phase 6 — User Story 4: Toda escrita é bloqueada após closed (P1)

- [ ] T071 [P] [US4] Escrever testes de actions join/create/cancel para SESSION_CLOSED e retorno cancel void em `src/application/__tests__/closed-session-writers.test.ts`
- [ ] T072 [US4] Integrar contratos tipados join/create/cancel em `src/application/participant/join-session.action.ts`, `src/application/queue/create-queue-entry.action.ts` e `src/application/queue/cancel-queue-entry.action.ts`
- [ ] T073 [P] [US4] Escrever testes das actions update_queue_status/update_session_status para autorização, transições, idempotência e closed em `src/application/__tests__/session-status-writers.test.ts`
- [ ] T074 [US4] Substituir UPDATE direto pelas RPCs em `src/application/queue/update-queue-status.action.ts` e `src/application/session/update-session-status.action.ts`
- [ ] T075 [US4] Escrever testes de controles desabilitados e resposta tardia ignorada em `src/components/__tests__/SessionWriteControls.test.tsx`
- [ ] T076 [US4] Aplicar writesAllowed/epoch em `src/components/queue/RequestSongForm.tsx`, `src/components/queue/QueueItem.tsx`, `src/components/queue/QueueList.tsx` e `src/components/session/SessionStatusToggle.tsx`
- [ ] T077 [US4] Escrever/executar preservação e E2E de todos os writers bloqueados em `src/infrastructure/__tests__/session-closure-preservation.integration.test.ts` e `e2e/close-session-write-blocking.spec.ts`
- [ ] T078 [US4] Executar gate US4 e registrar resultados em `specs/003-close-session/validation/us4.md`

## Phase 7 — User Story 5: Usuário volta ao início (P2)

- [ ] T079 [US5] Escrever testes de cleanup room-scoped preservando Auth/cookies/outra sala em `src/hooks/__tests__/session-room-cleanup.test.ts`
- [ ] T080 [US5] Implementar cleanup sem signOut/tokens em `src/hooks/session-room-cleanup.ts`
- [ ] T081 [US5] Estender testes do modal com replace `/`, Back, popstate, gesto, BFCache e revisita closed em `src/components/__tests__/SessionClosedDialog.test.tsx`
- [ ] T082 [US5] Escrever E2E de navegação, múltiplas abas e SC-008 ≤5 s em `e2e/close-session-leave.spec.ts`, cronometrando clique→URL `/` em Chromium estável, viewport 390×844, Supabase local e loopback sem throttling, com browser/região/rede registrados
- [ ] T083 [US5] Integrar cleanup/router.replace e canais em `src/components/session/SessionLifecycleProvider.tsx`, `src/components/session/SessionClosedDialog.tsx` e `src/components/participant/ParticipantsList.tsx`
- [ ] T084 [US5] Executar testes US5 e registrar duração/ambiente em `specs/003-close-session/validation/us5.md` e `specs/003-close-session/validation/sc-008-navigation.md`

## Phase 8 — Polish & Cross-Cutting Concerns

- [ ] T085 [P] Auditar WCAG 2.1 AA, foco, feedback e touch targets em `specs/003-close-session/validation/accessibility.md`
- [ ] T086 [P] Auditar Mobile Chrome/Safari, dark mode e uma mão em `specs/003-close-session/validation/mobile.md`
- [ ] T087 Corrigir achados acessíveis/mobile em `src/components/session/CloseSessionButton.tsx`, `src/components/session/SessionClosedDialog.tsx`, `src/components/queue/QueueItem.tsx` e `src/components/session/SessionStatusToggle.tsx`
- [ ] T088 Auditar migrations, pg_proc, return types, DROP, locks, ACL, grants e pg_policies em `specs/003-close-session/validation/database-security.md`
- [ ] T089 Auditar Realtime, offline, cleanup, SW e tokens em `specs/003-close-session/validation/runtime-security.md`
- [ ] T090 Executar p95 real representativo e validação manual Host + dois Participants em `specs/003-close-session/validation/realtime-p95/real-environment.json` e `specs/003-close-session/validation/final-manual.md`
- [ ] T091 Executar reset local e, nesta ordem, `supabase/tests/003_session_closure_invariants.sql`, `supabase/tests/003_session_writers.sql`, `supabase/tests/003_close_session.sql`, `supabase/tests/003_session_concurrency.sql`, `supabase/tests/003_session_privileges.sql`, `supabase/tests/003_sessions_rls.sql`, `supabase/tests/003_participants_rls.sql`, `supabase/tests/003_queue_rls.sql`, harness, Vitest, E2E, lint, typecheck e build; atualizar `specs/003-close-session/quickstart.md` e registrar `specs/003-close-session/validation/final-gate.md`

## Dependências e caminho crítico

- Setup `T001–T011` → Foundational `T012–T019`.
- US1/MVP `T020–T052` cria os testes antes das duas migrations e bloqueia cada avanço no gate correspondente.
- US2 `T053–T062` depende do banco/Realtime e do provider base.
- US3 `T063–T070` depende de US2.
- US4 `T071–T078` depende do gate 015 e do lifecycle.
- US5 `T079–T084` depende do modal/lifecycle.
- Polish `T085–T091` depende de todas as histórias.

### Ordem das migrations

1. Testes SQL `T020–T028`.
2. Criar 015 `T029–T031` → aplicar `T032` → history `T033` → tipos/encoding `T034–T035` → gate SQL/harness `T036–T037`.
3. Criar 016 `T038–T039` → aplicar `T040` → history `T041` → tipos/encoding `T042–T043` → teste Realtime `T044` → gate final de banco `T045`.
4. Nenhuma migration é `[P]`; 016 é proibida enquanto `T036–T037` falharem.

### Test-first e paralelização

- SQL files distintos `T020–T027` podem ser escritos em paralelo; não são executados antes de seus objetos.
- Pares TypeScript são teste→implementação sem typecheck global intermediário: `T014→T015`, `T016→T017`, `T018→T019`, `T046→T047`, `T048→T049`, `T050→T051`, `T053→T054`, `T055→T056`, `T071→T072`, `T073→T074`, `T075→T076`, `T079→T080`.
- Rotas Host/Participant `T057–T058` são paralelas depois do hook/modal.

### Caminho crítico

`T001–T019 → T020–T037 → T038–T045 → T046–T052 → T053–T062 → T063–T070 → T071–T078 → T079–T084 → T085–T091`.

### Checkpoints

- MVP/US1: `T052`.
- Realtime/modal: `T062`.
- Recovery: `T070`.
- Writes bloqueados: `T078`.
- Navegação: `T084`.
- Feature concluída somente com `T091` verde.

**Total**: 91 tarefas. **MVP sugerido**: Setup + Foundational + US1.
