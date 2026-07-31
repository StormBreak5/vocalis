# Contract: Close Session

**Operation**: `closeSessionAction` → `public.close_session`  
**Planned path**: `src/application/session/close-session.action.ts`

## Input

```typescript
type CloseSessionInput = {
  sessionId: string; // valid UUID
};
```

RPC input: `p_session_id uuid`.

The client never sends `host_id`, room code, participant id, or authorization claims.

## Identity and authorization

- Server Action obtains the cookie-backed Supabase session.
- RPC uses `auth.uid()`.
- RPC selects `sessions.id = p_session_id AND sessions.host_id = auth.uid()` while taking `FOR UPDATE`.
- Missing and non-owned sessions produce the same sanitized domain error.
- Participants and other Hosts cannot close.

## Database operation

1. Fail `AUTH_REQUIRED` when `auth.uid()` is null.
2. Lock the owned Session row.
3. If not found, fail `SESSION_NOT_FOUND_OR_FORBIDDEN`.
4. If active/paused, set `status=closed` and the authoritative first `closed_at`.
5. If already closed, perform no update.
6. Return sanitized DTO.

## Locking

- Session is the only row locked by close.
- It is always the first lock.
- Lock is held until transaction completion.
- No participant/queue lock or mutation.

## Success

```typescript
type CloseSessionResult = {
  ok: true;
  session: {
    id: string;
    status: 'closed';
    closedAt: string;
  };
  changed: boolean;
};
```

- First close: `changed=true`.
- Retry/already closed: `changed=false`, same `closedAt`.

## Errors

| Code | Client message | Notes |
|---|---|---|
| `AUTH_REQUIRED` | “Você precisa estar autenticado.” | No JWT |
| `SESSION_NOT_FOUND_OR_FORBIDDEN` | “Sala não encontrada ou acesso não permitido.” | Same response for missing/non-owner |
| `OFFLINE` | “Conecte-se à internet para encerrar a sala.” | Client precondition; RPC not called |
| `UNKNOWN` | “Não foi possível encerrar a sala. Tente novamente.” | Sanitized unexpected failure |

`SESSION_CLOSED` is not an error for this operation.

## Security-definer controls

- `SECURITY DEFINER` justified by revoked direct UPDATE.
- `SET search_path=''`.
- Fully qualified objects.
- Revoke EXECUTE from `PUBLIC` and `anon`.
- Grant EXECUTE only to `authenticated`.
- Ownership validation inside the function.
- No sensitive fields returned.

## Realtime effect

- First close emits one `sessions` UPDATE.
- Idempotent retry emits no UPDATE.
- Client never waits exclusively for Realtime; the returned DTO or resync can establish closed.

## Offline/uncertain response

- Closure is never queued or optimistic.
- If the request may have committed but response is lost, lifecycle becomes `uncertain`.
- Status is resynchronized before retry.
- Retry is safe and preserves the first timestamp.

