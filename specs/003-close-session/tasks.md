# Tasks: Encerramento de Sessão

**Feature**: `003-close-session` | **Fonte**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

## Phase 1 — Setup

- [X] T001 Verificar branch `003-close-session`, `.specify/feature.json` apontando `specs/003-close-session` e `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` retornando esse FEATURE_DIR; abortar em main/002 e registrar em `specs/003-close-session/validation/baseline.md`
- [X] T002 Inventariar dependencias e reconhecer em `package.json`, `components.json` e `src/components/ui/button.tsx` que componentes legados podem usar `@base-ui/react`; registrar que `style: new-york` nao define a base, que a migracao global esta fora do escopo e que somente os novos arquivos desta feature devem ser Radix
- [X] T003 Fixar Supabase CLI `2.106.0` como devDependency exata, com lock reproduzível, em `package.json` e `package-lock.json`
- [X] T004 Executar preflight somente leitura com versão e `--help` de migration, migration up/list, db reset, test db e gen types; registrar falha objetiva em `specs/003-close-session/validation/supabase-cli-preflight.md`
- [X] T005 Habilitar Anonymous Auth somente no ambiente local, iniciar `supabase start`, validar Database/Auth/Realtime e status loopback sem imprimir segredos em `supabase/config.toml` e `specs/003-close-session/validation/supabase-local-runtime.md`
- [X] T006 Adicionar `pg` e `@types/pg` como devDependencies em `package.json` e `package-lock.json`
- [X] T007 Escrever testes do bootstrap loopback-only, três clients, barreira e cleanup em `src/infrastructure/__tests__/supabase/postgres-race-harness.test.ts`
- [X] T008 Implementar `src/infrastructure/__tests__/supabase/postgres-race-harness.ts`, `scripts/test-db-race-local.ps1` e `test:db:race` em `package.json`, obtendo/validando DB_URL e iniciando Vitest no mesmo processo sem persistir credenciais
- [X] T009 [P] Preparar fixtures JWT Host/Participant/external, isolamento e cleanup em `src/infrastructure/__tests__/supabase/session-closure.helpers.ts`
- [X] T010 Adicionar `@radix-ui/react-alert-dialog` em `package.json` e `package-lock.json` para uso direto por `src/components/session/CloseSessionButton.tsx` e `src/components/session/SessionClosedDialog.tsx`, sem gerar/migrar componentes legados e sem usar `src/components/ui/button.tsx`
- [X] T011 [P] Preparar fixture Playwright Host + dois Participants por Session isolada em `e2e/fixtures/session-closure.fixture.ts`

## Phase 2 — Foundational

- [X] T012 [P] Definir `SessionRealtimeRow` exatamente com `id/code/status/closed_at` e `SessionRealtimeEnvelope` com `eventType/schema/table/commit_timestamp/new/old/errors`, alem de SessionStatus, ClosedSession, DTOs e snapshots sem `host_id` ou `any`, em `src/domain/session.types.ts`
- [X] T013 [P] Definir erros de domínio e mensagens sanitizadas, incluindo SESSION_CLOSED, RPC_RESULT_CARDINALITY e RPC_RESULT_INVALID, em `src/domain/errors.types.ts`
- [X] T014 Escrever testes do mapper de erros e respostas indistinguíveis em `src/application/__tests__/session-error.mapper.test.ts`
- [X] T015 Implementar mapper e executar seu teste imediatamente em `src/application/session/session-error.mapper.ts`
- [X] T016 Escrever testes de zero, uma, múltiplas linhas e schema inválido em `src/application/shared/__tests__/expect-single-rpc-row.test.ts`
- [X] T017 Implementar helper genérico que recebe `unknown`, exige Array length 1 e valida schema em `src/application/shared/expect-single-rpc-row.ts`, depois executar T016 sem `any` ou casts amplos
- [X] T018 Escrever testes de envelope Realtime valido, `new` com quatro colunas, `old` parcial, `host_id` em `new`, coluna inesperada em `new`, schema/tabela/eventType incorretos, reducer terminal, epoch e writesAllowed fail-closed em `src/domain/__tests__/session-lifecycle.test.ts` e `src/hooks/__tests__/session-lifecycle.reducer.test.ts`
- [X] T019 Implementar schemas separados de `SessionRealtimeEnvelope` e `SessionRealtimeRow`, com validacao estrita somente de `new` e `old` parcial restrito, em `src/domain/session-lifecycle.ts` e reducer em `src/hooks/session-lifecycle.reducer.ts`, depois executar T018
- [X] T020 Escrever `src/application/__tests__/get-session-status.test.ts` para projecao minima, retorno tipado e consulta unica, alem dos testes do contexto/provider em `src/components/__tests__/SessionLifecycleProvider.test.tsx`
- [X] T021 Implementar `getSessionStatus(sessionId)` em `src/application/session/get-session-status.ts` sobre o adapter de `src/infrastructure/supabase/queries/session.queries.ts` e implementar a base do provider em `src/components/session/SessionLifecycleProvider.tsx`; executar T020 e `npm run typecheck` para disponibilizar a query antes de T037

