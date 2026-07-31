# Tasks: Encerramento de Sessão

**Feature**: `003-close-session` | **Fonte**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

## Phase 1 — Setup

- [ ] T001 Verificar branch `003-close-session`, `.specify/feature.json` apontando `specs/003-close-session` e `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` retornando esse FEATURE_DIR; abortar em main/002 e registrar em `specs/003-close-session/validation/baseline.md`
- [ ] T002 Inventariar scripts/dependências e validar `components.json` com estilo shadcn `new-york`, aliases atuais e configuração Radix compatível em `package.json`, `package-lock.json`, `components.json` e `supabase/config.toml`
- [ ] T003 Fixar Supabase CLI `2.106.0` como devDependency exata, com lock reproduzível, em `package.json` e `package-lock.json`
- [ ] T004 Executar preflight somente leitura com versão e `--help` de migration, migration up/list, db reset, test db e gen types; registrar falha objetiva em `specs/003-close-session/validation/supabase-cli-preflight.md`
- [ ] T005 Habilitar Anonymous Auth somente no ambiente local, iniciar `supabase start`, validar Database/Auth/Realtime e status loopback sem imprimir segredos em `supabase/config.toml` e `specs/003-close-session/validation/supabase-local-runtime.md`
- [ ] T006 Adicionar `pg` e `@types/pg` como devDependencies em `package.json` e `package-lock.json`
- [ ] T007 Escrever testes do bootstrap loopback-only, três clients, barreira e cleanup em `src/infrastructure/__tests__/supabase/postgres-race-harness.test.ts`
- [ ] T008 Implementar `src/infrastructure/__tests__/supabase/postgres-race-harness.ts`, `scripts/test-db-race-local.ps1` e `test:db:race` em `package.json`, obtendo/validando DB_URL e iniciando Vitest no mesmo processo sem persistir credenciais
- [ ] T009 [P] Preparar fixtures JWT Host/Participant/external, isolamento e cleanup em `src/infrastructure/__tests__/supabase/session-closure.helpers.ts`
- [ ] T010 Adicionar `@radix-ui/react-alert-dialog` e o AlertDialog shadcn/Radix em `package.json`, `package-lock.json` e `src/components/ui/alert-dialog.tsx`, preservando `components.json` e sem substituir componentes existentes
- [ ] T011 [P] Preparar fixture Playwright Host + dois Participants por Session isolada em `e2e/fixtures/session-closure.fixture.ts`

## Phase 2 — Foundational

- [ ] T012 [P] Definir `SessionRealtimeRow` exatamente com `id/code/status/closed_at` e `SessionRealtimeEnvelope` com `eventType/schema/table/commit_timestamp/new/old/errors`, alem de SessionStatus, ClosedSession, DTOs e snapshots sem `host_id` ou `any`, em `src/domain/session.types.ts`
- [ ] T013 [P] Definir erros de domínio e mensagens sanitizadas, incluindo SESSION_CLOSED, RPC_RESULT_CARDINALITY e RPC_RESULT_INVALID, em `src/domain/errors.types.ts`
- [ ] T014 Escrever testes do mapper de erros e respostas indistinguíveis em `src/application/__tests__/session-error.mapper.test.ts`
- [ ] T015 Implementar mapper e executar seu teste imediatamente em `src/application/session/session-error.mapper.ts`
- [ ] T016 Escrever testes de zero, uma, múltiplas linhas e schema inválido em `src/application/shared/__tests__/expect-single-rpc-row.test.ts`
- [ ] T017 Implementar helper genérico que recebe `unknown`, exige Array length 1 e valida schema em `src/application/shared/expect-single-rpc-row.ts`, depois executar T016 sem `any` ou casts amplos
- [ ] T018 Escrever testes de envelope Realtime valido, `new` com quatro colunas, `old` parcial, `host_id` em `new`, coluna inesperada em `new`, schema/tabela/eventType incorretos, reducer terminal, epoch e writesAllowed fail-closed em `src/domain/__tests__/session-lifecycle.test.ts` e `src/hooks/__tests__/session-lifecycle.reducer.test.ts`
- [ ] T019 Implementar schemas separados de `SessionRealtimeEnvelope` e `SessionRealtimeRow`, com validacao estrita somente de `new` e `old` parcial restrito, em `src/domain/session-lifecycle.ts` e reducer em `src/hooks/session-lifecycle.reducer.ts`, depois executar T018
- [ ] T020 Escrever testes do contexto/provider e capabilities em `src/components/__tests__/SessionLifecycleProvider.test.tsx`
- [ ] T021 Implementar base de `SessionLifecycleProvider` e contexto em `src/components/session/SessionLifecycleProvider.tsx`, executar testes Foundational e `npm run typecheck`

