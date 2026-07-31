# Contract Change: Update Queue Status

**Existing operation**: `updateQueueStatusAction` currently performs a direct `queue.update()`.  
**Definitive database operation**: `public.update_queue_status(p_queue_id uuid, p_new_status text)`.

## Exact SQL contract

```sql
public.update_queue_status(
  p_queue_id uuid,
  p_new_status text
)
RETURNS TABLE (
  id uuid,
  status text,
  updated_at timestamptz,
  changed boolean
)
```

- `LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE`;
- owner: `postgres`;
- fixed `SET search_path = ''`;
- every reference is qualified, including `auth.uid()`, `public.sessions`, and `public.queue`;
- no overload accepts `session_id`, `host_id`, or authorization claims.

## Input and validation

Application input remains:

```typescript
type UpdateQueueStatusInput = {
  queueId: string;
  newStatus: 'pending' | 'preparing' | 'singing' | 'completed' | 'cancelled';
};
```

The application validates `queueId` as UUID and the status enum before invoking the typed RPC. The database repeats status validation and never trusts client validation.

The Queue entry determines its own `session_id`. A client cannot select another Session by supplying `session_id`, and cannot claim Host ownership through `host_id`.

## Identity and authorization

- identity comes only from `auth.uid()`;
- null identity returns `AUTH_REQUIRED`;
- only the Host whose persisted `sessions.host_id` equals `auth.uid()` may execute a status transition;
- participants, another Host, an authenticated user without a relationship, a missing Queue entry, and an entry outside the caller's Session return the same `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN` outcome;
- the common outcome prevents existence or cross-session disclosure.

Participant cancellation remains exclusively in `cancel_queue_entry`; this Host RPC does not broaden participant permissions.

## Locking and database sequence

Global lock order is Session → Queue:

1. reject null `auth.uid()`;
2. read only the Queue entry's immutable `session_id` without taking a Queue lock;
3. select the derived `public.sessions` row for that id and owner and lock it `FOR UPDATE`;
4. if no owned Session exists, return `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN`;
5. if the locked Session is `closed`, return `SESSION_CLOSED` before Queue mutation;
6. re-read the Queue row for the same id/session and lock it `FOR UPDATE`; if it disappeared or changed relationship, return the common not-found/forbidden error;
7. validate idempotency or the allowed transition;
8. update exactly one Queue row and return the sanitized DTO.

Queue → Session locking is forbidden. The sequence serializes with `close_session`, `cancel_queue_entry`, and other Session-first writers.

## Allowed transitions

| Current | Allowed new status |
|---|---|
| `pending` | `preparing`, `cancelled` |
| `preparing` | `singing`, `cancelled` |
| `singing` | `completed`, `cancelled` |
| `completed` | none |
| `cancelled` | none |

A request whose valid target equals the current status is an idempotent success for every status: no UPDATE occurs, `updated_at` is preserved, `changed=false`, and no Realtime event is emitted. Every other transition not listed above returns `INVALID_STATUS_TRANSITION` without mutation.

## Closed behavior

A locked Session with `status='closed'` always returns:

- code: `SESSION_CLOSED`;
- friendly message: “Esta sala já foi encerrada.”;
- no Queue update;
- no status or position change;
- no Queue Realtime event.

The result does not depend on frontend visibility or a prior status query.

## Sanitized result

Changed example:

```typescript
type UpdateQueueStatusResult = {
  id: string;
  status: QueueStatus;
  updatedAt: string;
  changed: boolean;
};
```

Only `id`, `status`, `updated_at`, and `changed` leave the function. It never returns `session_id`, `participant_id`, song fields, a whole `public.queue` row, Host identity, or future columns. Existing UI consumers may continue mapping a successful RPC to `AppSuccess<void>`; they must not mutate optimistically from the DTO.

## Domain errors

| Code | Meaning | Client behavior |
|---|---|---|
| `AUTH_REQUIRED` | No authenticated Supabase identity | Generic authentication message |
| `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN` | Missing entry, wrong Session, or non-owner | Common sanitized access message |
| `SESSION_CLOSED` | Locked Session is closed | “Esta sala já foi encerrada.” |
| `INVALID_STATUS_TRANSITION` | Invalid target or disallowed source → target | Existing friendly transition message |
| `UNKNOWN` | Unexpected adapter/database failure | Generic message; details remain server-side |

## Privileges

Because direct Queue UPDATE is revoked and the function must apply an authorized update behind RLS, `SECURITY DEFINER` is necessary. The migration must, after creating/replacing the exact signature:

1. set owner to `postgres`;
2. `REVOKE ALL ON FUNCTION public.update_queue_status(uuid,text) FROM PUBLIC, anon, authenticated`;
3. `GRANT EXECUTE ON FUNCTION public.update_queue_status(uuid,text) TO authenticated`.

There is no grant to `anon`. Supabase Anonymous Auth participants use the `authenticated` database role but still fail the internal Host predicate. Direct Queue INSERT/UPDATE/DELETE remains blocked.

## Realtime and late responses

- `changed=true` produces the existing Queue UPDATE Realtime event after commit;
- `changed=false`, validation failure, authorization failure, and `SESSION_CLOSED` produce no Queue event;
- the application executes only while `writesAllowed=true`;
- a response arriving after the lifecycle epoch changes is ignored and cannot show success or overwrite terminal UI.

## Tests

Positive:

- owning Host performs every allowed transition;
- same-status repetition returns identical id/status/updated_at with `changed=false`;
- changed DTO has exactly four fields;
- Queue UPDATE Realtime occurs once only for `changed=true`.

Negative:

- null auth, participant, another Host, unrelated authenticated user, missing Queue id, and cross-session entry;
- invalid status and every forbidden transition;
- Session closed preserves all Queue fields;
- direct UPDATE remains blocked;
- PUBLIC/anon lack EXECUTE and `pg_proc` proves owner, definer mode, volatility, parallel mode, and empty search path.

Concurrency:

- close-first blocks the waiting operation with `SESSION_CLOSED` and no Queue change;
- update-first preserves the committed Queue transition and close follows;
- both orders use the deterministic three-connection PostgreSQL harness and assert final state after commit;
- no test uses incidental delays to decide the winner.
