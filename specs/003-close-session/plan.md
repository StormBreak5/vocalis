# Implementation Plan: Encerramento de Sessão

**Branch**: `003-close-session` | **Spec**: `specs/003-close-session/spec.md`

## Resumo

A feature fecha definitivamente uma Session por `public.close_session(p_session_id uuid)`, autorizada exclusivamente por `auth.uid() = sessions.host_id`. O primeiro encerramento grava `closed_at`; retries retornam o mesmo horário com `changed=false`. Todos os writers bloqueiam a mesma Session antes de Participant ou Queue e rejeitam `status='closed'` no banco.

A baseline histórica é imutável e já contém `closed` e `closed_at`, mas também contém writers, grants e policies incompatíveis. Esta feature não reescreve migrations antigas: aplica primeiro uma migration corretiva transacional que fecha toda a fronteira de escrita e, depois, uma migration transacional de leitura/RLS/Realtime.

## Contexto técnico

- Next.js App Router, React 19 e TypeScript strict.
- Supabase PostgreSQL, Auth, RLS e Realtime Postgres Changes.
- Supabase CLI `2.106.0` como devDependency exata.
- Vitest, React Testing Library, Playwright, pgTAP e Supabase local.
- `pg` e `@types/pg` como devDependencies para o harness transacional.
- shadcn/ui AlertDialog, Tailwind CSS e mobile-first.
- Banco e testes exclusivamente locais durante implementação; produção é proibida.

## Constitution Check

- Clean Architecture: regras no banco/domínio/aplicação; UI apenas orquestra.
- Mobile/PWA: 48×48 px, dark mode, feedback assíncrono e WCAG 2.1 AA.
- Integridade: constraint, trigger, RPCs, locks, revokes e RLS.
- Realtime obrigatório e sem polling.
- TypeScript strict, sem `any`, com Server Components por padrão.
- Dados de Session, Participant e Queue são preservados.

Não há desvio constitucional planejado.

## Baseline histórica imutável

As migrations `001–014` permanecem intactas. A baseline já define `sessions.status` com `active|paused|closed` e `closed_at`, mas não garante coerência temporal, terminalidade ou bloqueio uniforme dos writers. Também existem grants/policies diretos e RPCs antigas que não tratam `closed` corretamente.

A migration 015 é, portanto, uma correção de segurança da baseline. Em banco novo, ela é aplicada depois de toda a história e produz o estado seguro. Em banco existente, ela corrige os objetos atuais sem reescrever história. Se o preflight encontrar linhas incoerentes, como Session closed sem timestamp autoritativo ou Session não closed com `closed_at`, a transaction aborta antes de qualquer alteração; a remediação de dados deve ser revisada pelo operador e a migration reaplicada. Nenhum timestamp é inventado.

Após o commit da 015, nenhum writer legado, DML direto incompatível ou caminho de reabertura permanece. Não se afirma que a baseline histórica sempre foi segura.

## Modelo e invariantes

- `status text NOT NULL DEFAULT 'active'` com valores `active`, `paused`, `closed`.
- `closed_at timestamptz NULL`.
- `sessions_status_check`: `status IN ('active','paused','closed')`.
- `sessions_closed_at_coherence_check`: `(status = 'closed') = (closed_at IS NOT NULL)`.
- Transições válidas: `active ↔ paused`, `active → closed`, `paused → closed`.
- `closed` é terminal.
- O primeiro `closed_at` é imutável.
- `close_session` já closed não executa UPDATE nem emite novo evento.
- Nenhum índice novo: PK/code unique, `sessions_host_id_idx`, `sessions_status_idx`, vínculo Participant e índices de Queue existentes cobrem os acessos planejados.

### `private.enforce_session_state_transition()`

Definição única:

```sql
private.enforce_session_state_transition() RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
PARALLEL UNSAFE
SET search_path = ''
```

- owner `postgres`;
- zero argumentos;
- corpo usa apenas `OLD.status`, `OLD.closed_at`, `NEW.status` e `NEW.closed_at`;
- nenhuma consulta, SQL dinâmico ou chamada a `auth.uid()`;
- objetos e binding sempre qualificados por schema;
- `REVOKE ALL ON FUNCTION private.enforce_session_state_transition() FROM PUBLIC, anon, authenticated`;
- nenhum GRANT para papéis web;
- trigger `public.sessions_enforce_state_transition`, `BEFORE UPDATE OF status, closed_at ON public.sessions FOR EACH ROW`;
- `pg_proc` deve provar `prosecdef=false`, `provolatile='v'`, owner, linguagem, assinatura e `search_path`; `pg_trigger` prova o binding.

