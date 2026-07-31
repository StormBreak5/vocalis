# Contract: Get and Resynchronize Session Status

## Operation

Application operations `getSessionStatus(sessionId)` and `resyncSessionStatus(sessionId)` reuse one infrastructure query; no second RPC exists.

Input is exclusively `sessionId: uuid`. Identity comes from the current Supabase JWT. No code/host parameter alternative is accepted.

## Projection and authorization

Direct Session SELECT exposes only `id`, `code`, `status`, `closed_at`. RLS authorizes only Host ownership or existing Participant membership; open code lookup occurs only inside authenticated `join_session`. External/cross-session direct SELECT returns the sanitized not-found/forbidden result in every status, even with a known UUID or code.

Host details beyond the projection are obtained only through `public.get_host_session_details(uuid)`. Participant/Queue rows are not fetched when the confirmed status is closed.

## Realtime subscription

The subscription is exactly:

```typescript
{
  event: "UPDATE",
  schema: "public",
  table: "sessions",
  filter: "id=eq.<sessionId>",
  select: ["id", "code", "status", "closed_at"]
}
```

The four columns have the minimum SELECT grant. The projection and filter complement, but never replace, RLS. Every `.on()` callback is registered before `.subscribe()`.

## Realtime types and validation

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

Validation treats the envelope and projected row separately:

- `eventType`, `schema` and `table` must be `UPDATE`, `public` and `sessions`;
- all valid Supabase envelope fields listed by `SessionRealtimeEnvelope` are accepted;
- `new` must contain exactly `id`, `code`, `status`, `closed_at`;
- `host_id` or any unexpected key in `new` is rejected;
- `old` may be partial, but may contain only keys from `SessionRealtimeRow`;
- invalid input produces fail-closed state and a point-read resynchronization;
- no `any`, broad cast or unvalidated property access is permitted.

Tests in `src/domain/__tests__/session-lifecycle.test.ts` cover a valid envelope, `new` with the four exact columns, partial `old`, `host_id` in `new`, another unexpected `new` column, wrong schema, wrong table and event type other than UPDATE. Integration tests additionally prove Host/Participant delivery and cross-session isolation.

## Result

Point-read runtime validation requires status active|paused|closed and coherent timestamp. Result:

```typescript
type SessionStatusSnapshot = {
  id: string;
  code: string;
  status: "active" | "paused" | "closed";
  closedAt: string | null;
};
```

Invalid or incoherent data produces fail-closed state and a sanitized error.

## Resync triggers

Initial load, direct URL, refresh, first/re-SUBSCRIBED, reconnect, TOKEN_REFRESHED, online, visible, pageshow/BFCache, invalid payload and uncertain mutation response. No interval or polling.

## Offline

Offline snapshot is read-only and cannot establish active authorization. Writes remain blocked until a fresh successful point read confirms active/paused.
