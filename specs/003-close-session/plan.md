# Implementation Plan: Encerramento de Sessão

**Branch**: `003-close-session` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Research**: [research.md](./research.md) | **Data Model**: [data-model.md](./data-model.md) | **Validation**: [quickstart.md](./quickstart.md)

**Input**: Feature specification from `/specs/003-close-session/spec.md`

## Summary

Implementar o encerramento definitivo como uma transição autoritativa no banco. A RPC `close_session(session_id)` bloqueará a sessão, validará `auth.uid()` contra `host_id`, mudará `active` ou `paused` para `closed`, gravará o primeiro `closed_at` e retornará o mesmo estado de forma idempotente nas repetições. Trigger e constraint tornam o encerramento irreversível por qualquer caminho.

Todas as escritas dependentes da sessão usarão a mesma ordem de locks. UPDATE direto de sessão e fila será substituído por operações controladas. RLS e grants permitirão ao Host e a participantes vinculados observar apenas o estado necessário para detectar `closed`, mantendo fila e participantes indisponíveis ao participante após o encerramento e preservando leitura autorizada do Host.

As duas rotas continuarão Server Components para a consulta inicial. Um controlador Client Component compartilhado cuidará da assinatura `sessions` no Supabase Realtime, ressincronização, offline, supressão de respostas atrasadas, limpeza e modal final não dispensável. Não haverá polling, sucesso otimista, exclusão nem alteração automática da fila.

## Technical Context

**Language/Version**: TypeScript 5.x strict; PostgreSQL/Supabase SQL

**Primary Dependencies**: Next.js 16.2.10, React 19.2.4, `@supabase/ssr` 0.12.3, `@supabase/supabase-js` 2.110.5, Supabase CLI `2.106.0` como devDependency exata, shadcn/ui `base-nova`, Base UI, Tailwind CSS 4, Sonner, Zod 4.4.3, Lucide React

**Storage**: Supabase PostgreSQL (`sessions`, `participants`, `queue`), RLS, funções/triggers e Realtime Postgres Changes

**Testing**: Vitest 4.1.10 + React Testing Library; Supabase local; `pg` e `@types/pg` como devDependencies para transações PostgreSQL persistentes; Playwright 1.61.1 em Mobile Chrome e Mobile Safari

**Target Platform**: PWA mobile-first em navegadores modernos; runtime Next.js + Supabase

**Project Type**: Aplicação web Next.js única com backend Supabase

**Performance Goals**: 95% dos clientes estáveis exibem o modal em até 2 s; retorno a `/` em até 5 s; a primeira `close_session` encerra e dezenove retries sequenciais retornam `changed=false`, todos preservando exatamente o primeiro `closed_at`; concorrência real permanece coberta apenas por corridas pareadas determinísticas

**Constraints**: Sem polling; offline somente leitura; sem sucesso antes do servidor; Realtime não é a única fonte; touch target 48×48 px; WCAG 2.1 AA; sem `any`; sem cache persistente de payloads de sessão/auth

**Scale/Scope**: Limites existentes de 50 participantes e 200 entradas por sessão; uma assinatura de sessão por rota/aba

## Constitution Check

*GATE: aprovado antes da pesquisa e revalidado após o design.*  
*Referência: `.specify/memory/constitution.md` — Vocalis Constitution v1.1.0.*

- [x] **I. Clean Architecture**: regras no banco/domínio/aplicação; hook/provider apenas orquestra; componentes visuais não autorizam nem decidem transições.
- [x] **II. Mobile First & PWA**: dark mode preservado, 48 px explícitos, feedback assíncrono, offline, foco e teclado planejados.
- [x] **III. Database-Enforced Integrity**: RPC, locks, trigger, constraint, grants e RLS; Realtime obrigatório; nenhum polling.
- [x] **IV. Typed & DRY Code**: controlador e tipos compartilhados; payload validado; tipos gerados após migrations; sem `any`.
- [x] **V. Performance by Default**: páginas seguem Server Components; cliente apenas para Realtime, modal, conectividade, loading e navegação.
- [x] **VI. Quality & Simplicity**: extensão das pastas e padrões atuais, sem biblioteca global de estado ou nova camada HTTP.

**Resultado pós-design**: todos os gates passam. Não há desvio constitucional.

## Baseline real e correções necessárias

- `sessions.status` já aceita `active|paused|closed`; `closed_at` já existe.
- Tipos de domínio já incluem `closed` e `closedAt`.
- `join_session` e `create_queue_entry` comparam com o status inexistente `ended`.
- `cancel_queue_entry` bloqueia Queue antes de Session e não valida a sessão.
- Alterações de status da fila e pause/resume usam UPDATE direto.
- `getSessionByCode` converte `closed` em `null`, impedindo o modal no carregamento inicial.
- RLS atual esconde `closed` de usuários legítimos, permite UPDATE direto do Host e não aplica a fronteira pós-encerramento à fila.
- `sessions` não está em `supabase_realtime`.
- Hooks atuais não cobrem completamente token renovado, suspensão, evento perdido e resync.
- `alert-dialog` ainda não existe em `src/components/ui`.
- `supabase/config.toml` desabilita anonymous sign-ins localmente, embora o fluxo atual dependa deles.

Somente lacunas necessárias ao encerramento serão corrigidas; legados não relacionados não serão redesenhados.

## Arquitetura

### Responsabilidades

| Camada | Responsabilidade |
|---|---|
| Domínio | DTOs de encerramento, união de status/lifecycle, erros e schema de payload |
| Aplicação | Server Actions, validação de entrada e tradução de erros amigáveis |
| Infraestrutura | consultas sanitizadas, cliente Supabase, tipos gerados e adaptação Realtime |
| Banco | máquina de estados, timestamp, autorização, locks, RLS, grants e publication |
| Orquestração cliente | provider/hook compartilhado, resync, offline, epoch e cleanup |
| UI | confirmação do Host, modal final, estados disabled/loading e navegação |

### Carregamento inicial

1. A rota Server Component normaliza o código e resolve o usuário atual.
2. A rota do participante consulta a projeção mínima e recupera o vínculo apenas se a sessão não estiver `closed`.
3. A rota do Host usa leitura que valida propriedade; não proprietário é redirecionado.
4. Se o snapshot autorizado já for `closed`, fila/participantes não são consultados e o provider abre o modal.
5. Se `active|paused`, o conteúdo existente é montado dentro de `SessionLifecycleProvider`.
6. A assinatura cliente é iniciada somente após o snapshot confirmado.