## Phase 3 — User Story 1: Host encerra a sala definitivamente (P1)

- [X] T022 [P] [US1] Escrever pgTAP de constraint, transições, trigger/pg_proc/pg_trigger e baseline válida em `supabase/tests/003_session_closure_invariants.sql`
- [X] T023 [P] [US1] Escrever pgTAP consolidado de join/create/cancel/update-queue/update-session, return types, auth, locks, closed e write ACL em `supabase/tests/003_session_writers.sql`
- [X] T024 [P] [US1] Escrever pgTAP de close_session, owner/non-owner, retorno TABLE, idempotência, timestamp e preservação em `supabase/tests/003_close_session.sql`
- [X] T025 [P] [US1] Escrever testes SQL de um close + 19 retries sequenciais e invariantes pós-corrida em `supabase/tests/003_session_concurrency.sql`
- [X] T026 [P] [US1] Escrever `supabase/tests/003_session_privileges.sql` com table/column privileges, SELECT minimo, INSERT/UPDATE/DELETE diretos negativos para anon/authenticated, closed direto/reabertura/remocao ou alteracao de `closed_at`, EXECUTE RPC, grants e revokes; manter ramo pos-015 de escrita e ramo pos-016 de leitura final
- [X] T027 [P] [US1] Escrever matriz RLS de sessions Host/member/external/unlinked × active/paused/closed, UUID/código conhecido, quatro colunas Realtime, ausência de host_id/recursão/policy residual em `supabase/tests/003_sessions_rls.sql`
- [X] T028 [P] [US1] Escrever matriz RLS de participants com papéis/estados, isolamento, recursão e DML bloqueado em `supabase/tests/003_participants_rls.sql`
- [X] T029 [P] [US1] Escrever matriz RLS de queue com papéis/estados, isolamento, recursão e DML bloqueado em `supabase/tests/003_queue_rls.sql`
- [X] T030 [US1] Escrever corridas pareadas determinísticas close×close/join/create/cancel/pause/resume/update-queue em `src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts`
- [X] T031 [US1] Criar a secao de integridade de `supabase/migrations/20260729100000_015_session_closure_atomic.sql`: transaction/preflight, schema private seguro, constraints e `private.enforce_session_state_transition()` canonica com pg_proc/ACL verificaveis
- [X] T032 [US1] Concluir `supabase/migrations/20260729100000_015_session_closure_atomic.sql` com DROP exato de create/cancel, hardening Session-first de todos os writers e `close_session`; executar literalmente REVOKE INSERT, UPDATE, DELETE ON TABLE para `public.sessions`, `public.participants` e `public.queue` FROM PUBLIC, anon, authenticated; restaurar somente EXECUTE minimo das RPCs autorizadas e COMMIT atomico
- [X] T033 [US1] Adaptar join/create/cancel aos contratos pos-015 em `src/application/participant/join-session.action.ts`, `src/application/queue/create-queue-entry.action.ts` e `src/application/queue/cancel-queue-entry.action.ts`, usando expect-single apenas para create e preservando cancel void; nao publicar nem executar typecheck global ainda
- [X] T034 [US1] Atualizar testes de join/create/cancel, incluindo cardinalidade de create e SESSION_CLOSED, em `src/application/__tests__/join-session.action.test.ts` e `src/application/__tests__/closed-session-writers.test.ts`, sem gate global antes dos tipos pos-015
- [X] T035 [US1] Substituir DML direto por `update_queue_status` e `update_session_status`, normalizando uma linha, em `src/application/queue/update-queue-status.action.ts` e `src/application/session/update-session-status.action.ts`; nao publicar nem executar typecheck global ainda
- [X] T036 [US1] Escrever testes de autorizacao, transicoes, idempotencia, closed e cardinalidade das actions de status em `src/application/__tests__/session-status-writers.test.ts`
- [X] T037 [US1] Implementar o consumidor tipado de `close_session` em `src/application/session/close-session.action.ts`, normalizando uma linha e, quando a resposta ficar incerta, chamando `getSessionStatus(sessionId)` de `src/application/session/get-session-status.ts` antes de permitir retry, sem sucesso otimista nem publicacao
- [X] T038 [US1] Escrever `src/application/__tests__/close-session.action.test.ts` para zero/uma/multiplas linhas, schema, ausencia de sucesso otimista e resposta incerta que obrigatoriamente chama `getSessionStatus(sessionId)` antes de liberar retry
- [X] T039 [US1] No Supabase local controlado e sem aplicacao publicada, aplicar somente a 015 com `npx --no-install supabase migration up --local` e registrar em `specs/003-close-session/validation/migration-015.md`
- [X] T040 [US1] Verificar `20260729100000` com `npx --no-install supabase migration list --local` e registrar a history em `specs/003-close-session/validation/migration-015.md`
- [X] T041 [US1] Gerar `src/infrastructure/supabase/database.types.ts` pos-015 com `System.IO.File.WriteAllText`/UTF8Encoding(false), validar encoding, writers e `close_session` antes de compilar consumidores
- [X] T042 [US1] Executar o gate SQL pos-015 com os cinco comandos literais abaixo, bloquear 016 em qualquer falha e registrar em `specs/003-close-session/validation/gate-015.md`
Comandos obrigatorios de T042:

