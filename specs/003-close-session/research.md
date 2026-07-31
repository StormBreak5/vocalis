# Research: Encerramento de Sessão

## R1. Baseline histórica imutável

**Decision**: migrations `001–014` are immutable. They already contain `closed` and `closed_at`, plus incompatible writers/grants/policies. Migration 015 is documented as an atomic security correction, never as the first historical introduction of closed.

**Rationale**: the strategy must work for both a fresh database applying the full history and an existing database receiving only new migrations.

**Alternatives rejected**: editing, deleting or squashing historical migrations; claiming the historical state was safe; inventing a closure timestamp for inconsistent legacy rows.

## R2. Two deployable stages

**Decision**: use only `20260729100000_015_session_closure_atomic.sql` and `20260729101000_016_session_closure_rls_realtime.sql`, each with explicit BEGIN/COMMIT.

015 executes `CREATE SCHEMA IF NOT EXISTS private`, fixes its owner/ACL, and corrects invariants, terminal trigger, all writers, direct write privileges and `close_session` in one commit. 016 performs only read helpers, policy/grant cutover, `get_host_session_details` and Session Realtime.

**Rationale**: no newly applied feature checkpoint leaves hardened status with legacy writers. If 015 fails, PostgreSQL rolls it all back. If 016 fails, the database retains a safe write boundary and only final read/Realtime remains unavailable.

## R3. Historical data preflight

**Decision**: before altering objects, 015 rejects any row where status/closed_at are incoherent. It then installs the canonical `sessions_status_check` and `sessions_closed_at_coherence_check`. It does not fabricate the first closure time. The operator must remediate data explicitly and retry.

**Rationale**: a guessed timestamp violates the approved meaning of `closed_at`; aborting is safe and atomic.

## R4. Return-type changes require exact DROP

**Decision**: the real baseline signatures are:

- `public.create_queue_entry(uuid, character varying, character varying) RETURNS public.queue`;
- `public.cancel_queue_entry(uuid) RETURNS public.queue`.

The final returns are an explicit TABLE and void. Migration 015 therefore executes:

```sql
DROP FUNCTION IF EXISTS public.create_queue_entry(uuid, character varying, character varying);
DROP FUNCTION IF EXISTS public.cancel_queue_entry(uuid);
```

before creating the new definitions and reapplying owner/ACL. `join_session(text,text)` already returns jsonb in the final historical migration, so its return type is unchanged.

**Alternatives rejected**: CREATE OR REPLACE across incompatible returns; approximate argument types; retaining whole-row returns.

## R5. Terminal trigger security

**Decision**: `private.enforce_session_state_transition() RETURNS trigger` is zero-argument, `LANGUAGE plpgsql VOLATILE SECURITY INVOKER PARALLEL UNSAFE SET search_path=''`, owner postgres, fully qualified binding, REVOKE ALL from PUBLIC/anon/authenticated and nenhum GRANT web.

The body compares only OLD/NEW. It rejects reopening, changes/removal of the first timestamp, entry into closed without timestamp and nonclosed status with timestamp.

**Rationale**: SECURITY DEFINER would add power without need; the trigger is invoked internally by controlled updates.

## R6. Writer security and locks

**Decision**: join/create/cancel/update-queue/update-session/close are SECURITY DEFINER only because direct DML is revoked. Each is owner postgres, PL/pgSQL VOLATILE PARALLEL UNSAFE, search path empty, schema-qualified, authenticated-only EXECUTE and internally authorized by `auth.uid()`.

All writers lock Session first. Queue identity may be read without lock only to derive immutable `session_id`; Session is then locked before Queue. Every writer revalidates closed after the Session lock.

**Rationale**: the common lock serializes closure with all mutations and prevents frontend state from being an authority.

## R7. RLS helpers and final policies

**Decision**: migration 016 creates exactly three SQL/STABLE SECURITY DEFINER helpers: `is_session_host(uuid)`, `is_session_member(uuid)` and caller-authorized `is_session_open(uuid)`. Owner is postgres, search path empty, references qualified, false on null/missing/unrelated, authenticated-only USAGE/EXECUTE.

Final SELECT policies are `sessions_select_owned_or_member`, `participants_select_authorized_open_or_host` and `queue_select_authorized_open_or_host`, plus the preserved `"Block direct inserts on queue"` and `"Block direct deletes on queue"` policies. There is no public/open Session SELECT: code lookup happens only inside authenticated `join_session` (Supabase Anonymous Auth receives role `authenticated`). Five incompatible legacy policies are dropped by exact name before CREATE POLICY.