### Fluxo de encerramento

1. Host online e sincronizado abre `CloseSessionButton`.
2. AlertDialog destrutivo explica irreversibilidade, impacto, bloqueio e preservação.
3. Confirmar entra em `closing`, desabilita o botão e não muda status otimisticamente.
4. `closeSessionAction({sessionId})` valida UUID e chama `public.close_session`.
5. A RPC bloqueia a linha pertencente ao `auth.uid()`.
6. `active|paused` recebe `closed` e timestamp; `closed` retorna sem UPDATE.
7. O commit emite UPDATE somente na primeira chamada.
8. Resposta válida, evento válido ou resync confirmado podem levar ao terminal `closed`.
9. O modal final prevalece sobre todos os loadings e bloqueia escrita.
10. Resposta incerta leva a `uncertain`, mantém bloqueio e força resync antes de retry.

## Modelo, invariantes e trigger

Detalhes completos: [data-model.md](./data-model.md).

- Default de `status`: `active`.
- `closed_at`: NULL enquanto status não é `closed`.
- Constraint: `(status = 'closed') = (closed_at IS NOT NULL)`.
- Transições: `active ↔ paused`, `active → closed`, `paused → closed`.
- Nenhuma saída de `closed`.
- Primeiro `closed_at` imutável.
- Repetição de close não executa UPDATE.

O trigger `BEFORE UPDATE OF status, closed_at` é necessário porque CHECK não compara OLD/NEW e permissões/RPC não protegem todos os futuros caminhos privilegiados. Ele rejeita reabertura e mudança/remoção do timestamp, sem bloquear pause/resume.

### Contrato definitivo de `private.enforce_session_state_transition()`

| Item | Decisão aprovada |
|---|---|
| Schema, nome e assinatura | `private.enforce_session_state_transition() RETURNS trigger`; zero argumentos |
| Implementação | `LANGUAGE plpgsql`, `VOLATILE`, `PARALLEL UNSAFE` |
| Segurança | `SECURITY INVOKER` explícito |
| Owner | `postgres`, definido após a criação |
| Resolução de nomes | `SET search_path = ''`; qualquer objeto SQL é qualificado por schema |
| Binding | trigger `sessions_enforce_state_transition` em `public.sessions`, `BEFORE UPDATE OF status, closed_at FOR EACH ROW` |
| ACL | `REVOKE ALL ON FUNCTION private.enforce_session_state_transition() FROM PUBLIC, anon, authenticated`; nenhum GRANT direto a papel web ou `service_role` |
| Chamada por clientes | proibida e desnecessária; a função é executada somente pelo trigger criado pelo owner da migration |

`SECURITY INVOKER` é compatível e é a escolha de menor privilégio: o corpo inspeciona exclusivamente `OLD.status`, `OLD.closed_at`, `NEW.status` e `NEW.closed_at`, levanta erro de domínio e retorna `NEW`; ele não consulta nem modifica tabelas, não chama `auth.uid()`, não usa SQL dinâmico e não precisa contornar RLS. Em writers `SECURITY DEFINER`, o trigger participa da mesma transação da escrita controlada; em qualquer caminho privilegiado futuro, ele não adquire poderes além do invocador. `SECURITY DEFINER` foi rejeitado por elevar privilégio sem necessidade.

O comportamento por linha é:

1. Se `OLD.status = 'closed'`, exigir `NEW.status = 'closed'` e `NEW.closed_at IS NOT DISTINCT FROM OLD.closed_at`.
2. Ao entrar em `closed`, aceitar somente `OLD.status IN ('active','paused')` e exigir `NEW.closed_at IS NOT NULL`.
3. Para `NEW.status IN ('active','paused')`, exigir `NEW.closed_at IS NULL`.
4. Permitir `active ↔ paused`, devolver `NEW` em transições válidas e levantar erro de domínio estável nas inválidas.
5. Nunca preencher `closed_at`: somente `close_session`, após obter o lock, define o primeiro horário.

A migration atômica 015 cria `private` antes da função, define owner `postgres`, instala o trigger, os três helpers, todos os writers endurecidos e `close_session`, e aplica os revokes de escrita no mesmo commit. A função de trigger não precisa ser chamada por clientes web: eles usam as RPCs públicas controladas, e a atualização de `public.sessions` dispara o trigger internamente.

### Permissões de `private` por estágio

A migration atômica 015 já cria o estado permanente do schema: `authenticated` recebe somente USAGE em `private` e EXECUTE nos três helpers; continua sem CREATE; `PUBLIC` e `anon` não possuem CREATE/USAGE; nenhum papel web possui EXECUTE em `private.enforce_session_state_transition()`.

`supabase/tests/003_session_closure_invariants.sql` verifica os metadados permanentes da função/trigger e as transições. `supabase/tests/003_session_rls_helpers.sql` verifica, já no gate pós-015, o estado permanente do schema e as ACLs dos helpers. O arquivo histórico `supabase/tests/003_private_schema_post_015.sql` é preservado para rastreabilidade, mas **não é executado nem incluído no gate pós-015 ou em qualquer gate posterior**; ele descrevia um checkpoint transitório removido pelo cutover atômico.

Índices atuais são suficientes: PK `sessions(id)`, unique `sessions(code)`, `sessions_host_id_idx`, unique `(session_id,auth_user_id)` e índices da fila. Nenhum novo índice é obrigatório sem evidência de profiling.

## Migrations, type generation, and safe rollout

A fronteira de integridade é consolidada em uma única migration implantável e transacional. A baseline termina em `014`; os dois novos arquivos são sequenciais, nunca paralelizáveis e usam `BEGIN`/`COMMIT` explícitos.

Nenhum gate executa objeto de migration futura. Nenhum commit aplicado pode combinar `closed` com writer legado, DML direto incompatível ou RPC capaz de mutar a Session/fila depois do fechamento.

### Supabase CLI versionada e local-only

A inspeção de baseline encontrou `package.json` sem a dependência `supabase` e nenhuma CLI global/local disponível. A única estratégia aprovada é instalar a CLI como devDependency exata e bloqueada:

```powershell
npm install --save-dev --save-exact supabase@2.106.0
```

A implementação produz `"supabase": "2.106.0"` em `devDependencies` e lockfile correspondente. Todo comando usa `npx --no-install supabase`; o preflight exige saída exata `2.106.0`. Ausência ou divergência interrompe antes de Docker, migrations, reset, tipos ou testes. Não há CLI global, versão flutuante, download implícito ou fallback remoto.