```powershell
npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local
npx --no-install supabase test db supabase/tests/003_session_writers.sql --local
npx --no-install supabase test db supabase/tests/003_close_session.sql --local
npx --no-install supabase test db supabase/tests/003_session_concurrency.sql --local
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
```
- [X] T043 [US1] Executar `npm run test:db:race` com tres conexoes, duas ordens e um close + 19 retries sequenciais; registrar em `specs/003-close-session/validation/gate-015-concurrency.md`
- [X] T044 [US1] Depois de T041-T043, executar `npm run typecheck` e `npx vitest run` incluindo helper, consumidores e integracao pos-015; registrar em `specs/003-close-session/validation/consumers-015.md` e impedir 016 em falha
- [X] T045 [US1] Criar `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql` com helpers, DROP policies legadas, REVOKE SELECT amplo, grants por coluna, policies finais, `get_host_session_details(uuid) RETURNS TABLE`, publication Session, reload e transaction unica
- [X] T046 [US1] Aplicar somente a 016 com `npx --no-install supabase migration up --local` depois do gate T044 verde e registrar em `specs/003-close-session/validation/migration-016.md`
- [X] T047 [US1] Verificar `20260729101000` em migration history e registrar em `specs/003-close-session/validation/migration-016.md`
- [X] T048 [US1] Regenerar `src/infrastructure/supabase/database.types.ts` pos-016 com UTF-8 sem BOM e validar `get_host_session_details`, `close_session`, campos finais e generic Database antes de compilar qualquer dependente da 016
- [X] T049 [US1] Estender `src/application/__tests__/get-session-status.test.ts` e `src/infrastructure/__tests__/session.queries.test.ts` apos os tipos da 016 para RLS/projecao minima finais, Host/member/external e cardinalidade de `get_host_session_details`
- [X] T050 [US1] Implementar a query tipada de `get_host_session_details` em `src/infrastructure/supabase/queries/session.queries.ts`, preservar `getSessionStatus(sessionId)` como unica query de status compartilhada e executar T049
- [X] T051 [US1] Criar teste tipado Realtime em `src/infrastructure/realtime/session-realtime.integration.test.ts` para Host/member/external, assinatura UPDATE/public/sessions com select de `id/code/status/closed_at`, envelope valido, `new` exato, `old` parcial, rejeicao de `host_id`/coluna inesperada/schema/tabela/eventType incorretos e isolamento
- [X] T052 [US1] Executar o gate pos-016 com os quatro comandos SQL literais abaixo, depois `npx vitest run src/infrastructure/realtime/session-realtime.integration.test.ts` e `npm run typecheck`; o gate nao passa por execucao Vitest global posterior e registra pg_policies, grants, envelope/projecao e isolamento em `specs/003-close-session/validation/gate-016.md`
Comandos obrigatorios de T052:

```powershell
- [X] T052 [US1] Executar o gate pos-016 com os comandos literais abaixo, depois `npx vitest run src/infrastructure/realtime/session-realtime.integration.test.ts` e `npm run typecheck`; registra pg_policies, grants, envelope/projecao e isolamento em `specs/003-close-session/validation/gate-016.md`
- [X] T053 [US1] Criar os testes de `CloseSessionButton` em `src/components/__tests__/CloseSessionButton.test.tsx` visando 100% de coverage para Host-only, destructive, loading, deduplicacao, erro, cancelamento (zero RPC) e offline sem importar nada de base-ui/react`/`src/components/ui/button.tsx` nos novos componentes; cobrir inicialmente offline, transicao online->offline, texto acessivel de conexao necessaria, zero RPC offline e loading/offline sempre sem clique
- [X] T054 [US1] Implementar `CloseSessionButton` exportado por `src/components/session/CloseSessionButton.tsx` consumindo `closeSessionAction` nativamente via `<button>` ou `@radix-ui/react-alert-dialog`, com visual "destructive", min-h 48px e disabled state durante operacao/offlinelwind/CVA e sem imports `@base-ui/react`/`src/components/ui/button.tsx`; desabilitar quando `navigator.onLine === false` ou loading e exibir texto acessivel de conexao necessaria, depois executar T053
- [X] T055 [US1] Executar `e2e/close-session-host.spec.ts` cobrindo active/paused, outro Host, retry, preservacao e desistência da confirmacao sem qualquer RPC, com status/closed_at inalterados, fila/participantes interativos e foco devolvido; registrar `specs/003-close-session/validation/us1.md`

## Phase 4 — User Story 2: Todos recebem o encerramento sem F5 (P1)

- [X] T056 [US2] Modificar `src/hooks/session-lifecycle.reducer.ts` para que `SESSION_UPDATED` e a transicao de reconexao manipulem `snapshot.closedAt` de null para preenchido e transitem ao status `'closed'` de forma coesa (rejeitar fechamento sem data, preencher data retroativa caso omitida)os `.on()` antes de subscribe, cleanup, Strict Mode e deduplicacao
- [X] T057 [US2] Implementar assinatura Session Realtime e epoch em `src/hooks/useSessionLifecycle.ts`, mantendo filtro/select complementares à RLS, depois executar T056
- [X] T058 [US2] Escrever `src/components/__tests__/SessionClosedDialog.test.tsx` para textos, foco, 48px, sem X/Escape/outside, precedencia e ausencia de imports `@base-ui/react`/`src/components/ui/button.tsx` em `src/components/session/SessionClosedDialog.tsx`
- [X] T059 [US2] Implementar `src/components/session/SessionClosedDialog.tsx` importando diretamente `@radix-ui/react-alert-dialog`, com action em `button` HTML semantico estilizado por Tailwind/CVA, sem `@base-ui/react` nem `src/components/ui/button.tsx`, depois executar T058
- [X] T060 [P] [US2] Montar provider/modal no Host mantendo Server Component em `app/sala/[code]/dj/page.tsx`
- [X] T061 [P] [US2] Montar provider/modal no Participant mantendo Server Component em `app/sala/[code]/page.tsx`
- [X] T062 [US2] Estender `src/infrastructure/realtime/session-realtime.integration.test.ts` para entrega do envelope completo e `new` com quatro colunas a Host/member, `old` parcial, ausencia de host_id, payload invalido fail-closed e isolamento cross-session
- [X] T063 [US2] Escrever E2E Host + dois Participants e exatamente 20 entregas/p95 em `e2e/close-session-realtime.spec.ts`
- [X] T064 [US2] Escrever cenário Slow 3G, loading, incerteza, resync e chamada única em `e2e/close-session-slow-network.spec.ts`
- [X] T065 [US2] Executar testes US2 e salvar evidências em `specs/003-close-session/validation/us2.md`, `specs/003-close-session/validation/realtime-p95/automated-local.json` e `specs/003-close-session/validation/slow-network-e2e.json`