**Rationale**: helpers break sessions↔participants recursion without granting broad table access. Member identity remains valid after closure only for the minimal Session row required by Realtime.

## R8. Host details belongs to the read cutover

**Decision**: `public.get_host_session_details(p_session_id uuid)` is created in 016, not 015. It returns exactly seven sanitized columns and authorizes ownership with `auth.uid()`.

**Rationale**: this RPC replaces broad Host SELECT and must become available atomically with column grants/RLS.

## R9. Test suite split by available objects

**Decision**: gate 015 runs invariants, writers, close, sequential idempotency, direct write ACL and deterministic races. Final read privilege assertions are not run until 016 exists.

`003_session_writers.sql` contains post-015 writer/ACL assertions. `003_session_privileges.sql` is stage-aware: after 015 it runs only DML/EXECUTE/terminal assertions already valid; after 016, detected by the existence of `get_host_session_details(uuid)`, it additionally checks table/column privileges, real SELECT negatives and final grants/revokes.

**Rationale**: no gate expects an object or grant created by a future migration.

## R10. Deterministic concurrency

**Decision**: paired races use three persistent PostgreSQL connections (`txA`, `txB`, `observer`), explicit transactions, JWT claims, observed `pg_blocking_pids`, bounded timeouts and cleanup in finally/afterAll. Both commit orders cover close × close/join/create/cancel/pause/resume/update-queue.

Idempotency uses one successful close followed by 19 sequential retries against one fixture. Only the first returns changed=true; every retry returns changed=false and the original timestamp.

**Alternatives rejected**: incidental sleep, REST Promise ordering, remote databases and large simultaneous actor pools.

## R11. Local-only database bootstrap

**Decision**: `scripts/test-db-race-local.ps1` obtains `supabase status -o env`, validates a loopback DB URL, assigns `SUPABASE_TEST_DB_URL` only to the immediately spawned Vitest child, waits, removes the variable and never prints credentials.

**Rationale**: process environment does not cross tasks reliably and copied credentials are unsafe.

## R12. PowerShell 5.1 type generation

**Decision**: capture CLI output in memory and call `[System.IO.File]::WriteAllText` with `New-Object System.Text.UTF8Encoding($false)`. Após 015, validar encoding/funções, adaptar todos os consumidores e seus testes, e somente então executar typecheck. Após 016, validar tipos finais antes de compilar queries ou testes dependentes dessa migration.

**Alternatives rejected**: shell redirection, manual edits, `any`, broad casts or an untyped Supabase client.

## R13. Realtime recovery

**Decision**: Session UPDATE with id filter plus RLS provides live notification. Initial load and event-driven resync on reconnect/token/online/visible/BFCache remain authoritative. No polling.

**Rationale**: Realtime events are transient; point reads guarantee recovery after missed delivery.

## R14. Measurable UX

**Decision**: p95 uses 20 observed deliveries from confirmed commit to modal, threshold 2 seconds, with browser/region/viewport/network recorded. Slow-network E2E uses controlled Slow 3G and validates loading, uncertainty and resync. Navigation to `/` is measured from the button click with a 5-second threshold.
## R15. Modal terminal and room-scoped cleanup

**Decision**: use one controlled shadcn/ui AlertDialog for Host and Participant, permanently open while status is closed, without close control and with Escape/outside interactions prevented. “Voltar para o início” removes only that room’s channel, IDs, snapshots and Session/Queue caches, then uses `router.replace('/')`.

Host Auth and Participant Supabase Anonymous Auth remain intact; no `signOut`, token cache or cross-room cleanup occurs. Browser Back, popstate, mobile navigation gesture, BFCache and URL revisit execute a fresh point read, so a closed room reopens the terminal modal.

**Rationale**: this preserves the clarified identity decision and prevents local navigation state from making a terminal Session appear active.
## R16. AlertDialog constitucional baseado em Radix

**Decision**: `components.json` usa o estilo shadcn `new-york`. A implementação futura de `src/components/ui/alert-dialog.tsx`, a confirmação do Host e `SessionClosedDialog` usam exclusivamente `@radix-ui/react-alert-dialog` por meio do padrão shadcn/ui já adotado pelo projeto.

