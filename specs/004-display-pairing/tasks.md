# Tasks: Pareamento de Telão

**Feature**: `004-display-pairing` | **Fonte**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Ordem obrigatória**: migration `018` → tipos regenerados → testes pgTAP → Server Actions → hooks → componentes → E2E. Nenhuma tarefa de aplicação (Server Action, hook ou componente) começa antes da migration aplicada e de `database.types.ts` regenerado — mesmo encadeamento usado pela feature `003-close-session`.

**Gates bloqueantes**: `004_display_pairing_privileges.sql` (prova SC-003 — toda RPC de escrita recusa identidade de telão pareado) e `004_display_pairing_rls.sql` (prova SC-004 — `participants` inacessível ao telão em todo estado) são tratados como gates, não como tarefas comuns. Nenhuma tarefa de UI os lista como dependência — elas dependem só das Server Actions/hooks que consomem. Mas nenhuma entrega desta feature (checkpoint de história, gate final) é considerada pronta enquanto os dois não estiverem verdes.

## Phase 1 — Setup

- [ ] T001 Verificar branch `004-display-pairing`, `.specify/feature.json` apontando `specs/004-display-pairing` e `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` retornando esse FEATURE_DIR
- [ ] T002 Preflight somente leitura da Supabase CLI já pinada pelo projeto (`--version`, `migration --help`, `migration up --help`, `migration list --help`, `test db --help`, `gen types --help`); abortar em versão divergente ou comando ausente
- [ ] T003 [P] Iniciar `supabase start`, validar Database/Auth/Realtime e status loopback (`localhost`/`127.0.0.1`) sem imprimir segredos

## Phase 2 — Foundational (bloqueante para todas as histórias)

**⚠️ CRITICAL**: nenhuma história começa antes desta fase — migration, tipos e os dois gates de segurança vivem aqui, porque as cinco RPCs e as três tabelas novas são criadas numa única transação e servem a todas as histórias.

### Testes pgTAP primeiro (escritos antes da migration existir — devem FALHAR até T008–T011)

- [ ] T004 [P] Escrever `supabase/tests/004_display_pairing_codes.sql`: geração host-only, sessão fechada rejeitada, colisão/retry, unicidade parcial, expiração, consumo único, resgate concorrente (duas transações `pg` disputando o mesmo código), `list_paired_displays` vazio/populado/host-only
- [ ] T005 [P] Escrever `supabase/tests/004_display_pairing_rls.sql` — **arquivo do gate SC-004**: `sessions`/`queue` liberadas para telão pareado (aberto e, no caso de `sessions`, também fechado); `participants` bloqueada para telão pareado em todo estado; isolamento entre sessões; acesso revogado após `revoke_display_pairing` e após `close_session`
- [ ] T006 [P] Escrever `supabase/tests/004_display_pairing_privileges.sql` — **arquivo do gate SC-003**: as cinco RPCs de escrita pré-existentes (`create_queue_entry`, `cancel_queue_entry`, `update_queue_status`, `update_session_status`, `close_session`) chamadas com identidade de telão pareado, todas recusadas, **e também `generate_display_pairing_code` e `revoke_display_pairing`** — as duas RPCs de escrita host-only desta própria feature — chamadas com a mesma identidade, ambas recusadas; um telão que conseguisse cunhar código de pareamento ou revogar outro telão seria a escalada de privilégio que a User Story 3 existe para impedir
- [ ] T007 [P] Escrever `supabase/tests/004_display_pairing_rate_limit.sql`: 10 tentativas registradas seguidas de recusa indistinguível sem gravação na 11ª, tanto com sessão resolvida (`session_id`+`auth_user_id`) quanto com código de sala inexistente (`auth_user_id` sozinho, `session_id` nulo)

### Migration única `018` (mesmo arquivo, partes sequenciais — não paralelizável)