Comandos canônicos:

```powershell
npx --no-install supabase start
npx --no-install supabase status -o env
npx --no-install supabase migration up --local
npx --no-install supabase migration list --local
npx --no-install supabase db reset --local
npx --no-install supabase test db --local
npx --no-install supabase gen types typescript --local --schema public
```

Migrations e testes são exclusivamente locais. `--linked`, `--db-url` remoto, projetos de produção/staging/preview e connection strings não loopback são proibidos. Ausência da stack local falha sem fallback.

### Matriz explícita por migration

| Estágio | Objetos criados ou alterados | Código autorizado | Testes permitidos | Testes ainda proibidos | Gate de tipos | Gate de segurança |
|---|---|---|---|---|---|---|
| Baseline `000–014` | Schema/writers e RLS/grants legados; Queue/Participants Realtime | Aplicação existente | Baseline e preflight somente leitura | Qualquer teste da feature | Tipos baseline | Inventário somente leitura; não criar Session closed neste checkpoint |
| `20260729100000_015_session_closure_atomic.sql` | Numa transação: preflight; `private`; helpers/ACL; status/`closed_at`; constraint/trigger; hardening de join/create/cancel, pause/resume e Queue status; Host-details RPC; `close_session`; locks Session-first; REVOKE de INSERT/UPDATE/DELETE e EXECUTE/GRANT exatos | Após tipos pós-015, adapters dos writers, Host-details e close podem compilar; UI de close permanece não liberada antes de 016 | Invariantes, helpers, contratos de todas as RPCs, close, idempotência, `closed_at`, privilégios DML e todas as corridas determinísticas | Policies finais, contração de SELECT e entrega Realtime de Session | Gerar tipos pós-015 com todas as RPCs, inclusive close; typecheck compatível | `003_session_privileges.sql` deve passar antes de criar/aplicar 016; nenhum writer legado ou DML direto permanece ao commit |
| `20260729101000_016_session_closure_rls_realtime.sql` | Numa transação: DROP das policies legadas; policies finais; REVOKE do SELECT amplo; grants mínimos de leitura; `public.sessions` na publication uma vez; schema reload | Após tipos finais, teste Realtime tipado, action, botão, lifecycle e modal podem ser liberados | Catálogo final, RLS/grants, Host/member/external × open/closed, publication, Realtime e suíte completa | Nada | Gerar tipos finais pós-016 e confirmar schema/RPCs antes do teste Realtime | Matriz final prova isolamento, grants/revokes, publication e ausência de acesso residual |

### Estratégia estritamente tipada durante o cutover

O caminho canônico é `src/infrastructure/supabase/database.types.ts`, usado por `createServerClient<Database>`. A geração sempre usa o Supabase local:

```powershell
npx --no-install supabase gen types typescript --local --schema public > src/infrastructure/supabase/database.types.ts
```

1. **Pós-015**: contém `get_host_session_details`, `update_queue_status`, `update_session_status`, `close_session`, os writers reescritos e seus retornos. Inspecionar `Database['public']['Functions']`, executar os contratos do estágio e atualizar adapters/rotas sem `any`, casts amplos ou cliente sem `Database`.
2. **Final pós-016**: confirma o mesmo conjunto de RPCs, `sessions.status`/`closed_at` e o schema final após RLS/grants/publication. Somente então o teste Realtime tipado e a UI de close são compilados/liberados.

É proibido editar o arquivo gerado manualmente, remover o generic, ignorar TypeScript ou chamar RPC ausente nos tipos do estágio.

### Ordem exata dos checkpoints

1. Criar 015 com transação explícita → aplicar com `migration up --local` → confirmar `20260729100000` em `migration list --local` → executar imediatamente os testes SQL de invariantes, helpers, contratos e **`supabase/tests/003_session_privileges.sql`**. Qualquer falha bloqueia a criação ou aplicação de 016.
2. Gerar os tipos pós-015 → confirmar todas as RPCs, inclusive `close_session` → atualizar apenas código compatível → executar typecheck, testes tipados dos writers e corridas determinísticas. Confirmar que join/create/cancel/update-queue/pause-resume rejeitam closed, que INSERT/UPDATE/DELETE direto e alterações de `closed_at` falham e que somente `close_session` fecha. Somente então criar 016.
3. Criar 016 com transação explícita → aplicar → confirmar `20260729101000` → executar os testes SQL de catálogo/RLS/grants/publication → gerar tipos finais → confirmar `close_session` → criar/compilar o teste Realtime tipado → typecheck → teste Realtime → matriz final e aplicação.

Se qualquer statement da 015 falhar, toda a migration é revertida. Se 016 falhar, somente seu cutover de leitura/Realtime é revertido e o banco permanece no estado seguro pós-015. Não existe maintenance mode ou write freeze: a feature ainda não foi publicada, e falha fechada dos clientes antigos é preferível a permitir escrita insegura.

`db reset --local` é reservado para banco limpo, recuperação controlada e gate final. Rollback é forward-only depois de commit: corrigir por nova migration; nunca reabrir, limpar `closed_at`, restaurar writer/grant amplo ou excluir dados.

Este plano é a fonte técnica vigente. Esta revisão não altera `tasks.md`.

### Cutover final de leitura

A migration 004 concedeu SELECT amplo. A migration final 016 executa, nesta ordem e na mesma transação:

```sql
REVOKE SELECT ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, code, status, closed_at)
ON TABLE public.sessions
TO anon, authenticated;
```

INSERT/UPDATE/DELETE incompatíveis e `sessions_update_own` já foram neutralizados atomicamente pela 015; a 016 remove a policy legada do catálogo e contrai apenas a leitura. O Host usa `get_host_session_details` tipado pós-015 e nunca recebe SELECT amplo. A migration 015 torna o banco seguro num commit; a 016 libera o acesso final e Realtime.
## RPCs e operações

### `close_session`

- Entrada: `p_session_id uuid` apenas.
- Identidade: `auth.uid()`.
- Lock: Session pertencente ao chamador.
- `active|paused → closed`; `closed` retorna original com `changed=false`.
- DTO: `{session_id,status:'closed',closed_at,changed}`.
- Erros: `AUTH_REQUIRED`, `SESSION_NOT_FOUND_OR_FORBIDDEN`, inesperado.
- Não toca Participant/Queue.
- `SECURITY DEFINER`, `search_path=''`, nomes qualificados, revoke PUBLIC/anon, grant authenticated.

