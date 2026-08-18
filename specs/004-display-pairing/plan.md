# Implementation Plan: Pareamento de Telão

**Branch**: `004-display-pairing` | **Spec**: `specs/004-display-pairing/spec.md`

## Resumo

A rota `/sala/[code]/display` hoje só autoriza o dono da sessão: `get_host_session_details` levanta `SESSION_NOT_FOUND_OR_FORBIDDEN` para qualquer `auth.uid()` diferente de `host_id`, e a página redireciona para a visão de participante. Esta feature introduz uma segunda identidade autorizada — **telão pareado** — sem tocar em senha, e-mail ou qualquer autenticação permanente: continua sendo Supabase Anonymous Auth, só que agora um segundo `auth.uid()` (a TV) pode ganhar acesso de leitura restrito a uma sessão específica por meio de um código de pareamento efêmero gerado pelo Host.

O pareamento é resolvido inteiramente no banco por duas novas tabelas e cinco novas RPCs `SECURITY DEFINER`, seguindo à risca o padrão já usado por `create_session`/`join_session`/`close_session`: identidade só por `auth.uid()`, autorização revalidada dentro da função, nunca no cliente. A superfície de leitura existente (`sessions`, `queue`) ganha um terceiro caminho de RLS para a nova identidade; a tabela `participants` **não é tocada** — é o ponto onde um erro de RLS vazaria a lista de participantes para uma TV pública, e por isso a policy de participants permanece byte-a-byte a mesma da migration 016.

`useSessionLifecycle`, `useActiveQueue` e `DisplayExperience` não mudam: eles já são agnósticos de identidade, só dependem de RLS liberar as linhas certas para o `sessionId` recebido. O trabalho novo concentra-se na página do telão (gate de autorização + tela de pareamento), no painel do DJ (gerar código, listar e revogar telões) e no banco (tabelas, RPCs, RLS).

## Contexto técnico

- Next.js App Router, React 19, TypeScript strict.
- Supabase PostgreSQL, Auth Anônimo, RLS, Realtime Postgres Changes.
- Nenhuma dependência nova. Reaproveita `expectSingleRpcRow`, o padrão de Server Actions `AppSuccess<T> | AppError`, os validadores de código de sala (`session-code.validator.ts`) e o Radix/shadcn já usados por `CloseSessionButton`/`SessionClosedDialog`.
- Estado confirmado como pré-produção (mesma constatação do plano 003): sem hospedagem, pipeline de deploy ou tráfego ativo desta versão. Não há necessidade de cutover em dois estágios como em 003 — é uma migration nova única, sem baseline legada para corrigir.

## Constitution Check

*Referência: `.specify/memory/constitution.md` — Vocalis Constitution v1.1.0*

- [x] **I. Clean Architecture**: regra de pareamento inteira no banco (RPCs); Server Actions só orquestram e mapeiam erro; hooks de cliente inalterados; nenhuma lógica de autorização em componente React.
- [x] **II. Mobile First & PWA**: tela de pareamento com input de 6 caracteres e teclado grande, touch targets ≥48px, dark mode, loading state + toast em toda chamada assíncrona, painel do DJ com o mesmo padrão dos botões existentes.
- [x] **III. Database-Enforced Integrity**: pareamento único-uso garantido por índice único parcial (mesmo padrão do índice anti-spam da `queue`); leitura restrita por RLS, não por checagem de cliente; Realtime usado para o painel do DJ refletir pareamento/revogação; nenhum polling.
- [x] **IV. Typed & DRY Code**: TypeScript strict, sem `any`; RPCs `RETURNS TABLE` passam por `expectSingleRpcRow`; zero duplicação de lógica de autorização — tudo em helpers `private.*` reaproveitados pelas policies.
- [x] **V. Performance by Default**: página do telão continua Server Component buscando o snapshot inicial; a tela de pareamento e o painel de telões pareados são os únicos Client Components novos, e só porque precisam de interatividade/Realtime.
- [x] **VI. Quality & Simplicity**: uma única migration nova (não há baseline legada a corrigir, ao contrário de 003); reaproveita hooks/componentes existentes do telão sem modificá-los.