SECURITY INVOKER é suficiente porque a função apenas compara OLD/NEW; elevar privilégio não é necessário.

## Cutover em dois estágios

### Migration 015 — correção atômica de integridade e writers

Arquivo: `supabase/migrations/20260729100000_015_session_closure_atomic.sql`.

A migration usa `BEGIN`/`COMMIT` explícitos e, na mesma transaction:

1. executa preflight dos dados históricos;
2. executa `CREATE SCHEMA IF NOT EXISTS private`, define owner `postgres` e `REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated`, sem CREATE/USAGE web;
3. instala as duas constraints e o trigger terminal;
4. remove assinaturas cujo retorno será alterado;
5. recria e endurece todos os writers;
6. cria `close_session`;
7. revoga INSERT/UPDATE/DELETE diretos incompatíveis;
8. fixa owners, `search_path=''`, qualification e EXECUTE mínimo;
9. confirma a ordem global de locks Session → Participant/Queue;
10. faz COMMIT somente depois de toda a fronteira estar segura.

Funções com mudança real de return type exigem estes comandos exatos antes da recriação:

```sql
DROP FUNCTION IF EXISTS public.create_queue_entry(uuid, character varying, character varying);
DROP FUNCTION IF EXISTS public.cancel_queue_entry(uuid);
```

`join_session(text,text)` já retorna `jsonb` na baseline final e pode ser substituída mantendo o return type. As funções novas `update_queue_status`, `update_session_status` e `close_session` não exigem DROP de retorno anterior.

Objetos finais da 015:

- `public.join_session(text,text) RETURNS jsonb`;
- `public.create_queue_entry(uuid,character varying,character varying) RETURNS TABLE(id uuid,session_id uuid,participant_id uuid,song_title character varying,artist character varying,status character varying,position integer,created_at timestamptz,updated_at timestamptz)`;
- `public.cancel_queue_entry(uuid) RETURNS void`;
- `public.update_queue_status(uuid,text) RETURNS TABLE(id uuid,status text,updated_at timestamptz,changed boolean)`;
- `public.update_session_status(uuid,text) RETURNS TABLE(id uuid,status text,changed boolean)`;
- `public.close_session(uuid) RETURNS TABLE(session_id uuid,status text,closed_at timestamptz,changed boolean)`.

Todas são `LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path=''`, owner `postgres`, usam referências qualificadas e autorização interna por `auth.uid()`. Após cada criação: REVOKE ALL de PUBLIC/anon/authenticated e GRANT EXECUTE somente a authenticated. Supabase Anonymous Auth utiliza o role authenticated.

### Migration 016 — leitura, RLS, Host details e Realtime

Arquivo: `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql`.

Também usa uma única transaction. Ela:

1. cria os helpers privados de RLS;
2. remove policies legadas por nome exato;
3. revoga SELECT amplo antes de qualquer grant mínimo;
4. cria as policies finais;
5. cria `public.get_host_session_details(p_session_id uuid) RETURNS TABLE(id uuid,code text,status text,closed_at timestamptz,created_at timestamptz,max_participants smallint,max_queue_entries smallint)`;
6. concede somente as colunas/EXECUTEs aprovados;
7. adiciona `public.sessions` idempotentemente à publication `supabase_realtime`;
8. solicita schema reload e faz COMMIT.

Ela não altera writers, transições ou `close_session`.

Policies legadas removidas:

```sql
DROP POLICY IF EXISTS sessions_select_public ON public.sessions;
DROP POLICY IF EXISTS sessions_update_own ON public.sessions;
DROP POLICY IF EXISTS participants_select_session ON public.participants;
DROP POLICY IF EXISTS "Users can read active queue of their session" ON public.queue;
DROP POLICY IF EXISTS "Host can update queue" ON public.queue;
```

As deny policies aprovadas `"Block direct inserts on queue"` e `"Block direct deletes on queue"` são preservadas. `pg_policies` deve provar o conjunto final exato, sem policy permissiva residual, `USING (true)` ou `WITH CHECK (true)`.

## Helpers RLS