## Phase 5 — User Story 3: Estado final após desconexão ou refresh (P1)

- [X] T066 [P] [US3] Estender `src/hooks/__tests__/useSessionLifecycle.test.tsx` e `src/application/__tests__/get-session-status.test.ts` para provar que initial load, reconnect, CHANNEL_ERROR, TIMED_OUT, token, online, retorno de aba suspensa/BFCache, evento perdido e close_session incerto chamam a mesma `getSessionStatus(sessionId)`
- [X] T067 [P] [US3] Escrever teste de política do Service Worker para excluir sala/RSC/Auth/RPC/dados privados em `src/infrastructure/__tests__/service-worker-policy.test.ts`
- [X] T068 [US3] Escrever E2E de refresh, URL direta, offline, evento perdido, aba suspensa e token renovado em `e2e/close-session-recovery.spec.ts` e `e2e/close-session-reconnect.spec.ts`
- [X] T069 [US3] Implementar resync fail-closed em `src/hooks/useSessionLifecycle.ts` chamando exclusivamente `getSessionStatus(sessionId)` de `src/application/session/get-session-status.ts` em reconnect, CHANNEL_ERROR, TIMED_OUT, retorno de aba suspensa e demais triggers aprovados
- [X] T070 [US3] Ajustar carregamento inicial closed em `app/sala/[code]/page.tsx` e `app/sala/[code]/dj/page.tsx` para usar `getSessionStatus(sessionId)` e evitar consultas Queue/Participant quando closed
- [X] T071 [US3] Restringir consultas Participant e atualizar Service Worker sem cache privado em `src/infrastructure/supabase/queries/participant.queries.ts` e `public/sw.js`
- [X] T072 [US3] Executar testes de hook/query/SW e E2E recovery/reconnect; registrar em `specs/003-close-session/validation/us3.md`
- [X] T073 [US3] Auditar ausência de setInterval/polling e writes fail-closed em `specs/003-close-session/validation/us3-no-polling.md`

## Phase 6 — User Story 4: Toda escrita é bloqueada após closed (P1)

- [X] T074 [US4] Escrever testes de controles desabilitados, cardinalidade já normalizada e resposta tardia ignorada em `src/components/__tests__/SessionWriteControls.test.tsx`
- [X] T075 [US4] Aplicar writesAllowed/epoch em `src/components/queue/RequestSongForm.tsx`, `src/components/queue/QueueItem.tsx`, `src/components/queue/QueueList.tsx` e `src/components/session/SessionStatusToggle.tsx`, depois executar T074
- [X] T076 [US4] Escrever/executar preservação e E2E de todos os writers bloqueados em `src/infrastructure/__tests__/session-closure-preservation.integration.test.ts` e `e2e/close-session-write-blocking.spec.ts`
- [X] T077 [US4] Executar gate US4 incluindo consumidores adaptados em T033–T038 e registrar resultados em `specs/003-close-session/validation/us4.md`

## Phase 7 — User Story 5: Usuário volta ao início (P2)

- [X] T078 [US5] Escrever testes de cleanup room-scoped preservando Auth/cookies/outra sala em `src/hooks/__tests__/session-room-cleanup.test.ts`
- [X] T079 [US5] Implementar cleanup sem signOut/tokens em `src/hooks/session-room-cleanup.ts`, depois executar T078
- [X] T080 [US5] Estender testes do modal com replace `/`, Back, popstate, gesto, BFCache e revisita closed em `src/components/__tests__/SessionClosedDialog.test.tsx`
- [X] T081 [US5] Escrever E2E de navegação, múltiplas abas e SC-008 ≤5 s em `e2e/close-session-leave.spec.ts`, cronometrando clique→URL `/` em Chromium 390×844, Supabase local e loopback sem throttling
- [X] T082 [US5] Integrar cleanup/router.replace e canais em `src/components/session/SessionLifecycleProvider.tsx`, `src/components/session/SessionClosedDialog.tsx` e `src/components/participant/ParticipantsList.tsx`
- [X] T083 [US5] Executar testes US5 e registrar duração/ambiente em `specs/003-close-session/validation/us5.md` e `specs/003-close-session/validation/sc-008-navigation.md`