**Rationale**: essa combinação atende diretamente à constituição, preserva foco, Escape/outside interception e semântica acessível, sem regenerar ou substituir componentes durante o planejamento. Não há desvio constitucional.

## R17. Entrega unica em pre-producao

**Decision**: a inspecao do repositorio nao encontrou configuracao de hospedagem, pipeline de deploy, tag/release ou evidencia concreta de trafego produtivo ativo desta versao. O vinculo local do Supabase nao prova publicacao da aplicacao. Portanto, a decisao operacional unica e pre-producao: nao existe aplicacao antiga atendendo escritas durante o cutover e esta feature nao introduz mecanismo de bloqueio operacional.

A aplicacao e seus consumidores sao construidos primeiro, sem publicacao. No ambiente controlado, aplica-se 015, geram-se tipos, executam-se a matriz SQL e o harness, depois typecheck/Vitest/integracao; somente com esse gate verde aplica-se 016, geram-se tipos finais e executam-se RLS/Realtime/integracao/E2E, lint e build. A primeira publicacao desta versao so e autorizada depois de todos os gates.

**Rationale**: 015 altera retornos RPC e revoga DML historico. A sequencia pre-producao elimina convivencia com consumidores antigos sem introduzir infraestrutura operacional fora do escopo.

## R18. Envelope e linha Realtime distintos

**Decision**: a assinatura de Session usa `event: "UPDATE"`, `schema: "public"`, `table: "sessions"`, `filter: "id=eq.<sessionId>"` e `select: ["id", "code", "status", "closed_at"]`.

`SessionRealtimeRow` contem exatamente `id`, `code`, `status` e `closed_at`. `SessionRealtimeEnvelope` representa o evento completo e contem `eventType`, `schema`, `table`, `commit_timestamp`, `new`, `old` e `errors`. O envelope valida os literais UPDATE/public/sessions e aceita seus campos validos; a validacao estrita de chaves aplica-se a `new`. `new` exige exatamente as quatro colunas e rejeita `host_id` ou qualquer outra; `old` pode ser parcial, restrito ao mesmo conjunto. As quatro colunas tem grant minimo.

**Rationale**: separar metadados do evento da linha projetada evita aplicar o schema estreito ao envelope inteiro. Projecao, filtro e RLS sao barreiras complementares. Todos os `.on()` sao registrados antes de `.subscribe()`, e point-read/resync continua sendo a fonte de recuperacao.

## R19. Cardinalidade explicita para `RETURNS TABLE`

**Decision**: `create_queue_entry`, `close_session`, `update_queue_status`, `update_session_status` e `get_host_session_details` retornam um conjunto SQL cuja cardinalidade lógica é exatamente uma. O Supabase entrega array; `src/application/shared/expect-single-rpc-row.ts` recebe `unknown`, exige array de comprimento um, valida a linha com schema runtime e devolve o DTO singular tipado.

Zero ou múltiplas linhas produzem `RPC_RESULT_CARDINALITY`; linha inválida produz `RPC_RESULT_INVALID`. `src/application/shared/__tests__/expect-single-rpc-row.test.ts` cobre zero, uma, múltiplas e inválida. `any`, cast array→objeto, `data.campo` pré-normalização e cliente sem `Database` são proibidos. `cancel_queue_entry` permanece void e `join_session` permanece jsonb.

**Rationale**: `RETURNS TABLE` é set-oriented mesmo quando a função emite uma linha. A normalização única evita suposições divergentes entre consumidores e preserva tipagem strict.

## R20. REVOKEs explicitos do cutover de escrita

**Decision**: a migration 015 executa literalmente:

```sql
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.participants FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.queue FROM PUBLIC, anon, authenticated;
```

Esses comandos bloqueiam DML direto e nao removem SELECT; o cutover minimo de leitura pertence a 016. Escritas autorizadas passam somente por RPCs SECURITY DEFINER com EXECUTE para `authenticated` e autorizacao interna por `auth.uid()`. `close_session`, `update_session_status` e `update_queue_status` sao exclusivas do Host proprietario; `join_session` e `create_queue_entry` atendem usuario autenticado, inclusive Supabase Anonymous Auth; `cancel_queue_entry` atende o Participant dono ou o Host segundo seu contrato. `anon` nao autenticado nao recebe EXECUTE.

**Rationale**: enumerar tabela, operacao e papel torna o corte auditavel e impede que expressao generica sobre DML esconda privilegio residual.