As três funções são owner `postgres`, `LANGUAGE sql STABLE SECURITY DEFINER PARALLEL UNSAFE SET search_path=''`, não STRICT, não LEAKPROOF, sem SQL dinâmico e com objetos qualificados:

- `private.is_session_host(p_session_id uuid) RETURNS boolean`;
- `private.is_session_member(p_session_id uuid) RETURNS boolean`;
- `private.is_session_open(p_session_id uuid) RETURNS boolean`.

`is_session_host` lê somente `public.sessions(id,host_id)`; `is_session_member` lê somente `public.participants(session_id,auth_user_id)`; `is_session_open` lê `public.sessions(id,status)` e exige o resultado de Host ou membro. Todas retornam false para JWT/argumento nulo, Session inexistente ou não relacionada. `is_session_open` só retorna true para active/paused quando o chamador é Host ou Participant vinculado.

SECURITY DEFINER é necessário para quebrar recursão RLS; o owner `postgres` ignora RLS sem `FORCE ROW LEVEL SECURITY`, que permanece desabilitado. Argumentos arbitrários revelam no máximo o vínculo booleano do próprio `auth.uid()`. ACL final:

```sql
ALTER SCHEMA private OWNER TO postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
ALTER FUNCTION private.is_session_host(uuid) OWNER TO postgres;
ALTER FUNCTION private.is_session_member(uuid) OWNER TO postgres;
ALTER FUNCTION private.is_session_open(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_session_host(uuid), private.is_session_member(uuid), private.is_session_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_session_host(uuid), private.is_session_member(uuid), private.is_session_open(uuid) TO authenticated;
```

No estado pós-015, o schema já pertence a `postgres` e o mesmo `REVOKE ALL ON SCHEMA` está aplicado, sem USAGE web; o GRANT de USAGE acima ocorre somente na 016. `pg_proc`, `information_schema.routine_privileges` e a matriz Host/member/external comprovam owner, modo, search path, ACL e ausência de recursão.

## RLS e grants finais

- não existe policy pública de lookup: código de entrada é resolvido exclusivamente por `join_session` após Supabase Anonymous Auth;
- `sessions_select_owned_or_member`: authenticated, SELECT, `private.is_session_host(id) OR private.is_session_member(id)`.
- `participants_select_authorized_open_or_host`: authenticated, SELECT, `private.is_session_host(session_id) OR private.is_session_open(session_id)`.
- `queue_select_authorized_open_or_host`: authenticated, SELECT, mesma autorização.

Antes dos grants mínimos:

```sql
REVOKE SELECT ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.participants, public.queue FROM PUBLIC, anon, authenticated;
```

Depois:

```sql
GRANT SELECT (id, code, status, closed_at) ON TABLE public.sessions TO authenticated;
GRANT SELECT ON TABLE public.participants, public.queue TO authenticated;
```

RLS decide linhas e ACL decide colunas. Host não recebe SELECT amplo de Session; detalhes completos vêm somente de `get_host_session_details(uuid)`.

## Concorrência

Todos os writers obtêm lock da Session antes de qualquer Participant/Queue lock e revalidam status após o lock. Resultado:

- close primeiro: writer aguardando retorna `SESSION_CLOSED` e não muta;
- writer primeiro: sua alteração confirmada é preservada e close ocorre depois;
- close × close: um `changed=true`, outro `changed=false`, mesmo `closed_at`;
- nenhuma operação usa consulta prévia do frontend como barreira.

O harness `src/infrastructure/__tests__/supabase/postgres-race-harness.ts` usa três `pg.Client` persistentes (`txA`, `txB`, `observer`), transactions explícitas, claims, `pg_blocking_pids`, barreira observada, timeouts e cleanup em `finally/afterAll`. Corridas pareadas cobrem close × join/create/cancel/pause/resume/update-queue. Idempotência usa um close inicial seguido de 19 retries estritamente sequenciais, satisfazendo SC-005 sem ampliar o harness pareado.

## Supabase local e variável do harness

Ordem:

1. validar `npx --no-install supabase --version` = `2.106.0`;
2. executar apenas comandos `--help` no preflight;
3. iniciar `npx --no-install supabase start`;
4. no wrapper `scripts/test-db-race-local.ps1`, executar `supabase status -o env` em memória;
5. extrair DB_URL e aceitar apenas localhost/127.0.0.1 e porta local;
6. definir `SUPABASE_TEST_DB_URL` apenas no ambiente do Vitest filho iniciado imediatamente;
7. aguardar, remover a variável em `finally` e fechar clients;
8. nunca persistir, imprimir ou aceitar override remoto.

