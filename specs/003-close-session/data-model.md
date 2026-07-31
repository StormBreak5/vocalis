# Data Model: Encerramento de Sessão

## Baseline

`public.sessions` já possui `status` e `closed_at` desde a migration histórica 001. Essa história é imutável. A feature adiciona garantias corretivas nas migrations 015 e 016; não recria a tabela nem altera dados válidos.

## Session

| Campo | Tipo | Regra final |
|---|---|---|
| `id` | uuid | PK |
| `code` | char(6) | unique, preservado |
| `host_id` | uuid | referência Auth e autoridade do Host |
| `status` | text | `active`, `paused` ou `closed`; default `active` |
| `closed_at` | timestamptz null | preenchido se e somente se closed |
| `created_at` | timestamptz | preservado |
| limites | smallint | preservados |

Constraints finais:

```sql
CONSTRAINT sessions_status_check CHECK (status IN ('active', 'paused', 'closed'))
CONSTRAINT sessions_closed_at_coherence_check CHECK ((status = 'closed') = (closed_at IS NOT NULL))
```

Transições:

| Origem | Destino | Resultado |
|---|---|---|
| active | paused | permitido por update_session_status |
| paused | active | permitido por update_session_status |
| active | closed | permitido somente por close_session |
| paused | closed | permitido somente por close_session |
| closed | closed | close idempotente, sem UPDATE |
| closed | active/paused | rejeitado |

Uma Session não closed nunca carrega `closed_at`. O primeiro timestamp não pode ser removido nem alterado.

## Índices e compatibilidade

Nenhum índice novo é necessário. A feature preserva `sessions_host_id_idx`, `sessions_status_idx WHERE status != 'closed'`, o índice da constraint `(session_id,auth_user_id)` de Participant, `participants_session_id_idx`, `queue_session_position_idx` e `queue_active_participant_idx`. PK/unique code atendem lookups por UUID/código; os índices existentes atendem ownership, vínculo, locks e fila. Registros históricos válidos permanecem compatíveis, e o preflight da 015 aborta sobre incoerência em vez de reescrever dados.
## Trigger terminal

Definição canônica, idêntica ao plano:

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
- referências/binding qualificados por schema;
- corpo limitado a OLD/NEW;
- `REVOKE ALL` de PUBLIC, anon e authenticated;
- nenhum GRANT web;
- binding `public.sessions_enforce_state_transition`, `BEFORE UPDATE OF status, closed_at ON public.sessions FOR EACH ROW`.

Comportamento:

1. OLD closed exige NEW closed e timestamp `IS NOT DISTINCT FROM` OLD;
2. entrada em closed aceita apenas origem active/paused e timestamp não nulo;
3. active/paused exige timestamp nulo;
4. active↔paused é permitido;
5. a função nunca escolhe ou preenche horário.

Metadados e comportamento são testados em `supabase/tests/003_session_closure_invariants.sql` via `pg_proc`, `pg_trigger` e updates controlados.

## Participant

Campos e registros são preservados. Nenhum Participant é criado ou atualizado por join após closed. Membro existente continua sendo usado apenas como prova de vínculo para ler a projeção mínima da Session closed; não lê a lista de participantes depois do encerramento. Host mantém leitura autorizada dos dados preservados.

## Queue Entry

Campos, posição e status são preservados. Encerramento não altera pending, preparing, singing, completed ou cancelled. Depois de closed, create, cancel e update status falham antes de qualquer mutação.

O índice parcial do Microfone Justo permanece:

```sql
UNIQUE (session_id, participant_id)
WHERE status IN ('pending','preparing','singing')
```

## Migration 015 — correção de escrita

A transaction 015:

- valida dados históricos;
- executa `CREATE SCHEMA IF NOT EXISTS private`, owner `postgres`, revoga ALL/CREATE/USAGE de PUBLIC/anon/authenticated e instala o trigger sem EXECUTE web;
- instala a constraint;
- executa DROP exato das RPCs com retorno incompatível;
- recria join/create/cancel;
- cria update_queue_status, update_session_status e close_session;
- executa os REVOKEs explicitos de INSERT, UPDATE e DELETE para as tres tabelas e papeis web;
- aplica owner/search_path/ACL;
- confirma locks Session-first.


Os REVOKEs da 015 sao exatamente:

```sql
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.participants FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.queue FROM PUBLIC, anon, authenticated;
```

Eles bloqueiam DML direto, sem remover SELECT nesse estagio. Toda escrita passa por RPC com EXECUTE minimo para `authenticated` e autorizacao por `auth.uid()`: close/update-session/update-queue sao exclusivas do Host; join/create atendem usuario autenticado, inclusive Anonymous Auth; cancel atende Participant dono ou Host. `anon` nao autenticado nao recebe EXECUTE. O SELECT minimo e finalizado apenas pela 016.
Assinaturas removidas antes da recriação:

```sql
DROP FUNCTION IF EXISTS public.create_queue_entry(uuid, character varying, character varying);
DROP FUNCTION IF EXISTS public.cancel_queue_entry(uuid);
```

Locks:

| Operação | Ordem |
|---|---|
| close_session | Session |
| join_session | Session → Participant quando necessário |
| create_queue_entry | Session → Participant/Queue |
| cancel_queue_entry | derivar session_id → Session → Queue |
| update_queue_status | derivar session_id → Session → Queue |
| update_session_status | Session |

Todos revalidam status depois do lock de Session.

## Migration 016 — leitura/RLS/Realtime

### Helpers

| Função | Retorno | Segurança |
|---|---|---|
| `private.is_session_host(uuid)` | boolean | SQL/STABLE/SECURITY DEFINER |
| `private.is_session_member(uuid)` | boolean | SQL/STABLE/SECURITY DEFINER |
| `private.is_session_open(uuid)` | boolean | SQL/STABLE/SECURITY DEFINER |

