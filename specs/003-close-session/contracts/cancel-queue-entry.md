# Contract Change: Cancel Queue Entry

**Application operation**: `cancelQueueEntryAction`  
**Definitive database operation**: `public.cancel_queue_entry(p_queue_id uuid)`

## Exact SQL and application result

```sql
public.cancel_queue_entry(p_queue_id uuid)
RETURNS void
```

The single public application success contract remains:

```typescript
Promise<AppSuccess<void> | AppError>
```

Success is exactly `{ ok: true }`. Neither RPC nor action returns a cancelled Queue DTO. Database tests query persisted state; UI convergence uses Queue Realtime or an authorized refresh.

## Input, identity, and authorization

- Input is only `p_queue_id uuid`.
- Identity comes only from qualified `auth.uid()`; null returns `AUTH_REQUIRED`.
- Authorized caller is the Participant whose linked `auth_user_id` owns the Queue entry or the persisted Host of its Session.
- The client never supplies `participant_id`, `session_id`, `host_id`, or authorization claims.

## Locking and status behavior

Global order is Session → Queue:

1. validate identity and Queue UUID;
2. read only immutable `queue.session_id` without a Queue lock;
3. select and lock that `public.sessions` row `FOR UPDATE`;
4. missing Queue/Session or unauthorized cross-session target returns the sanitized common error;
5. if Session is `closed`, return `SESSION_CLOSED` before Queue mutation;
6. active and paused both preserve the existing cancellation behavior;
7. re-fetch the same Queue id/session `FOR UPDATE`;
8. authorize Participant owner or Session Host;
9. allow only pending/preparing → cancelled;
10. update one row and return void.

Closed preserves status, position, timestamps, and every other Queue field. It emits no Queue event.

## Security mode and privileges

- `LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE`.
- SECURITY DEFINER is required because direct Queue UPDATE is revoked.
- Owner: `postgres`.
- Fixed `SET search_path = ''`; all auth/Session/Participant/Queue references are schema-qualified.
- No dynamic SQL.

```sql
ALTER FUNCTION public.cancel_queue_entry(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_queue_entry(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_queue_entry(uuid)
  TO authenticated;
```

Supabase Anonymous Auth participants execute as `authenticated`; unauthenticated role `anon` cannot execute.

## Domain errors

| Code | Meaning |
|---|---|
| `AUTH_REQUIRED` | Missing valid identity |
| `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN` | Missing Queue, wrong Session, or unauthorized caller |
| `SESSION_CLOSED` | “Esta sala já foi encerrada.”; no mutation |
| `INVALID_STATUS_TRANSITION` | Queue is not pending/preparing |
| `UNKNOWN` | Sanitized unexpected failure |

## Concurrency and late responses

If cancel commits first, cancelled is preserved and close follows. If close commits first, cancel wakes, revalidates and returns `SESSION_CLOSED` without mutation. Both orders use the deterministic three-connection harness. A late application success is ignored when the lifecycle epoch changed.

## Tests

- pg_proc exact `(uuid) RETURNS void`, owner, SECURITY DEFINER, VOLATILE, PARALLEL UNSAFE, empty search path;
- authenticated-only EXECUTE; PUBLIC and anon denied;
- Participant owner and owning Host cancel pending/preparing in active and paused Sessions;
- closed preserves the row and returns the approved message;
- another participant, another Host, external authenticated user, null auth, missing Queue, and invalid status fail safely;
- direct Queue UPDATE remains blocked;
- exact application result is `{ok:true}`, with no DTO;
- close-first/cancel-first assertions after commit and no deadlock;
- no success toast or local mutation after lifecycle epoch change.

## Offline

Cancellation is never queued or optimistic. `writesAllowed=false` blocks invocation while status is offline, uncertain, resyncing, or closed.