### `get_host_session_details`

- Exact signature: `public.get_host_session_details(p_session_id uuid)`; no code overload.
- `LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL UNSAFE SET search_path = ''`.
- Owner `postgres`; all objects qualified; no dynamic SQL or lock.
- Identity only from `auth.uid()` and internal `id + host_id` ownership predicate.
- Null/missing/non-owned/participant/other Host use `SESSION_NOT_FOUND_OR_FORBIDDEN`; null JWT uses `AUTH_REQUIRED`.
- Exact DTO: `id,code,status,closed_at,created_at,max_participants,max_queue_entries`.
- Never returns `host_id`, auth data, tokens, Participant/Queue, whole Session row, or future columns.
- Revoke PUBLIC/anon/authenticated, then grant EXECUTE only to authenticated.

### Operações existentes

- `public.join_session(p_code text,p_display_name text) RETURNS jsonb`: Session-first; active permite recovery/entrada, paused retorna `SESSION_PAUSED`, closed retorna `SESSION_CLOSED` antes de qualquer Participant write. DTO JSON sanitizado da Participant. `SECURITY DEFINER` necessário porque INSERT/UPDATE diretos são revogados; owner `postgres`, `search_path=''`, qualification total, REVOKE ALL de PUBLIC/anon/authenticated e GRANT EXECUTE somente a authenticated.
- `public.create_queue_entry(p_session_id uuid,p_song_title varchar,p_artist varchar) RETURNS TABLE(...)`: Session-first; active permite pedido, paused retorna `SESSION_PAUSED`, closed retorna `SESSION_CLOSED`; preserva Microfone Justo e posição. DTO explícito de nove campos da Queue, nunca `RETURNS public.queue`. Mesmo padrão SECURITY DEFINER/owner/search path/ACL authenticated-only.
- `public.cancel_queue_entry(p_queue_id uuid) RETURNS void`: obtém session id imutável, bloqueia Session, rejeita closed, depois bloqueia Queue, autoriza e cancela em active ou paused. O contrato público é `AppSuccess<void>`/`{ok:true}`; RPC/action não expõem DTO de Queue. Mesmo padrão SECURITY DEFINER/owner/search path/ACL authenticated-only.
- `public.update_queue_status(p_queue_id uuid, p_new_status text)`: `VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path=''`, owner `postgres`. Deriva a Session pela Queue, valida `auth.uid()` como Host, bloqueia Session antes da Queue e rejeita `closed`. Permite `pending→preparing|cancelled`, `preparing→singing|cancelled` e `singing→completed|cancelled`; repetição do status atual retorna `changed=false` sem UPDATE/evento. DTO: `{id,status,updated_at,changed}`. Ausente, outra Session e não owner usam `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN`. Revoke PUBLIC/anon; grant authenticated.
- `public.update_session_status(p_session_id uuid, p_new_status text)`: `VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path=''`, owner `postgres`. Aceita apenas `active|paused`, deriva identidade de `auth.uid()`, bloqueia a Session owner e permite `active↔paused`; mesmo status retorna `changed=false` sem UPDATE/evento. `closed` como entrada é inválido e Session já closed retorna `SESSION_CLOSED`. DTO: `{id,status,changed}`. Revoke PUBLIC/anon; grant authenticated. Somente `close_session` pode definir `closed`.

Todas as operações mapeiam `SESSION_CLOSED` para **“Esta sala já foi encerrada.”**

## Concorrência e atomicidade

Global order is Session first, then Participant/Queue; multiple child rows use deterministic order. Queue-id operations read immutable `session_id` without a lock, lock Session, and re-read Queue `FOR UPDATE` for the same id/session. Queue→Session is forbidden.

| Race | Expected result |
|---|---|
| close × close | First transition returns changed=true; waiter returns changed=false with the same timestamp |
| lost response + retry | Retry sees closed and returns original success state |
| close × join/create | Lock winner commits first; waiter revalidates; no creation after closed commit |
| close × cancel/queue-status | Session→Queue prevents mutation after closed; earlier mutation remains preserved |
| close × pause/resume | Same Session lock; closed-first rejects; writer-first transition is followed by close |
| late client response | Lifecycle epoch changed; delayed success/toast/reset is ignored |

### Deterministic concurrency harness

`pg` and `@types/pg` are formally approved as development-only dependencies and will be installed with `npm install --save-dev pg @types/pg`. Supabase JS/PostgREST is not sufficient here: an RPC request owns and commits its own transaction, so it cannot return while preserving a row lock for a second controlled actor. The harness needs direct PostgreSQL connections whose transactions remain open across test steps.

The exact harness file is `src/infrastructure/__tests__/supabase/postgres-race-harness.ts`. It uses `pg.Client` to create three persistent connections per race case: `txA`, `txB`, and `observer`. The two actors execute RPCs inside explicit transactions; the observer reads `pg_blocking_pids` and verifies committed state. A registry closed from `afterAll` is a final safety net, while each case owns a `try/finally` that rolls back every open transaction, deletes its fresh fixtures, closes all three clients, and leaves no connection for the next test.

Only the local Supabase database is permitted. The approved entry point is `scripts/test-db-race-local.ps1`: in one PowerShell process it captures `npx --no-install supabase status -o env` in memory, extracts `DB_URL` with a strict parser, validates loopback/port/no TLS/no production, assigns `SUPABASE_TEST_DB_URL` only to the child Vitest environment, waits for Vitest, and removes the variable in `finally`. It never depends on an environment variable created by a prior task, never persists or prints credentials, and has no remote override. A missing local stack fails fast with a sanitized instruction to run `npx --no-install supabase start`.

Connection timeout is 5 seconds. Each actor sets transaction-local `lock_timeout='5s'`, `statement_timeout='15s'`, `idle_in_transaction_session_timeout='20s'`; Vitest cases use a 30-second timeout. The observer barrier has a bounded deadline and releases `txA` only after `pg_blocking_pids(pidB)` proves that `txB` is blocked by the intended backend. A short bounded catalog retry may observe that predicate, but delay duration never chooses the winner or establishes correctness.

For each order:

1. create a fresh Session/Participant/Queue fixture with unique UUIDs;
2. connect `txA`, `txB`, and `observer` to local PostgreSQL;
3. `BEGIN` both actors, `SET LOCAL ROLE authenticated`, set transaction-local JWT claims for `auth.uid()`, apply timeouts, and record backend PIDs;
4. execute the designated first RPC and keep its transaction open with the Session lock;
5. start the second RPC asynchronously;
6. require the observer barrier to prove `pidB` waits for `pidA`;
7. commit the first actor, await the second result, then commit success or roll back its domain error;
8. assert final rows after both outcomes through the observer;
9. execute rollback, fixture cleanup, client `end()`, and registry removal in `finally`.

