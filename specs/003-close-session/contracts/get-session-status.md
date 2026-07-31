# Contract: Get / Resynchronize Session Status

**Operations**: `getSessionStatusByCode`, `getSessionStatusById`  
**Planned paths**: `src/infrastructure/supabase/queries/session.queries.ts`, `src/application/session/get-session-status.action.ts`

This one contract serves initial load and every resync. There is no separate polling or duplicate resync RPC.

## Inputs

- Initial route: normalized 6-character `code`.
- Connected lifecycle: `sessionId` UUID.

## Identity and authorization

Uses the current Supabase JWT and the final split policies:

- `sessions_select_open` permits the existing minimal active/paused lookup for `anon` and `authenticated`;
- `sessions_select_owned_or_member` permits an authenticated owning Host or linked participant to read the same minimal row after closure through secured private helpers.

RLS authorizes rows and column ACLs authorize only `id,code,status,closed_at`. The Realtime `id=eq.<sessionId>` filter never authorizes access.

- Active/paused rows retain the existing minimal room-lookup visibility.
- Closed rows are visible only to the owning Host or an already linked participant.
- Knowing code/UUID alone never reveals a closed row.

## Projection

```typescript
type SessionStatusSnapshot = {
  id: string;
  code: string;
  status: 'active' | 'paused' | 'closed';
  closedAt: string | null;
};
```

Select only `id,code,status,closed_at`. Do not select `*`.

## Validation

- Input code/UUID must be valid.
- Status must match the domain union.
- Closed requires a valid `closedAt`.
- Active/paused require `closedAt=null`.
- Invalid external data returns a safe error and keeps writes blocked.

## Success behavior

- Initial closed snapshot causes immediate final modal.
- Resync closed causes terminal lifecycle state.
- Active/paused after successful resync may restore writes subject to role/status rules.

## Errors

| Code | Meaning | UI behavior |
|---|---|---|
| `SESSION_NOT_FOUND` | Missing or not visible | Existing route/join behavior; no data leak |
| `UNAUTHORIZED` | No valid identity for a protected closed read | Keep writes blocked |
| `INVALID_SESSION_STATE` | Payload violates status/timestamp invariant | Keep blocked; report generic error |
| `OFFLINE` | Point read unavailable | Preserve snapshot read-only |
| `UNKNOWN` | Unexpected failure | Preserve safe blocked state |

## Resync triggers

- first `SUBSCRIBED`;
- reconnect/re-subscribe;
- `online`;
- `visibilitychange` visible / `pageshow`;
- `TOKEN_REFRESHED`;
- uncertain close response;
- invalid/missed Realtime payload.

No timer or polling.

## Data exposure

Participant never receives `host_id`, limits, full participants, or queue through this contract.