- [ ] T008 Criar `supabase/migrations/20260817120000_018_display_pairing.sql` parte 1: `private.display_pairing_codes`, `private.display_pairing_attempts`, `public.display_pairings` com constraints/índices de `data-model.md`, e `REVOKE ALL` explícito das três tabelas para `PUBLIC, anon, authenticated`
- [ ] T009 Continuar o mesmo arquivo, parte 2: helpers `private.is_paired_display`/`private.is_paired_display_open`; `DROP POLICY`+`CREATE POLICY` de `sessions_select_owned_member_or_display` e `queue_select_authorized_open_host_or_display`; `CREATE POLICY display_pairings_select_host`; `GRANT SELECT (id, session_id, paired_at, revoked_at)` em `display_pairings`
- [ ] T010 Continuar o mesmo arquivo, parte 3: as cinco RPCs (`generate_display_pairing_code`, `redeem_display_pairing_code`, `get_display_session_details`, `list_paired_displays`, `revoke_display_pairing`) exatamente como em `contracts/`, cada uma com owner `postgres`, `REVOKE ALL` + `GRANT EXECUTE TO authenticated`
- [ ] T011 Concluir o mesmo arquivo, parte 4: `ALTER PUBLICATION supabase_realtime ADD TABLE public.display_pairings` no bloco idempotente `DO $$ IF NOT EXISTS $$`, `NOTIFY pgrst, 'reload schema'` e `COMMIT`

### Aplicar, verificar e regenerar tipos

- [ ] T012 Aplicar somente a `018` com `npx --no-install supabase migration up --local`
- [ ] T013 Verificar `20260817120000` em `npx --no-install supabase migration list --local`
- [ ] T014 Regenerar `src/infrastructure/supabase/database.types.ts` em UTF-8 sem BOM (`System.IO.File.WriteAllText`/`UTF8Encoding(false)`, inspeção de bytes contra BOM/UTF-16) e confirmar as cinco RPCs em `Database['public']['Functions']` antes de qualquer tarefa TypeScript

### Gates de segurança (bloqueantes) + demais suites SQL

- [ ] T015 **GATE — SC-003**: executar `npx --no-install supabase test db supabase/tests/004_display_pairing_privileges.sql --local`; falha aqui bloqueia a entrega da feature, não a escrita de código de aplicação
- [ ] T016 **GATE — SC-004**: executar `npx --no-install supabase test db supabase/tests/004_display_pairing_rls.sql --local`; falha aqui bloqueia a entrega da feature, não a escrita de código de aplicação
- [ ] T017 Executar `npx --no-install supabase test db supabase/tests/004_display_pairing_codes.sql --local`
- [ ] T018 Executar `npx --no-install supabase test db supabase/tests/004_display_pairing_rate_limit.sql --local`

### Domínio e erros compartilhados

- [ ] T019 [P] Escrever `src/domain/__tests__/display-pairing.types.test.ts` para os schemas Zod `z.strictObject` das três RPCs `RETURNS TABLE` de cardinalidade um e do array de `list_paired_displays`
- [ ] T020 Implementar `src/domain/display-pairing.types.ts` (tipos + schemas), executar T019
- [ ] T021 [P] Adicionar `PAIRING_CODE_INVALID` e `PAIRING_NOT_FOUND_OR_FORBIDDEN` a `ErrorCode`/`USER_MESSAGES` em `src/domain/errors.types.ts`
- [ ] T022 Estender `DOMAIN_CODES` em `src/application/session/session-error.mapper.ts` com os dois códigos novos e o teste correspondente em `src/application/__tests__/session-error.mapper.test.ts`

**Checkpoint**: migration aplicada, tipos regenerados, T015 (SC-003) e T016 (SC-004) verdes, T017/T018 verdes, domínio/erros prontos — só agora começam as histórias de usuário.

## Phase 3 — User Story 1: Host pareia a TV do bar (P1) 🎯 MVP

**Goal**: Host gera um código no painel do DJ; uma TV em outro navegador resgata o código e passa a exibir o telão da sessão, sobrevivendo a reload.

**Independent Test**: com uma sessão ativa, gerar o código no painel do DJ em um navegador e resgatá-lo em um navegador distinto, verificando que o segundo passa a exibir o telão e que o painel do DJ reflete a contagem.

### Server Actions / queries