Every race is run with a new fixture in both commit orders: close × close, join, `create_queue_entry`, `cancel_queue_entry`, `update_session_status` for pause and resume, and `update_queue_status`. Close-first must make the waiter revalidate and reject with `SESSION_CLOSED` without mutation. Writer-first preserves its committed change and close follows. Close × close yields one `changed=true`, one `changed=false`, and the same timestamp. The three-client observed barrier is used only for deterministic paired races. The 20-call idempotency gate performs one successful close followed by nineteen sequential authenticated retries against the same fixture; all retries return `changed=false` with the original `closed_at`. No additional actor pool is introduced.

Vitest runs these Node-environment files sequentially through the planned package script:

```json
"test:db:race": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-db-race-local.ps1"
```

The wrapper starts Vitest for `src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts` and `src/infrastructure/__tests__/session-writer-races.integration.test.ts` within that same process scope.

Both test files declare the Node Vitest environment and use the shared harness. Arbitrary `setTimeout`, REST-level `Promise.all`, shared fixtures, production credentials, and timing-only assertions are prohibited. Domain failures are not retried; only documented technical deadlock/serialization failures may be retried after cleanup with a new fixture.

## RLS and grants

Never use `USING(true)` or `WITH CHECK(true)`.

### Inventário e cutover completo de policies

A baseline real possui exatamente:

- `public.sessions`: `sessions_select_public`, `sessions_update_own`;
- `public.participants`: `participants_select_session`;
- `public.queue`: `"Users can read active queue of their session"`, `"Block direct inserts on queue"`, `"Host can update queue"`, `"Block direct deletes on queue"`.

Policies permissivas da mesma tabela/operação se combinam por OR; portanto uma policy nova mais restritiva não substitui nem neutraliza uma policy permissiva antiga. A migration final 016 executa explicitamente, antes de criar as policies novas:

```sql
DROP POLICY IF EXISTS sessions_select_public ON public.sessions;
DROP POLICY IF EXISTS sessions_update_own ON public.sessions;
DROP POLICY IF EXISTS participants_select_session ON public.participants;
DROP POLICY IF EXISTS "Users can read active queue of their session" ON public.queue;
DROP POLICY IF EXISTS "Host can update queue" ON public.queue;
```

As policies `"Block direct inserts on queue"` e `"Block direct deletes on queue"`, ambas com predicado `false`, são preservadas. O conjunto criado pela 016 é somente `sessions_select_open`, `sessions_select_owned_or_member`, `participants_select_authorized_open_or_host` e `queue_select_authorized_open_or_host`. Após o cutover, `pg_policies` deve conter exatamente essas seis policies finais nas três tabelas: quatro policies de leitura aprovadas e os dois bloqueios explícitos preservados da Queue; nenhuma policy permissiva residual, `USING (true)` ou `WITH CHECK (true)` é aceita.

Antes dos grants finais, a mesma transação remove privilégios incompatíveis:

```sql
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.participants FROM PUBLIC, anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.queue FROM PUBLIC, anon, authenticated;

GRANT SELECT (id, code, status, closed_at) ON TABLE public.sessions TO anon, authenticated;
GRANT SELECT ON TABLE public.participants TO authenticated;
GRANT SELECT ON TABLE public.queue TO authenticated;
```

RLS restringe linhas; esses grants restringem operações/colunas. Mutação permanece somente nas RPCs controladas.

### Private helper contract

The schema `private` is owned by `postgres`, is not present in Supabase exposed schemas, and grants no client CREATE. These exact functions are `LANGUAGE sql STABLE SECURITY DEFINER PARALLEL UNSAFE SET search_path = ''`, owner `postgres`, non-STRICT, non-LEAKPROOF, with only qualified references:

- `private.is_session_host(p_session_id uuid) RETURNS boolean`;
- `private.is_session_member(p_session_id uuid) RETURNS boolean`;
- `private.is_session_open(p_session_id uuid) RETURNS boolean`.

No additional private helper is required for this feature.

All return false for null JWT/argument, missing, or unrelated rows. Host/member derive identity only from `auth.uid()`. Open additionally requires caller ownership/membership and active/paused, preventing another-session probing. Definer mode bypasses the consulted table's RLS to break sessions↔participants recursion; `FORCE ROW LEVEL SECURITY` remains disabled. Revoke schema/function privileges from PUBLIC/anon; grant authenticated only the schema USAGE and three EXECUTEs.

Catalog tests inspect `pg_proc`, owner, volatility, parallel mode, leakproof flag, search path, signatures, return type, ACLs, exposed schemas, null/cross-session behavior, and a full no-recursion RLS matrix.

### Policies and ACLs

| Table/policy | Role/command | USING | WITH CHECK | Grants | Positive | Negative |
|---|---|---|---|---|---|---|
| `sessions_select_open` | anon, authenticated / SELECT | `status IN ('active','paused')` | N/A | four columns only | existing open lookup | no closed row from this policy |
| `sessions_select_owned_or_member` | authenticated / SELECT | `private.is_session_host(id) OR private.is_session_member(id)` | N/A | four columns only | owner/member minimal closed + Realtime | external/cross-session closed denied |
| sessions without UPDATE/DELETE | clients | N/A | N/A | revoke writes | controlled RPC succeeds | direct status/closed_at/reopen/delete fails |
| `participants_select_authorized_open_or_host` | authenticated / SELECT | `private.is_session_host(session_id) OR private.is_session_open(session_id)` | N/A | SELECT | Host preserved; member open | member closed/external denied |
| `queue_select_authorized_open_or_host` | authenticated / SELECT | same authorized predicate | N/A | SELECT | Host preserved; member open | member closed/external denied |
| queue without direct writes | clients | absent/false | absent/false | revoke writes | controlled RPCs | direct INSERT/UPDATE/DELETE fails |

The five incompatible legacy policies listed above are dropped, not supplemented. The two Queue deny policies are the only legacy policies preserved.

Before column grants, migration 016 executes:

```sql
REVOKE SELECT ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, code, status, closed_at)
ON TABLE public.sessions
TO anon, authenticated;
```

