# Contract Change: Pause / Resume Session

**Existing operation**: `updateSessionStatusAction` currently performs a direct `sessions.update()`.  
**Definitive database operation**: `public.update_session_status(p_session_id uuid, p_new_status text)`.

## Exact SQL contract

```sql
public.update_session_status(
  p_session_id uuid,
  p_new_status text
)
RETURNS TABLE (
  id uuid,
  status text,
  changed boolean
)
```

- `LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE`;
- owner: `postgres`;
- fixed `SET search_path = ''`;
- every object is schema-qualified;
- no overload accepts room code, `host_id`, `closed_at`, or authorization claims.

## Input and validation

Application input is:

```typescript
type UpdateSessionStatusInput = {
  sessionId: string;
  newStatus: 'active' | 'paused';
};
```

The application validates UUID and enum before invoking the typed RPC. The database independently requires `p_new_status IN ('active','paused')`. Passing `closed` or any other value returns `INVALID_STATUS_TRANSITION`; this RPC cannot set or request `closed`.

## Identity and authorization

- identity comes only from `auth.uid()`;
- null identity returns `AUTH_REQUIRED`;
- the function locks only a Session whose persisted `host_id` equals the current identity;
- participant, another Host, unrelated authenticated user, missing UUID, and non-owned Session return the same `SESSION_NOT_FOUND_OR_FORBIDDEN` error;
- no client-provided Host value participates in authorization.

## Locking and state machine

1. validate authenticated identity and target enum;
2. select the owned Session by `p_session_id` and `auth.uid()` and lock it `FOR UPDATE`;
3. if no owned row exists, return the common not-found/forbidden error;
4. if the locked row is already `closed`, return `SESSION_CLOSED`;
5. if current status equals `p_new_status`, return the current row with `changed=false` and perform no UPDATE;
6. allow only `active→paused` or `paused→active`;
7. update status, preserve `closed_at=NULL`, and return `changed=true`.

The Session row is the first and only lock. It serializes pause/resume with `close_session`, join, create, cancel, and Queue status changes.

## Idempotency and transitions

| Current | Requested | Result |
|---|---|---|
| `active` | `active` | success, `changed=false`, no UPDATE/event |
| `paused` | `paused` | success, `changed=false`, no UPDATE/event |
| `active` | `paused` | success, `changed=true` |
| `paused` | `active` | success, `changed=true` |
| `closed` | `active|paused` | `SESSION_CLOSED`, no UPDATE |
| any | `closed` or another value | `INVALID_STATUS_TRANSITION` |

`close_session` remains the only operation that can define `status='closed'` or fill `closed_at`. The terminal trigger and consistency constraint independently prevent this RPC or any future privileged writer from reopening a Session or changing the first closure timestamp.

## Sanitized result

```typescript
type UpdateSessionStatusResult = {
  id: string;
  status: 'active' | 'paused';
  changed: boolean;
};
```

The RPC returns exactly `id`, `status`, and `changed`. It never returns `host_id`, room code, limits, timestamps, a whole Session row, or future columns. The current action may preserve its public `AppSuccess<void>` result while consuming this typed DTO internally.

## Domain errors

| Code | Meaning | Client behavior |
|---|---|---|
| `AUTH_REQUIRED` | No authenticated identity | Generic authentication message |
| `SESSION_NOT_FOUND_OR_FORBIDDEN` | Missing or non-owned Session | Common sanitized access message |
| `SESSION_CLOSED` | Locked Session is terminal | “Esta sala já foi encerrada.” |
| `INVALID_STATUS_TRANSITION` | Target is not active/paused or transition is invalid | Existing friendly transition message |
| `UNKNOWN` | Unexpected adapter/database failure | Generic message; detail remains server-side |

## Privileges

Direct Session UPDATE and the legacy Host UPDATE policy are removed in the contract cutover. `SECURITY DEFINER` is therefore necessary for this narrowly authorized mutation. The migration must:

1. set owner to `postgres`;
2. use only qualified references with `search_path=''`;
3. `REVOKE ALL ON FUNCTION public.update_session_status(uuid,text) FROM PUBLIC, anon, authenticated`;
4. `GRANT EXECUTE ON FUNCTION public.update_session_status(uuid,text) TO authenticated`.

Participants using Supabase Anonymous Auth share the authenticated role but fail ownership inside the function. There is no direct client UPDATE fallback.

## Realtime and late responses

- a real active↔paused UPDATE emits one Session UPDATE through the existing/final Session Realtime path;
- an idempotent same-status call emits no event;
- `closed` received through Realtime or resync remains terminal and wins over a late action response;
- offline, unconfirmed, closing, or closed lifecycle states prevent invocation through `writesAllowed=false`.

## Tests

Positive:

- owner active→paused and paused→active;
- active→active and paused→paused return `changed=false` without an UPDATE event;
- DTO contains exactly id/status/changed;
- changed calls produce one authorized Session Realtime event.

Negative:

- null auth, participant, another Host, unrelated authenticated user, missing/non-owned Session;
- target `closed`, unknown target, and attempts on an already closed Session;
- direct Session UPDATE remains blocked and `close_session` remains the only route to closed;
- PUBLIC/anon lack EXECUTE and `pg_proc` proves exact signature, owner, security mode, volatility, parallel mode, and empty search path.

Concurrency:

- close-first makes the waiting pause/resume return `SESSION_CLOSED` with Session still closed;
- pause/resume-first preserves its committed nonterminal transition, then close commits;
- active/paused idempotent calls serialize safely with close;
- every winner order uses a fresh fixture and the deterministic three-connection PostgreSQL harness.