Owner postgres, PARALLEL UNSAFE, `search_path=''`, qualification total, false para null/missing/unrelated. A 016 concede a authenticated somente USAGE de private e EXECUTE nessas três assinaturas, mantendo PUBLIC/anon sem USAGE/CREATE e authenticated sem CREATE. A função de trigger permanece sem EXECUTE web.

### Policies finais

| Tabela | Policy | Papel | USING |
|---|---|---|---|
| sessions | `sessions_select_owned_or_member` | authenticated | `is_session_host(id) OR is_session_member(id)` |
| participants | `participants_select_authorized_open_or_host` | authenticated | `is_session_host(session_id) OR is_session_open(session_id)` |
| queue | `queue_select_authorized_open_or_host` | authenticated | `is_session_host(session_id) OR is_session_open(session_id)` |

Policies legadas incompatíveis são removidas antes dessas criações. As policies `"Block direct inserts on queue"` e `"Block direct deletes on queue"` permanecem. Policies permissivas combinam por OR; por isso `pg_policies` deve provar o conjunto exato.

### Grants

Sessions não possui SELECT de tabela para papéis web. Somente `id`, `code`, `status`, `closed_at` são concedidos a authenticated; role anon não recebe SELECT. Lookup por código ocorre exclusivamente dentro de `join_session`, executada após Supabase Anonymous Auth. Participants e Queue possuem SELECT authenticated condicionado por RLS. INSERT/UPDATE/DELETE continuam RPC-only.

`get_host_session_details(uuid)` retorna sete campos (`id`, `code`, `status`, `closed_at`, `created_at`, `max_participants`, `max_queue_entries`) e nunca `host_id` ou a linha inteira.

### Envelope e linha Session Realtime

```typescript
type SessionRealtimeRow = {
  id: string;
  code: string;
  status: "active" | "paused" | "closed";
  closed_at: string | null;
};

type SessionRealtimeEnvelope = {
  eventType: "UPDATE";
  schema: "public";
  table: "sessions";
  commit_timestamp: string;
  new: SessionRealtimeRow;
  old: Partial<SessionRealtimeRow>;
  errors: string[];
};
```

A assinatura usa UPDATE, schema `public`, tabela `sessions`, filtro `id=eq.<sessionId>` e `select: ["id", "code", "status", "closed_at"]`. O schema do envelope valida os metadados literais e aceita os campos validos do envelope Supabase. Somente `new` recebe validacao estrita: exige exatamente as quatro colunas e rejeita `host_id` ou outra coluna. `old` pode ser parcial, mas somente com chaves da mesma linha. As quatro colunas possuem grant minimo; RLS decide a linha, enquanto filtro e `select` apenas reduzem o evento.
### Cardinalidade dos resultados RPC

| RPC | Retorno SQL | Cardinalidade lógica | DTO da aplicação |
|---|---|---|---|
| create_queue_entry | TABLE de 9 colunas | exatamente 1 linha | QueueEntry sanitizada |
| close_session | TABLE de 4 colunas | exatamente 1 linha | CloseSessionResult |
| update_queue_status | TABLE de 4 colunas | exatamente 1 linha | UpdateQueueStatusResult |
| update_session_status | TABLE de 3 colunas | exatamente 1 linha | UpdateSessionStatusResult |
| get_host_session_details | TABLE de 7 colunas | exatamente 1 linha | HostSessionDetails |

O cliente Supabase entrega cada `RETURNS TABLE` como coleção. `src/application/shared/expect-single-rpc-row.ts` recebe `unknown`, exige array com exatamente uma linha, valida essa linha pelo schema runtime específico e só então devolve o DTO singular. Zero/múltiplas linhas ou linha inválida são falhas de contrato seguras. `cancel_queue_entry` permanece void; `join_session` permanece jsonb.

## Invariantes de segurança

- auth vem somente de `auth.uid()`;
- Host informado pelo cliente nunca participa da autorização;
- filtro Realtime não substitui RLS;
- closed não pode ser reaberto por RPC, DML direto ou writer privilegiado;
- Session/Participant/Queue nunca são excluídos pelo fechamento;
- função SECURITY DEFINER possui owner confiável, search path vazio, qualification e grant mínimo;
- nenhuma policy final usa predicado true.

## Exemplos válidos

- active com `closed_at=NULL`;
- paused com `closed_at=NULL`;
- close de active gera closed com timestamp e changed=true;
- retry retorna closed, mesmo timestamp e changed=false;
- writer confirmado antes de close permanece; close confirma depois.

## Exemplos inválidos

- closed com timestamp nulo;
- active/paused com timestamp;
- mudança ou remoção do primeiro timestamp;
- closed→active/paused;
- create/cancel/update após commit de closed;
- SELECT de `host_id` por papel web;
- acesso de usuário externo por UUID/código conhecido.

## Tipos gerados

Antes da aplicacao da 015, os consumidores de join/create/cancel/update_queue_status/update_session_status/close_session e seus testes sao construidos a partir dos contratos, sem publicacao e sem typecheck global contra tipos historicos. Depois de aplicar 015, `Database` deve conter status/closed_at coerentes e essas RPCs; a geracao pos-015 em `src/infrastructure/supabase/database.types.ts` usa `System.IO.File.WriteAllText` com UTF-8 sem BOM. A matriz SQL e o harness rodam antes do typecheck/Vitest/integracao desses consumidores.

Depois de aplicar 016, a geracao final deve tambem conter `get_host_session_details` e o schema final. Somente entao queries e testes TypeScript dependentes da 016 sao compilados. A validacao de encoding, assinaturas e generic `Database` ocorre nas duas geracoes; o arquivo gerado nunca e editado manualmente.