`information_schema.table_privileges` must show no Session table-level SELECT for client roles. `information_schema.column_privileges` must show exactly the four approved columns. Both Host and participant direct SELECT of `host_id`, `created_at`, limits, `SELECT *`, or future fields fails. Full Host details come only from `public.get_host_session_details(uuid)`.

RLS limits rows, ACLs limit fields. `sessions_select_owned_or_member` remains true on the NEW closed row because membership is independent of status, which authorizes the Realtime event. The `id=eq.<sessionId>` filter is only event reduction.

## Realtime

- Tabela `public.sessions`.
- Evento `UPDATE`.
- Filtro `id=eq.<sessionId>`.
- Colunas `id,status,closed_at`.
- Host: JWT normal Supabase Auth.
- Participante: JWT Supabase Anonymous Auth preservado e ligado por `participants.auth_user_id`.
- Policies: `sessions_select_open` plus `sessions_select_owned_or_member`.

### Controlador compartilhado

1. Recebe snapshot inicial confirmado.
2. Obtém JWT e configura Realtime auth.
3. Cria topic único por montagem.
4. Registra `.on()` antes de `.subscribe()`.
5. Valida id, enum e timestamp em runtime.
6. Closed válido avança epoch e torna estado terminal.
7. Payload inválido é ignorado e dispara resync único.
8. Cleanup invalida callbacks e remove o canal exato.

Strict Mode exige setup/cleanup simétricos, dependências estáveis, topic único e generation flag. Nunca reutilizar canal inscrito ou adicionar listener depois.

`TOKEN_REFRESHED` atualiza auth e ressincroniza. `CHANNEL_ERROR`, `TIMED_OUT` e `CLOSED` tornam o status não confirmado. Todo novo `SUBSCRIBED` exige consulta antes de liberar escrita. Troca de sala remove o canal anterior.

## Fonte de verdade, evento perdido e offline

Consulta pontual é autoritativa em: carga inicial, URL direta, refresh, resume/`pageshow`, `visibilitychange` visible, `online`, reconnect, token refresh, payload inválido e resposta incerta.

Enquanto offline/resyncing/uncertain:

- snapshot em memória pode ser mostrado somente leitura;
- todas as mutações ficam bloqueadas;
- snapshot do SW não declara sala ativa;
- close não é enfileirado nem otimista;
- não há `setInterval` ou polling.

Ao reconectar: closed abre modal; active/paused confirmado permite retry. `SUBSCRIBED` sozinho não prova ausência de evento perdido.

## Arquitetura cliente

### Tipos planejados

- `SessionStatus` existente preservado;
- `ClosedSession`;
- `CloseSessionInput`;
- `CloseSessionResult`;
- `SessionStatusSnapshot`;
- `SessionStatusRealtimePayload`;
- união discriminada `SessionLifecycleState`;
- erros sanitizados de encerramento/acesso.

Estados: `checking`, `synced(active|paused)`, `closing`, `resyncing`, `offline`, `uncertain`, `closed`. `writesAllowed` só é true quando online, sincronizado, não closing e não closed.

Cada mutação captura a epoch. Closed ou troca de sala avança a epoch; resposta posterior não mostra sucesso, não reseta formulário nem reativa ações.

### Componentes

- `SessionLifecycleProvider` envolve o conteúdo interativo das duas páginas.
- `useSessionLifecycle` concentra Realtime, resync, offline, epoch e saída.
- `CloseSessionButton` aparece apenas no DJ.
- `SessionClosedDialog` é compartilhado.
- RequestSongForm, QueueItem, SessionStatusToggle e controles Host consomem `writesAllowed`.
- Autorização/transição não ficam em componentes.

### Host UI

Botão “Encerrar sala” em área destrutiva separada abaixo de pause/resume:

- variant destructive e `min-h-[48px]`;
- disabled offline, não sincronizado, closing ou closed;
- cliques duplicados bloqueados;
- spinner durante envio;
- AlertDialog com Cancel + Confirm;
- sem digitar código;
- erro amigável; resposta incerta permanece bloqueada.

Confirmação informa ação definitiva, interrupção da experiência ativa, bloqueio de entradas/pedidos e preservação dos dados.

### Modal final

`SessionClosedDialog`:

- título “Sala encerrada”;
- mensagem “O DJ encerrou esta sessão de karaokê.”;
- única ação “Voltar para o início”;
- Host e participante;
- sem X/Cancel/autoredirect;
- open controlado; Escape/outside impedidos;
- foco inicial no único botão e focus trap;
- botão ≥48 px;
- prevalece sobre outros loadings.

A fila já em memória pode permanecer atrás do overlay inerte. Em refresh fechado, fila/participantes não são consultados.

### Navegação do navegador

O modal não cria armadilha de histórico: não intercepta `pushState`, não força `beforeunload` e não exibe confirmação nativa. Escape, clique externo e gestos que apenas interagem com o overlay não o dispensam. Se Voltar, `popstate` ou o gesto de navegação mobile realmente deixar a rota, o unmount executa o cleanup dos canais e epochs; se a navegação mantiver a mesma rota, o modal continua aberto. O botão oficial limpa somente o estado da sala e usa `router.replace('/')`.

Avançar, deep link ou novo acesso à URL encerrada executa a consulta inicial e reabre o modal porque o banco continua sendo a fonte de verdade. No retorno por BFCache (`pageshow` com `event.persisted`), um snapshot não terminal passa a não confirmado, bloqueia escritas e dispara resync; um estado `closed` já confirmado continua terminal.

### Limpeza

Host: remover canais de sessão/fila/participantes; limpar estado/snapshots da sala; preservar autenticação normal e outras sessões.

Participante: remover canais; limpar IDs e snapshot da sala; preservar sessão anônima; não tocar outra aba/sala, cookies Supabase ou preferências.

Ambos usam `router.replace('/')`. Nenhum token entra no cache.

## PWA e Service Worker

- Reutilizar `useOnlineStatus`/OfflineBanner no lifecycle.
- Nenhuma Background Sync/fila offline.
- Atualizar `public/sw.js` para excluir explicitamente `/sala/*`, RSC, navegações autenticadas, Server Actions, Supabase e respostas privadas/auth-bearing do cache persistente.
- Cachear somente shell/assets estáticos.
- Nunca cachear JWT, cookie, auth, RPC, status, Participant ou Queue.
- Snapshot da fila continua apenas em memória da aba.

## Estado da fila após closed