- [ ] T023 [P] [US1] Escrever `src/application/display-pairing/__tests__/generate-display-pairing-code.action.test.ts`
- [ ] T024 [US1] Implementar `src/application/display-pairing/generate-display-pairing-code.action.ts`, executar T023
- [ ] T025 [P] [US1] Escrever `src/application/display-pairing/__tests__/redeem-display-pairing-code.action.test.ts` (bootstrap `signInAnonymously`, mapeamento de `PAIRING_CODE_INVALID`/`SESSION_CLOSED`)
- [ ] T026 [US1] Implementar `src/application/display-pairing/redeem-display-pairing-code.action.ts`, executar T025
- [ ] T027 [P] [US1] Escrever `src/application/display-pairing/__tests__/get-display-session-details.test.ts`
- [ ] T028 [US1] Implementar `src/application/display-pairing/get-display-session-details.ts`, executar T027
- [ ] T029 [P] [US1] Escrever `src/application/display-pairing/__tests__/list-paired-displays.test.ts`
- [ ] T030 [US1] Implementar `src/application/display-pairing/list-paired-displays.ts`, executar T029

### Hooks

- [ ] T031 [P] [US1] Escrever `src/hooks/__tests__/useDisplayPairings.test.ts` (snapshot inicial + evento Realtime de `INSERT`/`UPDATE` em `display_pairings`)
- [ ] T032 [US1] Implementar `src/hooks/useDisplayPairings.ts`, executar T031

### Componentes

- [ ] T033 [P] [US1] Escrever `src/components/display/__tests__/DisplayPairingScreen.test.tsx` (input 6 caracteres, 48px, loading, toast de erro genérico)
- [ ] T034 [US1] Implementar `src/components/display/DisplayPairingScreen.tsx`, executar T033
- [ ] T035 [P] [US1] Escrever `src/components/dj/__tests__/DjDisplayPairingPanel.test.tsx` (gerar código, contagem regressiva local, contagem de telões pareados)
- [ ] T036 [US1] Implementar `src/components/dj/DjDisplayPairingPanel.tsx` (sem botão de revogar ainda — isso é US5), executar T035
- [ ] T037 [US1] Reescrever o gate de `app/sala/[code]/display/page.tsx`: `getSessionStatusRowByCode` → `getDisplaySessionDetails` → `DisplayPairingScreen` quando não autorizado, preservando inalterados `DisplayClosedState`/`SessionLifecycleProvider`/`DisplayExperience`
- [ ] T038 [US1] Montar `DjDisplayPairingPanel` em `app/sala/[code]/dj/page.tsx` (ou `src/components/dj/DjDashboardExperience.tsx`), Server Component buscando o snapshot inicial via `listPairedDisplays`

### E2E

- [ ] T039 [US1] Escrever `e2e/display-pairing-host-tv.spec.ts`: Host gera código numa aba, segunda aba resgata em `/sala/<code>/display`, telão aparece; reload da segunda aba mantém o telão sem pedir código de novo; painel do DJ mostra contagem 1

**Checkpoint**: US1 funcional e testável de forma independente. Não é considerada pronta enquanto T015/T016 não estiverem verdes.

## Phase 4 — User Story 3: Telão pareado é estritamente somente leitura (P1)

**Goal**: nenhuma identidade de telão pareado consegue escrever em nenhuma tabela nem ler a lista de participantes, em nenhum estado da sessão.

**Independent Test**: autenticado como telão pareado, tentar cada RPC de escrita e a leitura de `participants` fora da interface — `supabase/tests/004_display_pairing_privileges.sql` (T006/T015) e `supabase/tests/004_display_pairing_rls.sql` (T005/T016) provam isso sozinhos, sem depender de nenhum código de aplicação novo.

- [ ] T040 [US3] Auditar `src/components/display/*` e `src/application/display-pairing/*` confirmando ausência de qualquer import de `create-queue-entry.action`, `cancel-queue-entry.action`, `update-queue-status.action`, `update-session-status.action` ou `close-session.action`; registrar em `specs/004-display-pairing/validation/us3-no-write-imports.md`

**Checkpoint**: US3 satisfeita quando T015 (SC-003), T016 (SC-004) e T040 estiverem verdes. Esta história não introduz nenhuma tarefa de UI nova — ela prova uma propriedade do desenho de RLS/RPC já entregue na Fase 2.

## Phase 5 — User Story 4: Telão acompanha o ciclo de vida da sessão (P1)

**Goal**: pausa, queda de conexão e encerramento aparecem no telão pareado exatamente como já aparecem no telão do Host hoje.