Nenhum desvio constitucional. Complexity Tracking ao final documenta a única decisão não trivial (schema `private` para as tabelas efêmeras) e por que ela é a opção mais simples, não a mais complexa.

## Modelo de dados (resumo — detalhes em `data-model.md`)

Duas tabelas novas:

- `private.display_pairing_codes` — código efêmero de uso único (5 min, consumido no primeiro resgate). Nunca exposta via PostgREST: vive em `private`, schema não exposto por padrão e sem nenhum GRANT a papéis web. Só RPCs `SECURITY DEFINER` (owner `postgres`) tocam nela.
- `public.display_pairings` — vínculo durável `(session_id, auth_user_id)` = "este navegador é um telão autorizado desta sessão". Fica em `public` porque o Host precisa lê-la (contagem + lista para revogar) com RLS host-only e Realtime, no mesmo padrão de `participants`/`queue`.

Nenhuma coluna nova em `sessions`, `participants` ou `queue`.

## RPCs novas (contratos completos em `contracts/`)

| RPC | Autorização | Retorno |
|---|---|---|
| `generate_display_pairing_code(p_session_id uuid)` | Host proprietário, sessão não encerrada | `TABLE(code text, expires_at timestamptz)` |
| `redeem_display_pairing_code(p_room_code text, p_pairing_code text)` | Qualquer `auth.uid()` autenticado (anônimo) | `TABLE(session_id uuid, paired boolean)` |
| `get_display_session_details(p_session_id uuid)` | Host **ou** telão pareado não revogado | `TABLE(id uuid, code text, status text, closed_at timestamptz)` |
| `list_paired_displays(p_session_id uuid)` | Host proprietário | `TABLE(id uuid, paired_at timestamptz)` |
| `revoke_display_pairing(p_display_pairing_id uuid)` | Host proprietário da sessão dona do pareamento | `TABLE(id uuid, revoked boolean)` |

Todas: `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = ''`, owner `postgres`, `REVOKE ALL FROM PUBLIC, anon, authenticated` seguido de `GRANT EXECUTE TO authenticated` — idêntico ao padrão de `close_session`/`update_session_status`. `generate_display_pairing_code` e `redeem_display_pairing_code` retornam coleção de cardinalidade exatamente um e passam por `expectSingleRpcRow` no cliente, como toda `RETURNS TABLE` do projeto.

`redeem_display_pairing_code` recebe o **código da sala** (`p_room_code`), não `session_id` — resolve a sessão internamente, exatamente como `join_session(p_code, p_display_name)` já faz. Isso permite que a tela de pareamento funcione para uma TV que ainda não tem nenhuma linha visível via RLS: ela nunca precisa ler a tabela `sessions` diretamente para descobrir o id da sala antes de parear.

## RLS — o risco principal da feature

A leitura de `sessions` e `queue` precisa reconhecer a nova identidade sem que `participants` reconheça. Dois helpers novos em `private`, mesma forma dos três já existentes (`SQL STABLE SECURITY DEFINER SET search_path=''`, owner `postgres`, `false` em qualquer entrada nula/não relacionada):

```sql
private.is_paired_display(p_session_id uuid) RETURNS boolean
-- true se existe display_pairings não revogado para auth.uid() nesta sessão

private.is_paired_display_open(p_session_id uuid) RETURNS boolean
-- is_paired_display(p_session_id) AND status da sessão IN ('active','paused')
```

Mudanças de policy (DROP por nome exato + CREATE, mesmo padrão da migration 016):

- **`sessions`**: a policy `sessions_select_owned_or_member` passa a incluir `OR private.is_paired_display(id)`. Deliberadamente **sem** exigir sessão aberta — é o que permite a uma TV recarregada após o encerramento ver o mesmo estado `closed` que o Host já vê hoje, em vez de cair de volta na tela de pareamento (User Story 4, cenário 4). Colunas concedidas continuam as mesmas quatro (`id, code, status, closed_at`); nenhuma coluna nova é exposta.
- **`queue`**: a policy `queue_select_authorized_open_or_host` passa a incluir `OR private.is_paired_display_open(session_id)`. Aqui **sim** exige sessão aberta — fila de sessão encerrada não é lida por telão pareado.
- **`participants`**: **nenhuma mudança**. `is_paired_display` nunca entra nessa policy. Isso é verificado por teste pgTAP dedicado (FR-010 / SC-004) que resgata um pareamento válido e tenta `SELECT * FROM participants` esperando zero linhas.
- **`display_pairings`**: policy nova `display_pairings_select_host`, `USING (private.is_session_host(session_id))` — só o Host lê, nunca o próprio telão.