## Phase 8 — Polish & Cross-Cutting Concerns

- [X] T084 [P] Auditar WCAG 2.1 AA, foco Radix, feedback e touch targets em `specs/003-close-session/validation/accessibility.md`
- [X] T085 [P] Auditar Mobile Chrome/Safari, dark mode e uma mão em `specs/003-close-session/validation/mobile.md`
- [X] T086 Corrigir achados acessíveis/mobile em `src/components/session/CloseSessionButton.tsx`, `src/components/session/SessionClosedDialog.tsx`, `src/components/queue/QueueItem.tsx` e `src/components/session/SessionStatusToggle.tsx`
- [X] T087 Auditar migrations, pg_proc, RETURNS TABLE, DROP, locks, ACL, grants e pg_policies em `specs/003-close-session/validation/database-security.md`
- [X] T088 Auditar Realtime select de quatro colunas, ausência de host_id, offline, cleanup, SW e tokens em `specs/003-close-session/validation/runtime-security.md`
- [X] T089 Executar p95 real representativo e validação manual Host + dois Participants em `specs/003-close-session/validation/realtime-p95/real-environment.json` e `specs/003-close-session/validation/final-manual.md`
- [X] T090 Ensaiar em ambiente local de pre-producao a ordem aplicacao adaptada sem publicacao -> 015 -> tipos -> SQL/harness -> typecheck/Vitest/integracao -> 016 -> tipos finais -> RLS/Realtime/integracao/E2E -> lint/build; registrar resultado em `specs/003-close-session/validation/preproduction-cutover.md` sem publicar
- [X] T091 Executar o gate final fail-fast com os comandos literais abaixo: iniciar/resetar Supabase local, verificar history, gerar tipos finais UTF-8 sem BOM, executar os oito testes SQL, harness, Vitest, integracao/E2E, lint, typecheck e build; somente apos tudo verde registrar autorizacao para a primeira publicacao em `specs/003-close-session/validation/final-gate.md` e atualizar `specs/003-close-session/quickstart.md`
Comandos obrigatorios de T091:

```powershell
npx --no-install supabase start
npx --no-install supabase db reset --local
npx --no-install supabase migration list --local
$generated = (& npx --no-install supabase gen types typescript --local --schema public | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar tipos Supabase.' }
$target = Join-Path (Get-Location) 'src/infrastructure/supabase/database.types.ts'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $generated, $utf8NoBom)
$bytes = [System.IO.File]::ReadAllBytes($target)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { throw 'BOM UTF-8 inesperado.' }
npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local
npx --no-install supabase test db supabase/tests/003_session_writers.sql --local
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
npx --no-install supabase test db supabase/tests/003_sessions_rls.sql --local
npx --no-install supabase test db supabase/tests/003_participants_rls.sql --local
npx --no-install supabase test db supabase/tests/003_queue_rls.sql --local
npx --no-install supabase test db supabase/tests/003_close_session.sql --local
npx --no-install supabase test db supabase/tests/003_session_concurrency.sql --local
npm run test:db:race
npx vitest run
npm run test:e2e
npm run lint
npm run typecheck
npm run build
```

## Dependências e caminho crítico

- Setup `T001–T011` → Foundational `T012–T021`.
- US1/MVP `T022–T055` cria testes e adapta consumidores sem publicar, aplica 015, gera tipos, fecha os gates SQL/aplicacao, aplica 016 e fecha RLS/Realtime.
- US2 `T056–T065` depende de T052, do provider e do AlertDialog Radix T010.
- US3 `T066–T073` depende de US2.
- US4 `T074–T077` depende dos consumidores T033–T038 e do lifecycle.
- US5 `T078–T083` depende do modal/lifecycle.
- Polish `T084–T091` depende de todas as histórias.

### Ordem unica de pre-producao

1. Testes/fixtures e aplicacao adaptada, sem publicacao: `T022-T038`.
2. Aplicar 015: `T039` -> history `T040` -> tipos `T041`.
3. Gate SQL `T042` -> harness `T043` -> typecheck/Vitest/integracao `T044`; 016 e proibida enquanto falharem.
4. Criar/aplicar 016 `T045-T047` -> tipos finais `T048` -> queries/testes tipados `T049-T051` -> gate RLS/Realtime `T052`.
5. Completar historias, auditorias e E2E `T053-T090` -> gate final `T091`.
6. A primeira publicacao desta versao somente pode ser autorizada depois de `T091` verde; nenhuma tarefa anterior publica a aplicacao.
### Test-first e paralelização