**Independent Test**: com uma TV pareada, pausar, derrubar a rede e encerrar a sessão, verificando que os estados aparecem como no telão do Host.

- [ ] T041 [US4] Escrever `e2e/display-pairing-lifecycle.spec.ts`: TV pareada reflete pausa em tempo real, recupera estado após queda/retorno de rede, exibe `DisplayClosedState` ao encerramento, e reload pós-encerramento não reabre o telão ao vivo nem pede novo pareamento

Nenhuma tarefa de implementação nova nesta fase — `useSessionLifecycle`, `useActiveQueue` e `DisplayExperience` já são agnósticos de identidade (ver `plan.md`) e foram validados por T037.

## Phase 6 — User Story 2: Bar com mais de uma TV (P2)

**Goal**: duas TVs pareadas na mesma sessão exibem o mesmo estado simultaneamente, e o Host vê a contagem de telões pareados.

**Independent Test**: parear dois navegadores distintos na mesma sessão e verificar que ambos exibem o telão e recebem atualizações simultâneas.

- [ ] T042 [US2] Escrever `e2e/display-pairing-multi-tv.spec.ts`: duas abas pareadas com dois códigos distintos na mesma sessão, painel do DJ mostra contagem 2 atualizando ao vivo, alteração na fila chega às duas TVs simultaneamente

Nenhuma tarefa de implementação nova — o modelo de dados já suporta N pareamentos por sessão (`UNIQUE (session_id, auth_user_id)`, sem limite de linhas) e a contagem já é live via T032.

## Phase 7 — User Story 5: Host revoga um telão (P3)

**Goal**: Host remove individualmente um telão pareado; a TV revogada perde acesso, a outra continua funcionando.

**Independent Test**: parear uma TV, revogá-la pelo painel do DJ e verificar que ela perde o acesso sem afetar outra TV pareada.

### Server Actions

- [ ] T043 [P] [US5] Escrever `src/application/display-pairing/__tests__/revoke-display-pairing.action.test.ts`
- [ ] T044 [US5] Implementar `src/application/display-pairing/revoke-display-pairing.action.ts`, executar T043

### Componentes

- [ ] T045 [US5] Estender `src/components/dj/__tests__/DjDisplayPairingPanel.test.tsx` para o botão "Revogar" por item, chamada da RPC e atualização da lista via evento Realtime simulado
- [ ] T046 [US5] Adicionar botão "Revogar" por telão pareado em `src/components/dj/DjDisplayPairingPanel.tsx`, chamando `revokeDisplayPairingAction`, executar T045

### E2E

- [ ] T047 [US5] Escrever `e2e/display-pairing-revoke.spec.ts`: parear duas TVs, revogar uma pelo painel do DJ, a TV revogada perde acesso na próxima leitura/reconexão, a outra continua funcionando

**Checkpoint**: todas as cinco histórias funcionalmente completas.

## Phase 8 — Polish & Cross-Cutting Concerns

- [ ] T048 [P] Auditar WCAG 2.1 AA, foco, contraste e touch targets ≥48px em `DisplayPairingScreen`/`DjDisplayPairingPanel` — `specs/004-display-pairing/validation/accessibility.md`
- [ ] T049 [P] Auditar ausência de polling/`setInterval` de servidor (o contador regressivo local do código de pareamento é cosmético, não busca dados) — `specs/004-display-pairing/validation/no-polling.md`
- [ ] T050 Executar `npm run lint`, `npm run typecheck` e `npm run build`
- [ ] T051 Executar `quickstart.md` passo a passo (validação manual equivalente a SC-001) e registrar em `specs/004-display-pairing/validation/quickstart-manual.md`
- [ ] T052 Atualizar `AGENTS.md`: seção 4, acrescentar as três tabelas novas (`display_pairing_codes`, `display_pairing_attempts`, `display_pairings`) ao resumo do banco; seção 5.2, acrescentar as cinco RPCs novas (`generate_display_pairing_code`, `redeem_display_pairing_code`, `get_display_session_details`, `list_paired_displays`, `revoke_display_pairing`) à lista de RPCs disponíveis e registrar explicitamente que o telão pareado é um caminho de autorização estritamente somente leitura, sem nenhuma RPC de escrita aceitando essa identidade — AGENTS.md é carregado como contexto em toda sessão de agente, e já foi corrigido uma vez nesta mesma feature por descrever um schema defasado
- [ ] T053 **GATE FINAL**: `supabase db reset --local` → reaplicar `018` → regenerar tipos → executar as quatro suites pgTAP (T015/T016 obrigatoriamente verdes) → `npx vitest run` → `npm run test:e2e` → lint → typecheck → build; registrar autorização em `specs/004-display-pairing/validation/final-gate.md`