`is_session_open` (o helper existente, compartilhado por `participants` e `queue`) **não é alterado** — se eu tivesse estendido esse helper para incluir telões pareados, a policy de `participants` teria herdado o acesso junto, exatamente o vazamento que a spec chama de "principal risco de implementação". Por isso o pareamento ganha helpers próprios em vez de reaproveitar `is_session_open`.

## Anti-sondagem (FR-015)

Não há rate limit nem log de tentativas — ver `research.md` R13 pela decisão e pelo porquê (o espaço de códigos, 32⁶ ≈ 1,07 bilhão de combinações contra uma janela de 5 minutos, já torna força bruta inviável; a tentativa original de logar antes de rejeitar esbarrava numa tensão transacional real, comprovada por diagnóstico direto: `RAISE EXCEPTION` desfaz qualquer escrita feita antes dele na mesma chamada, mesmo com captura interna). A defesa que resta, e que sozinha já cobre FR-015 para o código de pareamento — o único dado desta feature que é de fato secreto, nunca exposto em nenhum outro lugar do produto —, é a resposta indistinguível: código de pareamento inexistente, expirado e já consumido levantam exatamente a mesma exceção `PAIRING_CODE_INVALID`. Sala inexistente cai na mesma exceção também, mas por um motivo diferente e não relacionado a sigilo: o produto já revela existência de sala de propósito no fluxo de entrada (`join_session`/`JoinForm`, `SESSION_NOT_FOUND` distinto — ver `research.md` R11); aqui o colapso existe porque nenhuma UI desta feature consome a distinção e porque mantém esta RPC com um único caminho de falha, igual ao resto do fluxo de resgate.

## Concorrência

`generate_display_pairing_code` segue o mesmo lock Session-first dos demais writers (`SELECT ... FOR UPDATE` em `sessions`) e retenta geração de código em colisão exatamente como `create_session` já faz (até 5 tentativas, `CODE_GENERATION_FAILED`), contra um índice único parcial em `private.display_pairing_codes(code) WHERE consumed_at IS NULL`.

`redeem_display_pairing_code` bloqueia a linha do código com `SELECT ... WHERE consumed_at IS NULL FOR UPDATE` antes de marcar `consumed_at`. Duas TVs resgatando o mesmo código simultaneamente serializam nesse lock; a segunda, ao reavaliar a mesma cláusula `WHERE` após o commit da primeira, encontra zero linhas e recebe a recusa genérica — implementa literalmente o Edge Case "apenas uma vence".

## Aplicação

- `src/domain/display-pairing.types.ts` — tipos de domínio (`DisplayPairingCode`, `PairedDisplaySummary`) e schemas Zod `z.strictObject` para as três RPCs `RETURNS TABLE`, no mesmo molde de `hostSessionDetailsRpcRowSchema`.
- `src/application/display-pairing/generate-display-pairing-code.action.ts`, `redeem-display-pairing-code.action.ts`, `revoke-display-pairing.action.ts` — Server Actions `'use server'` retornando `AppSuccess<T> | AppError`, mesmo formato de `create-session.action.ts`.
- `src/application/display-pairing/get-display-session-details.ts`, `list-paired-displays.ts` — queries server-side (não Server Actions) usadas pela página e pelo snapshot inicial do painel, no molde de `getHostSessionDetails`.
- `src/application/session/session-error.mapper.ts` e `src/domain/errors.types.ts` ganham dois códigos: `PAIRING_CODE_INVALID` e `PAIRING_NOT_FOUND_OR_FORBIDDEN` (para revogação de um pareamento que não pertence ao Host chamador), com mensagens amigáveis — reaproveita o mapper único já existente em vez de criar um segundo.

### Página do telão (`app/sala/[code]/display/page.tsx`)

Fluxo revisado, substituindo o gate host-only atual:

1. `getSessionStatusRowByCode(code)` (existente) resolve `code → session_id` via a policy de `sessions` — agora também succeeds para telão pareado, mas ainda falha tanto para visitante sem vínculo (participante de outra sessão, Host de outra sessão, anônimo) quanto para um código que não corresponde a nenhuma sessão real, indistinguivelmente (ver R14); ambos caem no passo 3.
2. Se resolveu, `getDisplaySessionDetails(sessionId)` (RPC nova) confirma Host **ou** telão pareado — um participante comum autenticado (que passa o passo 1 via `is_session_member`) é barrado aqui, igual hoje.
3. Se qualquer um dos dois passos falhar — **inclusive quando o código não corresponde a sessão nenhuma**: renderiza `<DisplayPairingScreen roomCode={code} />` **em vez de** `redirect(roomPath)` — essa é a mudança central do FR-008. A página não tenta (e, por R14, não deve tentar) diferenciar "código inexistente" de "sessão existe, visitante sem autorização"; só a falha de *formato* do código (`validateSessionCode`) continua redirecionando, por ser erro de input, não pergunta de autorização.
4. Se autorizado e `status === 'closed'`: `<DisplayClosedState />`, sem alteração.
5. Se autorizado e aberto: `SessionLifecycleProvider` + `DisplayExperience`, **sem nenhuma alteração** nesses dois componentes ou nos hooks que eles usam.

### Tela de pareamento (`src/components/display/DisplayPairingScreen.tsx`, novo)

Client Component: input de 6 caracteres (mesmo alfabeto/máscara de `session-code.validator.ts`), botão ≥48px, loading state, toast de erro com a mensagem genérica de `PAIRING_CODE_INVALID`. Ao submeter, a Server Action garante `signInAnonymously()` antes de chamar `redeem_display_pairing_code` — mesmo padrão de bootstrap de identidade que `createSessionAction` já usa. Sucesso: `router.refresh()` na mesma URL, deixando o Server Component reavaliar o gate acima e renderizar o telão.

### Painel do DJ (`src/components/dj/`)

- `DjDisplayPairingPanel.tsx` (novo): botão "Parear telão" → `generateDisplayPairingCodeAction` → exibe código + contagem regressiva local (`setInterval` puramente cosmético sobre um `expires_at` já buscado — não é polling de servidor, constitution III não se aplica).
- `useDisplayPairings(sessionId)` (novo hook, mesmo molde de `useSessionParticipants`/`useActiveQueue`): snapshot inicial via `listPairedDisplays` + assinatura Realtime em `display_pairings` filtrada por `session_id`. Alimenta a contagem (FR-016) e a lista com botão "Revogar" por item (FR-017), cujo clique chama `revokeDisplayPairingAction` — a UI não precisa de estado otimista porque o próprio evento Realtime de `UPDATE`/exclusão lógica atualiza a lista após o commit.

## Migration

Uma única migration nova, `supabase/migrations/20260817120000_018_display_pairing.sql`, transação única (`BEGIN`/`COMMIT`), sem baseline legada para corrigir — ao contrário de 003, não há cutover em dois estágios porque nenhum objeto pré-existente muda de contrato. Ordem interna:

1. `CREATE SCHEMA IF NOT EXISTS private` (idempotente — já existe desde 015/016) e confirmação do REVOKE de schema já vigente.
2. `private.display_pairing_codes`, `public.display_pairings` com suas constraints e índices (ver `data-model.md`).
3. `REVOKE ALL` explícito nas duas tabelas para `PUBLIC, anon, authenticated` (defesa em profundidade em `display_pairing_codes`, já fora do schema exposto; grant mínimo de `SELECT` em `display_pairings` só depois da policy).
4. Os dois helpers `private.is_paired_display` / `private.is_paired_display_open`, owner `postgres`, `REVOKE ALL` + `GRANT EXECUTE TO authenticated`.
5. `DROP POLICY` por nome exato de `sessions_select_owned_or_member` e `queue_select_authorized_open_or_host`; `CREATE POLICY` das duas versões estendidas com os nomes novos `sessions_select_owned_member_or_display` e `queue_select_authorized_open_host_or_display`.
6. `CREATE POLICY display_pairings_select_host`.
7. As cinco RPCs, cada uma com `ALTER FUNCTION ... OWNER TO postgres`, `REVOKE ALL`, `GRANT EXECUTE TO authenticated`.
8. `ALTER PUBLICATION supabase_realtime ADD TABLE public.display_pairings` dentro do mesmo `DO $$ IF NOT EXISTS $$` idempotente usado pela 016 para `sessions`.
9. `NOTIFY pgrst, 'reload schema'` e `COMMIT`.