Nenhum registro é excluído e nenhum status (`pending`, `preparing`, `singing`, `completed`, `cancelled`) muda. Participante não refaz SELECT de fila/participantes após closed. Host mantém leitura autorizada para preservação futura, sem nova UI de histórico. Estado local só é removido ao sair.

## Project Structure

### Documentation

```text
specs/003-close-session/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── contracts/
    ├── close-session.md
    ├── get-session-status.md
    ├── get-host-session-details.md
    ├── join-session.md
    ├── create-queue-entry.md
    ├── cancel-queue-entry.md
    ├── update-queue-status.md
    └── update-session-status.md
```

### Source Code (planejado)

```text
app/sala/[code]/
├── page.tsx
└── dj/page.tsx

src/
├── domain/
│   ├── session.types.ts
│   └── errors.types.ts
├── application/
│   ├── session/
│   │   ├── close-session.action.ts
│   │   ├── get-session-status.action.ts
│   │   └── update-session-status.action.ts
│   ├── participant/join-session.action.ts
│   └── queue/
│       ├── create-queue-entry.action.ts
│       ├── cancel-queue-entry.action.ts
│       └── update-queue-status.action.ts
├── infrastructure/supabase/
│   ├── database.types.ts
│   └── queries/session.queries.ts
├── hooks/useSessionLifecycle.ts
└── components/
    ├── ui/alert-dialog.tsx
    ├── session/
    │   ├── SessionLifecycleProvider.tsx
    │   ├── CloseSessionButton.tsx
    │   ├── SessionClosedDialog.tsx
    │   └── SessionStatusToggle.tsx
    └── queue/
        ├── RequestSongForm.tsx
        ├── QueueList.tsx
        └── QueueItem.tsx

supabase/
├── config.toml
└── migrations/
    ├── ..._015_session_closure_atomic.sql
    └── ..._016_session_closure_rls_realtime.sql

src/infrastructure/__tests__/supabase/postgres-race-harness.ts
src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts
src/infrastructure/__tests__/session-writer-races.integration.test.ts
e2e/close-session-host.spec.ts
e2e/close-session-realtime.spec.ts
e2e/close-session-recovery.spec.ts
e2e/close-session-reconnect.spec.ts
e2e/close-session-write-blocking.spec.ts
e2e/close-session-leave.spec.ts
```

**Structure Decision**: estender a estrutura existente. Sem nova biblioteca de estado, route handlers ou backend separado.

## Contratos

`contracts/` define close, leitura/resync mínima, leitura completa do Host e alterações lock-safe em join/create/cancel/queue-status/pause-resume. Resync reutiliza `get-session-status`; não existe operação duplicada.

## Tipos e erros

- Tipos pós-015 já contêm todos os writers e `close_session`; tipos finais são regenerados após 016 e antes do teste TypeScript Realtime e da liberação da UI.
- Payload Realtime validado, nunca cast cego.
- `unknown` estreitado; nenhum `any`.
- `SESSION_CLOSED` centralizado como “Esta sala já foi encerrada.”
- Erro comum de close não distingue inexistente de não proprietário.
- Legados `join_session_result`/`recover_participant` são risco preexistente; limpeza só entra se impedir geração correta, sem ampliar a feature.

## Test Plan

### Banco/integração

Os testes obedecem à matriz de duas migrations: imediatamente após 015 rodam invariantes, helpers, contratos de todos os writers, close/autorização/idempotência/closed_at, privilégios DML e corridas; `003_session_privileges.sql` deve passar antes de 016. Após 016 rodam RLS/grants/publication/Realtime e a suíte completa. O runner nunca seleciona objeto futuro.
- Owner fecha active e paused.
- Participante, outro Host, sem auth e anônimo sem propriedade falham.
- Inexistente e não owner retornam erro indistinguível.
- Repetição retorna sucesso/original; timestamp preenchido e preservado.
- Trigger bloqueia reabertura, limpeza/mudança do timestamp e pares inválidos.
- UPDATE/DELETE direto bloqueado.
- join/create/cancel/update-queue/pause-resume bloqueados após closed.
- Paused preserva comportamento não terminal existente.
- O harness transacional determinístico cobre, nas duas ordens de commit, close×close, close×join, close×create, close×cancel e close×pause/resume; o observador prova o bloqueio antes da liberação e asserções ocorrem após commit.
- Um primeiro close seguido de dezenove retries sequenciais converge para um `changed=true`, dezenove `changed=false` e um único `closed_at`; concorrência real permanece coberta pelas corridas pareadas de três conexões.
- Participantes, fila e todos os status são preservados.
- `get_host_session_details(uuid)` cobre owner active/paused/closed e nega null JWT, participante, outro Host, externo e sessão inexistente com DTO exato e sem overload por código.
- `update_queue_status(uuid,text)` cobre DTO `id,status,updated_at,changed`, transições permitidas, mesmo status idempotente, target inválido, owner/non-owner, missing/cross-session, closed, ACL e ambas as ordens contra close.
- `update_session_status(uuid,text)` cobre DTO `id,status,changed`, active↔paused, mesmo status idempotente, target closed/inválido, owner/non-owner, missing, Session closed, ACL e ambas as ordens contra close.
- `npm run test:db:race` chama `scripts/test-db-race-local.ps1`, que obtém, valida e consome a URL no mesmo processo, injeta-a somente no Vitest filho e a remove em `finally`; o harness usa três `pg.Client`, barreira observada e cleanup obrigatório.
- `pg_proc` comprova que `private.enforce_session_state_transition()` tem zero argumentos, retorno `trigger`, owner `postgres`, `prosecdef=false`, `provolatile='v'`, `proparallel='u'`, linguagem `plpgsql` e `search_path=''`; `pg_trigger` comprova o binding `BEFORE ROW UPDATE OF status, closed_at`. As mesmas inspeções cobrem helpers, Host RPC e RPCs join/create/cancel com seus metadados próprios.
- A ACL permanente nasce na 015: `003_session_rls_helpers.sql` prova USAGE apenas para `authenticated`, sem CREATE e EXECUTE somente nos três helpers; a função de trigger nunca recebe EXECUTE web. `003_private_schema_post_015.sql` é preservado, mas não é executado ou incluído em nenhum gate.
- `information_schema.table_privileges` não contém SELECT de tabela para papéis web; `column_privileges` contém somente `id,code,status,closed_at`; `SELECT *`, `host_id`, `created_at` e limites falham inclusive para Host.
- `pg_policies` comprova ausência das cinco policies incompatíveis, presença exata das seis policies finais, nenhuma permissiva residual e nenhum `USING(true)`/`WITH CHECK(true)`; a matriz Host/membro/externo × open/closed, com auth nula e UUID cruzado, comprova ausência de recursão e isolamento.
- Publication contém sessions uma única vez. O teste TypeScript de entrega é criado/compilado somente depois de aplicar 016, regenerar os tipos finais e confirmar `close_session` em `Database['public']['Functions']`; usa o cliente genérico `Database`, sem `any` ou cast amplo.