## Phase 3 — User Story 1: Host encerra a sala definitivamente (P1)

- [ ] T022 [P] [US1] Escrever pgTAP de constraint, transições, trigger/pg_proc/pg_trigger e baseline válida em `supabase/tests/003_session_closure_invariants.sql`
- [ ] T023 [P] [US1] Escrever pgTAP consolidado de join/create/cancel/update-queue/update-session, return types, auth, locks, closed e write ACL em `supabase/tests/003_session_writers.sql`
- [ ] T024 [P] [US1] Escrever pgTAP de close_session, owner/non-owner, retorno TABLE, idempotência, timestamp e preservação em `supabase/tests/003_close_session.sql`
- [ ] T025 [P] [US1] Escrever testes SQL de um close + 19 retries sequenciais e invariantes pós-corrida em `supabase/tests/003_session_concurrency.sql`
- [ ] T026 [P] [US1] Escrever `supabase/tests/003_session_privileges.sql` com table/column privileges, SELECT minimo, INSERT/UPDATE/DELETE diretos negativos para anon/authenticated, closed direto/reabertura/remocao ou alteracao de `closed_at`, EXECUTE RPC, grants e revokes; manter ramo pos-015 de escrita e ramo pos-016 de leitura final
- [ ] T027 [P] [US1] Escrever matriz RLS de sessions Host/member/external/unlinked × active/paused/closed, UUID/código conhecido, quatro colunas Realtime, ausência de host_id/recursão/policy residual em `supabase/tests/003_sessions_rls.sql`
- [ ] T028 [P] [US1] Escrever matriz RLS de participants com papéis/estados, isolamento, recursão e DML bloqueado em `supabase/tests/003_participants_rls.sql`
- [ ] T029 [P] [US1] Escrever matriz RLS de queue com papéis/estados, isolamento, recursão e DML bloqueado em `supabase/tests/003_queue_rls.sql`
- [ ] T030 [US1] Escrever corridas pareadas determinísticas close×close/join/create/cancel/pause/resume/update-queue em `src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts`
- [ ] T031 [US1] Criar a secao de integridade de `supabase/migrations/20260729100000_015_session_closure_atomic.sql`: transaction/preflight, schema private seguro, constraints e `private.enforce_session_state_transition()` canonica com pg_proc/ACL verificaveis
- [ ] T032 [US1] Concluir `supabase/migrations/20260729100000_015_session_closure_atomic.sql` com DROP exato de create/cancel, hardening Session-first de todos os writers e `close_session`; executar literalmente REVOKE INSERT, UPDATE, DELETE ON TABLE para `public.sessions`, `public.participants` e `public.queue` FROM PUBLIC, anon, authenticated; restaurar somente EXECUTE minimo das RPCs autorizadas e COMMIT atomico
- [ ] T033 [US1] Adaptar join/create/cancel aos contratos pos-015 em `src/application/participant/join-session.action.ts`, `src/application/queue/create-queue-entry.action.ts` e `src/application/queue/cancel-queue-entry.action.ts`, usando expect-single apenas para create e preservando cancel void; nao publicar nem executar typecheck global ainda
- [ ] T034 [US1] Atualizar testes de join/create/cancel, incluindo cardinalidade de create e SESSION_CLOSED, em `src/application/__tests__/join-session.action.test.ts` e `src/application/__tests__/closed-session-writers.test.ts`, sem gate global antes dos tipos pos-015
- [ ] T035 [US1] Substituir DML direto por `update_queue_status` e `update_session_status`, normalizando uma linha, em `src/application/queue/update-queue-status.action.ts` e `src/application/session/update-session-status.action.ts`; nao publicar nem executar typecheck global ainda
- [ ] T036 [US1] Escrever testes de autorizacao, transicoes, idempotencia, closed e cardinalidade das actions de status em `src/application/__tests__/session-status-writers.test.ts`
- [ ] T037 [US1] Implementar o consumidor tipado de `close_session`, normalizando uma linha e tratando resposta incerta sem sucesso otimista, em `src/application/session/close-session.action.ts`; nao publicar nem executar typecheck global ainda
- [ ] T038 [US1] Escrever testes de close action para zero/uma/multiplas linhas, schema, resposta incerta e ausencia de sucesso otimista em `src/application/__tests__/close-session.action.test.ts`
- [ ] T039 [US1] No Supabase local controlado e sem aplicacao publicada, aplicar somente a 015 com `npx --no-install supabase migration up --local` e registrar em `specs/003-close-session/validation/migration-015.md`
- [ ] T040 [US1] Verificar `20260729100000` com `npx --no-install supabase migration list --local` e registrar a history em `specs/003-close-session/validation/migration-015.md`
- [ ] T041 [US1] Gerar `src/infrastructure/supabase/database.types.ts` pos-015 com `System.IO.File.WriteAllText`/UTF8Encoding(false), validar encoding, writers e `close_session` antes de compilar consumidores
- [ ] T042 [US1] Executar o gate SQL pos-015 com os cinco comandos literais abaixo, bloquear 016 em qualquer falha e registrar em `specs/003-close-session/validation/gate-015.md`
Comandos obrigatorios de T042:

```powershell
npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local
npx --no-install supabase test db supabase/tests/003_session_writers.sql --local
npx --no-install supabase test db supabase/tests/003_close_session.sql --local
npx --no-install supabase test db supabase/tests/003_session_concurrency.sql --local
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
```
- [ ] T043 [US1] Executar `npm run test:db:race` com tres conexoes, duas ordens e um close + 19 retries sequenciais; registrar em `specs/003-close-session/validation/gate-015-concurrency.md`
- [ ] T044 [US1] Depois de T041-T043, executar `npm run typecheck` e `npx vitest run` incluindo helper, consumidores e integracao pos-015; registrar em `specs/003-close-session/validation/consumers-015.md` e impedir 016 em falha
- [ ] T045 [US1] Criar `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql` com helpers, DROP policies legadas, REVOKE SELECT amplo, grants por coluna, policies finais, `get_host_session_details(uuid) RETURNS TABLE`, publication Session, reload e transaction unica
- [ ] T046 [US1] Aplicar somente a 016 com `npx --no-install supabase migration up --local` depois do gate T044 verde e registrar em `specs/003-close-session/validation/migration-016.md`
- [ ] T047 [US1] Verificar `20260729101000` em migration history e registrar em `specs/003-close-session/validation/migration-016.md`
- [ ] T048 [US1] Regenerar `src/infrastructure/supabase/database.types.ts` pos-016 com UTF-8 sem BOM e validar `get_host_session_details`, `close_session`, campos finais e generic Database antes de compilar qualquer dependente da 016
- [ ] T049 [US1] Escrever testes de projeção mínima, point-read e cardinalidade de get_host_session_details em `src/infrastructure/__tests__/session.queries.test.ts`
- [ ] T050 [US1] Implementar queries tipadas com expect-single para get_host_session_details em `src/infrastructure/supabase/queries/session.queries.ts`, depois executar T049
- [ ] T051 [US1] Criar teste tipado Realtime em `src/infrastructure/__tests__/session-realtime.integration.test.ts` para Host/member/external, assinatura UPDATE/public/sessions com select de `id/code/status/closed_at`, envelope valido, `new` exato, `old` parcial, rejeicao de `host_id`/coluna inesperada/schema/tabela/eventType incorretos e isolamento
- [ ] T052 [US1] Executar o gate pos-016 com os quatro comandos SQL literais abaixo, depois T049/T051 e `npm run typecheck`; registrar pg_policies, grants, envelope/projecao e isolamento em `specs/003-close-session/validation/gate-016.md`
Comandos obrigatorios de T052:

```powershell
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
npx --no-install supabase test db supabase/tests/003_sessions_rls.sql --local
npx --no-install supabase test db supabase/tests/003_participants_rls.sql --local
npx --no-install supabase test db supabase/tests/003_queue_rls.sql --local
```
- [ ] T053 [US1] Escrever em `src/components/__tests__/CloseSessionButton.test.tsx` testes Host-only/destructive/48px/loading/deduplicacao/erro/incerteza e cancelamento do AlertDialog: nenhuma RPC/close_session, status inalterado, closed_at null, controles interativos, dialogo fechado e foco devolvido ao botao
- [ ] T054 [US1] Implementar/integrar `CloseSessionButton` com AlertDialog shadcn/Radix, sem sucesso otimista, em `src/components/session/CloseSessionButton.tsx` e `app/sala/[code]/dj/page.tsx`, depois executar T053
- [ ] T055 [US1] Executar `e2e/close-session-host.spec.ts` cobrindo active/paused, outro Host, retry, preservacao e desistência da confirmacao sem qualquer RPC, com status/closed_at inalterados, fila/participantes interativos e foco devolvido; registrar `specs/003-close-session/validation/us1.md`

## Phase 4 — User Story 2: Todos recebem o encerramento sem F5 (P1)

- [ ] T056 [US2] Escrever `src/hooks/__tests__/useSessionLifecycle.test.tsx` para JWT, envelope UPDATE/public/sessions, `new` exato com quatro colunas, `old` parcial, rejeicao de host_id/coluna inesperada/schema/tabela/eventType incorretos, todos `.on()` antes de subscribe, cleanup, Strict Mode e deduplicacao
- [ ] T057 [US2] Implementar assinatura Session Realtime e epoch em `src/hooks/useSessionLifecycle.ts`, mantendo filtro/select complementares à RLS, depois executar T056
- [ ] T058 [US2] Escrever testes do modal shadcn/Radix para textos, foco, 48px, sem X/Escape/outside e precedência em `src/components/__tests__/SessionClosedDialog.test.tsx`
- [ ] T059 [US2] Implementar modal não dispensável em `src/components/session/SessionClosedDialog.tsx` com AlertDialog shadcn/Radix, depois executar T058
- [ ] T060 [P] [US2] Montar provider/modal no Host mantendo Server Component em `app/sala/[code]/dj/page.tsx`
- [ ] T061 [P] [US2] Montar provider/modal no Participant mantendo Server Component em `app/sala/[code]/page.tsx`
- [ ] T062 [US2] Estender `src/infrastructure/__tests__/session-realtime.integration.test.ts` para entrega do envelope completo e `new` com quatro colunas a Host/member, `old` parcial, ausencia de host_id, payload invalido fail-closed e isolamento cross-session
- [ ] T063 [US2] Escrever E2E Host + dois Participants e exatamente 20 entregas/p95 em `e2e/close-session-realtime.spec.ts`
- [ ] T064 [US2] Escrever cenário Slow 3G, loading, incerteza, resync e chamada única em `e2e/close-session-slow-network.spec.ts`
- [ ] T065 [US2] Executar testes US2 e salvar evidências em `specs/003-close-session/validation/us2.md`, `specs/003-close-session/validation/realtime-p95/automated-local.json` e `specs/003-close-session/validation/slow-network-e2e.json`

## Phase 5 — User Story 3: Estado final após desconexão ou refresh (P1)

- [ ] T066 [P] [US3] Estender testes de hook/query para initial load, reconnect, token, online, visible, BFCache e evento perdido em `src/hooks/__tests__/useSessionLifecycle.test.tsx` e `src/infrastructure/__tests__/session.queries.test.ts`
- [ ] T067 [P] [US3] Escrever teste de política do Service Worker para excluir sala/RSC/Auth/RPC/dados privados em `src/infrastructure/__tests__/service-worker-policy.test.ts`
- [ ] T068 [US3] Escrever E2E de refresh, URL direta, offline, evento perdido, aba suspensa e token renovado em `e2e/close-session-recovery.spec.ts` e `e2e/close-session-reconnect.spec.ts`
- [ ] T069 [US3] Implementar resync fail-closed orientado a eventos em `src/hooks/useSessionLifecycle.ts`
- [ ] T070 [US3] Ajustar carregamento inicial closed e evitar Queue/Participant em `app/sala/[code]/page.tsx` e `app/sala/[code]/dj/page.tsx`
- [ ] T071 [US3] Restringir consultas Participant e atualizar Service Worker sem cache privado em `src/infrastructure/supabase/queries/participant.queries.ts` e `public/sw.js`
- [ ] T072 [US3] Executar testes de hook/query/SW e E2E recovery/reconnect; registrar em `specs/003-close-session/validation/us3.md`
- [ ] T073 [US3] Auditar ausência de setInterval/polling e writes fail-closed em `specs/003-close-session/validation/us3-no-polling.md`

