# Contract: Get Host Session Details

**Operation**: `getHostSessionDetails` → `public.get_host_session_details`

**Planned application path**: `src/infrastructure/supabase/queries/session.queries.ts`

## Exact database signature

```text
public.get_host_session_details(p_session_id uuid)
```

There is no overload by room code. The caller resolves a minimal authorized Session snapshot first and passes only its UUID. The client never sends `host_id`, participant id, auth claims, or ownership flags.

## Input

```typescript
type GetHostSessionDetailsInput = {
  sessionId: string; // valid UUID
};
```

- Invalid UUID is rejected by the application adapter before RPC invocation.
- A null UUID at the database boundary produces the same `SESSION_NOT_FOUND_OR_FORBIDDEN` outcome as a missing/non-owned row.

## Identity and authorization

1. Read the current identity only from qualified `auth.uid()`.
2. If it is null, raise `AUTH_REQUIRED`.
3. Read one qualified `public.sessions` row where `id = p_session_id AND host_id = auth.uid()`.
4. If no row matches, raise `SESSION_NOT_FOUND_OR_FORBIDDEN`.

Missing Session, participant caller, anonymous authenticated participant, authenticated user without a Participant, and another Host are deliberately indistinguishable. The operation does not rely on a client `host_id` or on the row being visible through a normal table policy.

## Security mode and ownership

- `LANGUAGE plpgsql`.
- `STABLE`.
- `SECURITY DEFINER` because client column grants intentionally exclude the full Host fields.
- `PARALLEL UNSAFE`.
- `SET search_path = ''`.
- Owner: trusted migration role `postgres`, never a web-controlled role.
- Every function/relation is schema-qualified; no dynamic SQL.
- No row lock: this is a point-in-time read-only operation.
- No `WHEN OTHERS` that converts unexpected database failures into a domain success.

## Sanitized output

Database return:

```text
RETURNS TABLE (
  id uuid,
  code text,
  status text,
  closed_at timestamptz,
  created_at timestamptz,
  max_participants smallint,
  max_queue_entries smallint
)
```

`code` is cast from `char(6)` to text. The application validates `status` and the `status`/`closed_at` invariant and maps the row to:

```typescript
type HostSessionDetails = {
  id: string;
  code: string;
  status: 'active' | 'paused' | 'closed';
  closedAt: string | null;
  createdAt: string;
  maxParticipants: number;
  maxQueueEntries: number;
};
```

The operation never returns:

- `host_id`;
- `auth.users` data;
- JWTs, cookies, tokens, or claims;
- Participant or Queue rows;
- `RETURNS public.sessions` or future Session columns implicitly.

## Grants and revokes

Created and secured in the same migration transaction:

```text
ALTER FUNCTION public.get_host_session_details(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_host_session_details(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_host_session_details(uuid)
  TO authenticated;
```

`anon` cannot execute. Supabase Anonymous Auth users use role `authenticated`, but participant calls still fail the internal ownership predicate. `service_role` is never exposed to the client.

## Success behavior

- Owned active, paused, or closed Session returns exactly one sanitized row.
- Closed ownership remains readable for preservation and initial final-state rendering.
- No mutation, lock, or Realtime event occurs.

## Errors

| Code | Client behavior |
|---|---|
| `AUTH_REQUIRED` | Require a valid Supabase user |
| `SESSION_NOT_FOUND_OR_FORBIDDEN` | Redirect/deny without revealing existence or owner |
| `INVALID_SESSION_STATE` | Keep writes blocked if returned status/timestamp is incoherent |
| `OFFLINE` | Do not claim fresh Host details |
| `UNKNOWN` | Log only on the server and show a generic message |

## Tests

Positive:

- owning Host reads active, paused, and closed;
- output contains exactly the seven approved fields;
- closed status includes the original `closed_at`.

Negative:

- null/invalid input;
- unauthenticated role;
- `anon` EXECUTE;
- participant, another Host, authenticated external, and nonexistent UUID;
- no overload accepting code;
- direct client SELECT of Host-only columns remains denied.

Catalog assertions:

- exact `(p_session_id uuid)` identity arguments;
- `prosecdef=true`, `provolatile='s'`, `proparallel='u'`;
- owner is `postgres`;
- fixed empty search path in `proconfig`;
- authenticated has EXECUTE; PUBLIC/anon do not.

## Offline and Realtime

No fresh details are claimed offline. Previously rendered data may remain behind the offline/final modal but is not authorization. This read emits no event; the separate minimal Session subscription remains responsible for closed notifications.