## Dependências e caminho crítico

- Setup `T001–T003` → Foundational `T004–T022`.
- Dentro do Foundational: testes pgTAP `T004–T007` (podem ser escritos em paralelo, mas só passam depois da migration) → migration `T008–T011` (sequencial, mesmo arquivo) → aplicar `T012` → verificar `T013` → tipos `T014` → gates `T015`/`T016` → demais SQL `T017`/`T018` → domínio/erros `T019–T022`.
- **Nenhuma tarefa de US1/US3/US4/US2/US5 depende de T015 ou T016** — todas dependem só de T014 (tipos) e, quando aplicável, de T019–T022 (domínio/erros). T015/T016 são pré-requisito de *entrega* (checkpoint/gate final), não de *início* de nenhuma tarefa de aplicação.
- US1 `T023–T039`: Server Actions (`T023–T030`) → hook (`T031–T032`) → componentes (`T033–T038`) → E2E (`T039`), todas dependendo de T014/T020/T022.
- US3 `T040`: depende só de T033/T034 (componentes já existirem para auditar imports); seu checkpoint depende de T015/T016.
- US4 `T041`: depende de T037 (gate da página) e T036/T038 (painel), mas de nenhum código novo.
- US2 `T042`: depende de T039 (fluxo de pareamento) e T032 (contagem live).
- US5 `T043–T047`: depende de T036 (painel existir) e T030 (lista); Server Action (`T043–T044`) → componente (`T045–T046`) → E2E (`T047`).
- Polish `T048–T053` depende de todas as histórias; T052 (AGENTS.md) não depende de nenhuma outra tarefa de Polish e pode ser feita a qualquer momento a partir do Foundational, mas fica registrada aqui por ser pré-requisito de contexto para sessões de agente futuras, não pré-requisito técnico de código; T053 é o único ponto que exige T015/T016 formalmente verdes de novo (reconfirmação pós-reset).

### Ordem única desta feature

1. Testes pgTAP e migration, sem aplicação nenhuma ainda: `T004–T011`.
2. Aplicar `018`: `T012` → história `T013` → tipos `T014`.
3. Gates bloqueantes `T015`/`T016` (SC-003/SC-004) → demais SQL `T017`/`T018`.
4. Domínio/erros compartilhados: `T019–T022`.
5. Server Actions → hooks → componentes → E2E, história por história: `T023–T039` (US1) → `T040` (US3) → `T041` (US4) → `T042` (US2) → `T043–T047` (US5).
6. Polish e gate final: `T048–T053`.

### Paralelização

- `T004–T007` (arquivos SQL distintos) em paralelo entre si; nenhum roda antes de `T008–T011` existir.
- `T008–T011` NÃO são `[P]` — mesmo arquivo, ordem interna obrigatória.
- Dentro de cada história, os pares teste→implementação marcados `[P]` na tarefa de teste podem ser escritos em paralelo com os demais pares da mesma camada (todos os testes de Server Action de uma história em paralelo entre si, por exemplo); a tarefa de implementação nunca é `[P]` em relação ao seu próprio teste.
- Nenhuma tarefa de migration, aplicação, gate ou geração de tipos é `[P]`.

### Caminho crítico

`T001–T003 → T004–T022 → T023–T039 → T040 → T041 → T042 → T043–T047 → T048–T053`.

### Checkpoints

- Foundational (migration + tipos + gates SC-003/SC-004): `T022`.
- MVP/US1: `T039`.
- Read-only provado (US3): `T040`, condicionado a `T015`/`T016`.
- Ciclo de vida (US4): `T041`.
- Múltiplas TVs (US2): `T042`.
- Revogação (US5): `T047`.
- Feature concluída somente com `T053` verde.

**Total**: 53 tarefas. **MVP sugerido**: Setup + Foundational + User Story 1 (`T001–T039`).