## Phase 6 — User Story 4: Toda escrita é bloqueada após closed (P1)

- [ ] T074 [US4] Escrever testes de controles desabilitados, cardinalidade já normalizada e resposta tardia ignorada em `src/components/__tests__/SessionWriteControls.test.tsx`
- [ ] T075 [US4] Aplicar writesAllowed/epoch em `src/components/queue/RequestSongForm.tsx`, `src/components/queue/QueueItem.tsx`, `src/components/queue/QueueList.tsx` e `src/components/session/SessionStatusToggle.tsx`, depois executar T074
- [ ] T076 [US4] Escrever/executar preservação e E2E de todos os writers bloqueados em `src/infrastructure/__tests__/session-closure-preservation.integration.test.ts` e `e2e/close-session-write-blocking.spec.ts`
- [ ] T077 [US4] Executar gate US4 incluindo consumidores adaptados em T033–T038 e registrar resultados em `specs/003-close-session/validation/us4.md`

## Phase 7 — User Story 5: Usuário volta ao início (P2)

- [ ] T078 [US5] Escrever testes de cleanup room-scoped preservando Auth/cookies/outra sala em `src/hooks/__tests__/session-room-cleanup.test.ts`
- [ ] T079 [US5] Implementar cleanup sem signOut/tokens em `src/hooks/session-room-cleanup.ts`, depois executar T078
- [ ] T080 [US5] Estender testes do modal com replace `/`, Back, popstate, gesto, BFCache e revisita closed em `src/components/__tests__/SessionClosedDialog.test.tsx`
- [ ] T081 [US5] Escrever E2E de navegação, múltiplas abas e SC-008 ≤5 s em `e2e/close-session-leave.spec.ts`, cronometrando clique→URL `/` em Chromium 390×844, Supabase local e loopback sem throttling
- [ ] T082 [US5] Integrar cleanup/router.replace e canais em `src/components/session/SessionLifecycleProvider.tsx`, `src/components/session/SessionClosedDialog.tsx` e `src/components/participant/ParticipantsList.tsx`
- [ ] T083 [US5] Executar testes US5 e registrar duração/ambiente em `specs/003-close-session/validation/us5.md` e `specs/003-close-session/validation/sc-008-navigation.md`

## Phase 8 — Polish & Cross-Cutting Concerns

- [ ] T084 [P] Auditar WCAG 2.1 AA, foco Radix, feedback e touch targets em `specs/003-close-session/validation/accessibility.md`
- [ ] T085 [P] Auditar Mobile Chrome/Safari, dark mode e uma mão em `specs/003-close-session/validation/mobile.md`
- [ ] T086 Corrigir achados acessíveis/mobile em `src/components/session/CloseSessionButton.tsx`, `src/components/session/SessionClosedDialog.tsx`, `src/components/queue/QueueItem.tsx` e `src/components/session/SessionStatusToggle.tsx`
- [ ] T087 Auditar migrations, pg_proc, RETURNS TABLE, DROP, locks, ACL, grants e pg_policies em `specs/003-close-session/validation/database-security.md`
- [ ] T088 Auditar Realtime select de quatro colunas, ausência de host_id, offline, cleanup, SW e tokens em `specs/003-close-session/validation/runtime-security.md`
- [ ] T089 Executar p95 real representativo e validação manual Host + dois Participants em `specs/003-close-session/validation/realtime-p95/real-environment.json` e `specs/003-close-session/validation/final-manual.md`
- [ ] T090 Ensaiar em ambiente local de pre-producao a ordem aplicacao adaptada sem publicacao -> 015 -> tipos -> SQL/harness -> typecheck/Vitest/integracao -> 016 -> tipos finais -> RLS/Realtime/integracao/E2E -> lint/build; registrar resultado em `specs/003-close-session/validation/preproduction-cutover.md` sem publicar
- [ ] T091 Executar o gate final fail-fast com os comandos literais abaixo: iniciar/resetar Supabase local, verificar history, gerar tipos finais UTF-8 sem BOM, executar os oito testes SQL, harness, Vitest, integracao/E2E, lint, typecheck e build; somente apos tudo verde registrar autorizacao para a primeira publicacao em `specs/003-close-session/validation/final-gate.md` e atualizar `specs/003-close-session/quickstart.md`
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