- SQL files distintos `T022–T029` podem ser escritos em paralelo; não são executados antes dos objetos.
- Pares regulares são teste→implementação: `T014→T015`, `T016→T017`, `T018→T019`, `T020→T021`, `T049→T050`, `T053→T054`, `T056→T057`, `T058→T059`, `T066→T069`, `T067→T071`, `T074→T075`, `T078→T079`.
- O bloco de compatibilidade segue consumidor→teste (`T033→T034`, `T035→T036`, `T037→T038`) antes da aplicacao controlada; nao existe gate global nem publicacao entre esses pares.
- Rotas Host/Participant `T060–T061` são paralelas depois do hook/modal.
- Nenhuma migration, aplicação, gate ou geração de tipos é `[P]`.

### Caminho crítico

`T001–T021 -> T022–T038 -> T039–T044 -> T045–T055 -> T056–T065 -> T066–T073 -> T074–T077 -> T078–T083 -> T084–T091`.

### Checkpoints

- MVP/US1: `T055`.
- Realtime/modal: `T065`.
- Recovery: `T073`.
- Writes bloqueados: `T077`.
- Navegação: `T083`.
- Feature concluída somente com `T091` verde.

**Total**: 91 tarefas. **MVP sugerido**: Setup + Foundational + US1.


## Phase 9: Convergence

- [X] T092 CRITICAL Remover `any` e o disable de `@typescript-eslint/no-explicit-any` de `src/hooks/useSessionLifecycle.ts` e seus testes, receber payload Realtime como `unknown`, validá-lo com `parseSessionRealtimeEnvelope` antes de qualquer dispatch e provar rejeição fail-closed de colunas/envelopes inesperados per Constitution IV, plan: Realtime envelope e SR-008 (contradicts)
- [X] T093 Ajustar `src/components/session/SessionClosedDialog.tsx` e seus testes para exibir exatamente o título “Sala encerrada”, a mensagem “O DJ encerrou esta sessão de karaokê.” e a ação “Voltar para o início” per FR-012 (contradicts)
- [X] T094 Implementar cleanup room-scoped real e aguardável antes de `router.replace('/')`, encerrando canais e removendo somente estado/snapshots/cache da Session e Queue daquela sala, preservando Supabase Auth, cookies e outras salas; ampliar testes de múltiplas abas per FR-014 e AC-006 (partial)
- [X] T095 Reescrever `e2e/close-session-realtime.spec.ts` para exigir modal no Host e em dois Participants sem reload, executar exatamente 20 entregas, calcular p95 <= 2 s e salvar evidência em `specs/003-close-session/validation/realtime-p95/automated-local.json` per FR-008, SC-002 e AC-004 (partial)
- [X] T096 Criar `e2e/close-session-slow-network.spec.ts` cobrindo Slow 3G, loading contínuo, chamada única, resposta perdida/incerta e resync sem sucesso prematuro; salvar `specs/003-close-session/validation/slow-network-e2e.json` per NFR-002, NFR-005 e SC-006 (missing)
- [X] T097 Completar `e2e/close-session-recovery.spec.ts` e criar `e2e/close-session-reconnect.spec.ts` para refresh, URL direta, offline durante o close, evento Realtime perdido, aba suspensa/BFCache, reconexão e token renovado per SC-003 e AC-008 (partial)
- [X] T098 Fortalecer `e2e/close-session-write-blocking.spec.ts` para tentar entrada, criação, cancelamento, pause/resume e alteração de status após closed, verificando respostas amigáveis e dados inalterados no servidor per SC-004 e AC-007 (partial)
- [X] T099 Após T092–T098, executar novamente SQL, race harness, Vitest, Playwright, lint, typecheck e build; criar as evidências ausentes `validation/us2.md` e `validation/us3.md` e reconciliar `validation/final-gate.md` apenas com resultados atuais per NFR-007, SC-010 e AC-012 (partial)

**Convergence**: 8 tarefas adicionais. Novo total histórico: 99 tarefas.