Após aplicar: regenerar `src/infrastructure/supabase/database.types.ts` com o mesmo bloco PowerShell 5.1 UTF-8-sem-BOM já documentado no plano 003 (`WriteAllText` + inspeção de bytes contra BOM/UTF-16).

## Testes

Arquivos pgTAP novos, mesmo molde de `supabase/tests/003_*.sql`:

- `supabase/tests/004_display_pairing_codes.sql` — geração (host-only, sessão fechada rejeitada, colisão/retry), unicidade parcial, expiração, consumo único, resgate concorrente (duas transações `pg` disputando o mesmo código, só uma vence).
- `supabase/tests/004_display_pairing_rls.sql` — `sessions`/`queue` liberadas para telão pareado (aberto e, no caso de `sessions`, também fechado); **`participants` continua bloqueada** para telão pareado em todo estado — este é o teste que prova SC-004; isolamento entre sessões (código de outra sessão rejeitado); acesso revogado após `revoke_display_pairing` e após `close_session`.
- `supabase/tests/004_display_pairing_privileges.sql` — toda RPC de escrita existente (`create_queue_entry`, `cancel_queue_entry`, `update_queue_status`, `update_session_status`, `close_session`), mais as duas RPCs de escrita host-only desta feature (`generate_display_pairing_code`, `revoke_display_pairing`), chamadas com identidade de telão pareado, todas recusadas — prova SC-003.

Testes de aplicação: `src/components/display/__tests__/DisplayPairingScreen.test.tsx`, `src/components/dj/__tests__/DjDisplayPairingPanel.test.tsx`, `src/application/display-pairing/__tests__/*.test.ts` (mocks de `expectSingleRpcRow`, zero/uma/múltiplas linhas por RPC nova). E2E (`e2e/display-pairing.spec.ts`): Host gera código, segunda aba resgata, telão aparece; segunda TV pareada simultânea recebe update em tempo real; sessão pausada/encerrada reflete no telão pareado; revogação encerra o acesso da TV sem afetar a outra.

## Complexity Tracking

| Decisão | Por que é necessária | Alternativa mais simples rejeitada |
|---|---|---|
| Tabela efêmera `display_pairing_codes` no schema `private`, não `public` | Códigos de pareamento não têm nenhum consumidor client-side legítimo; mantê-la fora do schema exposto por PostgREST é defesa em profundidade sem custo — é estritamente mais simples que criar policies `RESTRICTIVE` de bloqueio total em `public`, como o projeto teve que fazer para `queue` inserts/deletes diretos. | Colocar a tabela em `public` com policy "deny all" — funciona, mas exige uma policy negativa extra só para replicar o que a ausência do schema já garante de graça. |
| Dois helpers RLS novos (`is_paired_display`, `is_paired_display_open`) em vez de estender `is_session_open` | `is_session_open` é compartilhado por `participants` e `queue`; estendê-lo vazaria a lista de participantes para telões pareados, violando FR-010/SC-004 diretamente. | Estender `is_session_open` — mais simples de escrever, mas quebra o requisito mais crítico da spec (User Story 3). Rejeitada sem ambiguidade. |
| Nenhum rate limit em `redeem_display_pairing_code` (removido do desenho original) | O espaço de códigos (32⁶ ≈ 1,07 bilhão) e a expiração de 5 minutos já tornam força bruta inviável; a versão anterior (`private.display_pairing_attempts`) tinha uma tensão transacional real e comprovada — `RAISE EXCEPTION` desfaz a escrita do log feita antes dele na mesma chamada — que a tornava inútil na prática. Ver `research.md` R13. | Transação autônoma via `dblink`/`pg_background` para o log sobreviver ao `RAISE` — resolveria a tensão, mas introduz infraestrutura nova para defender contra um risco que a matemática do espaço de códigos já torna desprezível. Rejeitada por desproporção entre custo e risco. |