Nenhuma tarefa prepara a variável para outra tarefa.

## Aplicação e tipos

Server Components carregam o snapshot inicial. Client Components são limitados ao lifecycle, Realtime, modal, confirmação, conectividade e navegação. `SessionLifecycleProvider` e `useSessionLifecycle` concentram status, resync, epoch, cleanup e `writesAllowed`.

Realtime assina `public.sessions`, evento UPDATE, filtro `id=eq.<sessionId>`, com todos `.on()` registrados antes de `.subscribe()`. RLS é a autoridade. Carga inicial, reconnect, token refresh, `online`, `visibilitychange` e BFCache fazem point-read; não há polling.

### Geração de tipos no PowerShell 5.1

Após cada migration, usar escrita UTF-8 sem BOM:

```powershell
$generated = (& npx --no-install supabase gen types typescript --local --schema public | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar tipos Supabase.' }
$target = Join-Path (Get-Location) 'src/infrastructure/supabase/database.types.ts'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $generated, $utf8NoBom)
$bytes = [System.IO.File]::ReadAllBytes($target)
if ($bytes.Length -ge 2 -and (($bytes[0] -eq 255 -and $bytes[1] -eq 254) -or ($bytes[0] -eq 254 -and $bytes[1] -eq 255))) { throw 'Encoding UTF-16 proibido.' }
if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) { throw 'BOM UTF-8 proibido.' }
```

Depois validar os primeiros bytes sem BOM/UTF-16, confirmar as funções esperadas em `Database['public']['Functions']` e executar `npm run typecheck`. Redirecionamento simples é proibido.

Após 015 aparecem todos os writers e `close_session`. Após 016 aparece `get_host_session_details` e o schema final.

## Gates executáveis

Para cada migration: criar arquivo → aplicar localmente → verificar history → regenerar/validar tipos → executar gate → avançar.

### Gate pós-015

Executa:

- `003_session_closure_invariants.sql`;
- `003_session_writers.sql` incluindo ACL de escrita;
- `003_close_session.sql`;
- `003_session_concurrency.sql`;
- `003_session_privileges.sql` em seu ramo pós-015, que executa somente asserções já válidas de DML/EXECUTE e terminalidade;
- harness Vitest de corridas.

Prova writers, close, idempotência, reabertura bloqueada, primeiro `closed_at` imutável, DML direto bloqueado e dados preservados. O mesmo arquivo de privilégios usa `to_regprocedure('public.get_host_session_details(uuid)')` como sentinela e SQL dinâmico somente no ramo final, evitando resolução parse-time da RPC ausente após 015; habilita após 016 as asserções de SELECT/table/column privileges sem antecipar expectativas da migration seguinte. A 016 não pode ser aplicada se este gate falhar.

### Gate pós-016

Executa:

- `003_session_privileges.sql`;
- `003_sessions_rls.sql`;
- `003_participants_rls.sql`;
- `003_queue_rls.sql`;
- catálogo `pg_policies`;
- integração Realtime tipada.

Prova table/column privileges, SELECTs negativos, policies finais, Host/member/external × estados, ausência de recursão e entrega autorizada.

## Arquivos SQL de teste

- `supabase/tests/003_session_closure_invariants.sql`;
- `supabase/tests/003_session_writers.sql`;
- `supabase/tests/003_session_privileges.sql`;
- `supabase/tests/003_sessions_rls.sql`;
- `supabase/tests/003_participants_rls.sql`;
- `supabase/tests/003_queue_rls.sql`;
- `supabase/tests/003_close_session.sql`;
- `supabase/tests/003_session_concurrency.sql`.

Cada arquivo possui plano pgTAP explícito, fixtures isoladas, reset de claims e rollback/cleanup.

Matriz obrigatória:

- `003_session_closure_invariants.sql`: baseline válida, constraint, active↔paused, active/paused→closed, terminalidade, coerência/imutabilidade de `closed_at`, schema `private`, `pg_proc` e `pg_trigger`;
- `003_session_writers.sql`: assinaturas/return types/ACL de join/create/cancel/update-queue/update-session, `auth.uid()`, active/paused/closed, Session-first, Microfone Justo e ausência de mutação após closed;
- `003_close_session.sql`: owner active/paused, negativas indistinguíveis, DTO, primeiro timestamp, `changed`, preservação de Participant/Queue e pg_proc/ACL;
- `003_session_concurrency.sql`: um close + 19 retries sequenciais, mesmo `closed_at`, primeiro `changed=true`, demais false e invariantes após commit; as corridas pareadas ficam no harness `pg`;
- `003_session_privileges.sql`: consulta `information_schema.table_privileges`/`column_privileges`; prova `SELECT *` e colunas proibidas, INSERT/UPDATE/DELETE direto, alteração direta para closed, reabertura, remoção/alteração do primeiro `closed_at`, e ACL/EXECUTE finais. O arquivo usa ramo pós-015 e ramo pós-016 conforme o objeto sentinela documentado nos gates;
- `003_sessions_rls.sql`: Host e membro em active/paused/closed, externo/unlinked, UUID/código conhecido, projeção mínima, Realtime, ausência de recursão e catálogo sem policy residual;
- `003_participants_rls.sql` e `003_queue_rls.sql`: Host/member/external/unlinked nos estados aplicáveis, closed somente para Host, isolamento por Session, ausência de recursão e DML direto bloqueado.

## Cliente, offline e UX

- Botão Host destructive, 48 px, disabled offline/uncertain/closing/closed.
- Sem fila offline e sem sucesso otimista.
- Resposta incerta mantém writes bloqueados e exige resync antes de retry.
- `SessionClosedDialog` é não dispensável, sem X, Escape ou outside close, com foco e única ação.
- Ação final usa cleanup room-scoped e `router.replace('/')` sem redirecionamento automático.
- Host: remove canal, estado/caches de Session e Queue daquela sala; preserva Auth Supabase normal, cookies e dados de outras salas.
- Participant: remove canal, `sessionId`, `participantId`, snapshot/cache de Session/Queue daquela sala; preserva Supabase Anonymous Auth, cookies e outras salas/abas, sem `signOut`.
- Nenhum token entra em cache/localStorage, e Back/popstate/gesto/BFCache ou revisita da URL fazem nova consulta e reapresentam o modal closed.
- Refresh, URL direta, reconnect, token refresh, evento perdido e BFCache consultam a fonte de verdade.
- Service Worker não cacheia Session, RSC privado, Auth, RPC, Queue ou Participant.

## Critérios mensuráveis

- Exatamente 20 entregas observadas para calcular nearest-rank p95; início no commit confirmado e fim no modal visível; p95 ≤ 2 s.
- Ambiente local automatizado e ambiente representativo separado; navegador/versão, região, viewport mobile e perfil estável registrados.
- Slow 3G controlado em Chromium, viewport 390×844, 400 Kbps down, 200 Kbps up, RTT 400 ms, timeout de incerteza 8 s.
- Loading aparece imediatamente, sem modal/sucesso antes da confirmação; timeout produz mensagem incerta e resync.
- Clique “Voltar para o início” chega a `/` em até 5 s, medido a partir do clique em Chromium estável, viewport 390×844, Supabase local e rede loopback sem throttling; versão, região local e perfil são registrados e a medição independe da latência do evento Realtime.

## Riscos e mitigação

- Baseline histórica insegura: 015 é a primeira ação de implementação e aborta atomicamente em inconsistência.
- Mudança de return type: DROP exato antes da recriação.
- Policy permissiva residual: DROP por nome e catálogo final.
- Grant amplo residual: REVOKE antes de GRANT e testes de catálogos/SELECT real.
- Encoding inválido: WriteAllText UTF-8 sem BOM e inspeção de bytes.
- Conexão remota acidental: wrapper loopback-only, sem fallback.
- Evento perdido: point-read inicial e resync orientado a eventos.

## Validação final do plano

- Baseline 001–014 permanece imutável e é reconhecida como historicamente incompatível.
- Existem somente migrations novas 015 e 016.
- create/cancel têm DROP exato antes da mudança de retorno.
- Sete contratos SQL possuem assinatura única.
- Trigger possui decisão idêntica em todos os artefatos.
- Gate 015 antecede 016; gate 016 cobre RLS/grants/Realtime.
- Tipos são escritos em UTF-8 sem BOM no PowerShell 5.1.
- Nenhuma implementação é realizada nesta etapa.

## Complexity Tracking

Nenhum desvio constitucional. A migration corretiva única reduz risco de estado parcial; a segunda transaction separa apenas leitura/RLS/Realtime.