Usar os padrões Vitest + Supabase local existentes com clientes JWT separados. As corridas usam conexões PostgreSQL dedicadas, transações, locks e barreira observada; PostgREST não é usado para ordenar commits. Service role somente para fixture, observação e limpeza.

### Hook Realtime

- JWT antes do canal; `.on()` antes de `.subscribe()`.
- Tabela/evento/filtro/select exatos.
- Payload válido/invalidado, modal uma vez.
- Cleanup, Strict Mode, troca de sala e canal único.
- TOKEN_REFRESHED, CHANNEL_ERROR, TIMED_OUT, CLOSED, reconnect, online, visible/pageshow.
- Evento perdido seguido de resync.
- Epoch suprime sucesso atrasado.
- Nenhum timer de polling.

### Componentes

- Botão apenas Host, destructive, 48 px, confirmação, loading, offline, duplicidade, erro/incerteza.
- Modal sem X/Cancel, Escape/outside bloqueados, foco, 48 px, replace `/`, precedência sobre loading, Back/popstate/gesto mobile sem armadilha de histórico e BFCache com resync.
- Form/fila/toggle respeitam `writesAllowed` e ignoram resposta tardia.

### E2E

Contextos separados: Host cria; dois participantes entram; Host encerra; todos recebem sem F5; modal não fecha; retorno `/`; novo join/pedido/cancel/update falham; outro Host não fecha; refresh, URL direta e navegação Avançar para a rota encerrada mostram o modal; Back/popstate/gesto mobile deixam a rota sem reabrir a sessão; retorno BFCache e offline ressincronizam; evento perdido ressincroniza; retry preserva timestamp; dados permanecem.

Cada teste cria sua própria sessão. Não depender do seed `AABB22`; isolar testes multi-contexto da configuração `fullyParallel` quando a sequência for intrínseca.

### Quality gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `npm run build`
Autorização, transições, bloqueios, RLS/grants, wiring Realtime, modal, cleanup e preservação são automatizados. Métrica p95 ≤2 s e navegação ≤5 s dependem também de ambiente real/staging com navegador, perfil de rede, região e amostra registrados.

## Riscos

| Risco | Mitigação/gate |
|---|---|
| Closed legado sem timestamp autoritativo | Preflight aborta; migration corretiva explícita; sem timestamp fabricado |
| Column grants + Realtime divergem no ambiente | Teste local/staging com versão instalada; nunca liberar SELECT amplo |
| Recursão RLS/policy antiga permissiva | Helpers SECURITY DEFINER owner postgres, search_path vazio, schema não exposto, FORCE RLS desabilitado e matriz sem recursão |
| Grant amplo sobrevive ao cutover | REVOKE explícito antes dos grants por coluna; inspeção de table/column privileges e SELECTs negativos |
| UPDATE direto permanece | Revoke/drop no cutover e RPCs substitutas |
| Cutover parcial permite escrita após closed | 015 reúne invariantes, todos os writers, revokes de DML e close em uma transação; `003_session_privileges.sql` bloqueia 016 |
| Tipos não correspondem ao estágio do banco | Gerar do banco local após 015 e 016; inspecionar Functions, typecheck e build antes de avançar |
| Teste invoca objeto de migration futura | Close SQL/corridas e privilégios somente após 015; teste Realtime somente após 016 + tipos finais |
| Token/reconnect perde evento | Resync event-driven e writes bloqueados quando não confirmado |
| Resposta tardia altera UI | Epoch e guarda terminal |
| SW guarda sala/RSC | Exclusões explícitas e inspeção de caches |
| Anonymous auth local desabilitado | Alinhar config antes da validação |
| E2E compartilhado/flaky | Sessão por teste e contextos isolados |
| Harness conecta ambiente remoto ou perde a variável | Wrapper único obtém/valida/consome a URL no mesmo processo, injeta somente no Vitest filho e limpa em `finally`; harness também fecha três clients |
| Banco local indisponível | `test:db:race` falha imediatamente com instrução sanitizada para iniciar Supabase; nenhum skip silencioso |
| AlertDialog Action fecha cedo | Open controlado, botão comum e testes |
| Postgres Changes escala por assinante | Limite atual 50, RLS indexada e benchmark; Broadcast fora do escopo |

## Final Validation

- [x] C01: 015 é uma única transação implantável contendo schema `private`, invariantes, helpers, todos os writers, revokes de DML e `close_session`; nenhum commit intermediário aceita escrita depois de `closed`.
- [x] H01: `supabase/tests/003_session_privileges.sql` roda no gate pós-015 e bloqueia a criação/aplicação de 016 em qualquer falha.
- [x] M01: `scripts/test-db-race-local.ps1` obtém, valida e consome a URL local no mesmo processo que inicia Vitest; não depende de tarefa anterior, não persiste nem imprime credenciais.
- [x] L01: `003_private_schema_post_015.sql` é preservado, mas não é executado ou incluído em nenhum gate.
- [x] L02: removida a nota obsoleta sobre sincronização do backlog; esta revisão não altera `tasks.md`.
- [x] A migration 016 contém somente o cutover final de policies, grants de leitura, publication Realtime e schema reload.
- [x] Writers usam Session-first locking, rejeitam `closed` e possuem contratos definitivos; somente `close_session` define `closed`.
- [x] Primeiro `closed_at` é imutável; retry é idempotente e não emite segundo UPDATE.
- [x] Helpers/trigger/RPCs possuem owner, security mode, `search_path=''`, qualification, revokes/grants e testes definidos.
- [x] Tipos são gerados pós-015 e novamente pós-016; teste Realtime tipado só compila após a geração final.
- [x] Realtime usa JWT + RLS, filtro complementar, resync e nenhum polling.
- [x] Modal, offline, cleanup, preservação de auth/dados e escopo permanecem inalterados.
- [x] Nenhum NEEDS CLARIFICATION foi introduzido.
- [x] Nenhum código de implementação foi produzido.
- [x] `tasks.md` não foi alterado nesta revisão.
## Complexity Tracking

Nenhuma violação ou desvio da constituição.
