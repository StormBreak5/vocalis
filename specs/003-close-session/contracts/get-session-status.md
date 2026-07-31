# Contract: Get and Resynchronize Session Status

## Operation

Application operations `getSessionStatus(sessionId)` and `resyncSessionStatus(sessionId)` reuse one infrastructure query; no second RPC exists.

Input is exclusively `sessionId: uuid`. Identity comes from the current Supabase JWT. No code/host parameter alternative is accepted.

## Projection and authorization

Direct Session SELECT exposes only `id`, `code`, `status`, `closed_at`. RLS authorizes only Host ownership or existing Participant membership; open code lookup occurs only inside authenticated `join_session`. External/cross-session direct SELECT returns the sanitized not-found/forbidden result in every status, even with a known UUID or code.

Host details beyond the projection are obtained only through `public.get_host_session_details(uuid)`. Participant/Queue rows are not fetched when the confirmed status is closed.

## Validation and result

Runtime validation requires status active|paused|closed and coherent timestamp. Result:

```typescript
type SessionStatusSnapshot = {
  id: string;
  code: string;
  status: 'active' | 'paused' | 'closed';
  closedAt: string | null;
};
```

Invalid/incoherent payload produces fail-closed state and sanitized error; no `any` or blind cast.

## Resync triggers

Initial load, direct URL, refresh, first/re-SUBSCRIBED, reconnect, TOKEN_REFRESHED, online, visible, pageshow/BFCache, invalid payload and uncertain mutation response. No interval or polling.

## Offline

Offline snapshot is read-only and cannot establish active authorization. Writes remain blocked until a fresh successful point read confirms active/paused.
