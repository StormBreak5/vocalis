# Contract Change: Join Session

**Application operation**: `joinSessionAction`  
**Definitive database operation**: `public.join_session(p_code text, p_display_name text)`

## Exact SQL contract

```sql
public.join_session(
  p_code text,
  p_display_name text
)
RETURNS jsonb
```

The returned JSON is exactly:

```typescript
type JoinSessionRpcResult = {
  participant: {
    id: string;
    session_id: string;
    display_name: string;
    disambiguation_index: number;
    joined_at: string;
    last_seen: string;
    created_at: string;
  };
};
```

It never returns `auth_user_id`, recovery hashes/tokens, Session internals, auth claims, or future Participant columns implicitly.

## Input and identity

- `p_code`: normalized six-character room code.
- `p_display_name`: trimmed and validated by the existing display-name rules.
- Identity comes only from qualified `auth.uid()`.
- Null identity returns `AUTH_REQUIRED` before any lookup or mutation.
- No `host_id`, participant id, Session id, recovery token, or authorization claim is accepted from the client.

Supabase Anonymous Auth users carry a real JWT and execute as database role `authenticated`; they are different from an unauthenticated request using role `anon`. Only `authenticated` receives EXECUTE.

## Locking, authorization, and status

Global order is Session → Participant:

1. validate auth, code, and display name;
2. select `public.sessions` by normalized code and lock it `FOR UPDATE`;
3. missing Session returns `SESSION_NOT_FOUND`;
4. `closed` returns `SESSION_CLOSED` before count, recovery, `last_seen`, or INSERT;
5. `paused` preserves the current `SESSION_PAUSED` behavior and performs no Participant write;
6. `active` enforces capacity, then recovers the existing `(session_id,auth_user_id)` Participant or inserts one;
7. return the sanitized JSON DTO.

A repeated active join by the same authenticated identity is idempotent at the domain level: it returns the existing Participant and may update only its approved presence timestamp. It never creates a second row.

## Security mode and privileges

- `LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE`.
- SECURITY DEFINER is required because direct Participant INSERT/UPDATE is unavailable to web roles.
- Owner: `postgres`.
- Fixed `SET search_path = ''`.
- Every reference, including `auth.uid()`, `public.sessions`, and `public.participants`, is schema-qualified.
- No dynamic SQL and no caller-controlled object name.

The migration executes after every create/replace:

```sql
ALTER FUNCTION public.join_session(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.join_session(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_session(text,text)
  TO authenticated;
```

There is no EXECUTE grant to `anon` or PUBLIC. Internal `auth.uid()` and membership logic remain authoritative even though Hosts and Anonymous Auth participants share role `authenticated`.

## Domain errors

| Code | Meaning |
|---|---|
| `AUTH_REQUIRED` | No valid Supabase identity |
| `SESSION_NOT_FOUND` | Code does not resolve to a visible join target |
| `SESSION_CLOSED` | “Esta sala já foi encerrada.”; no Participant write |
| `SESSION_PAUSED` | Existing paused-room message; no Participant write |
| `SESSION_FULL` | Existing capacity reached |
| `INVALID_NAME` / `INVALID_CODE_FORMAT` | Input validation failed |
| `UNKNOWN` | Sanitized unexpected failure |

## Concurrency with `close_session`

Both functions lock the same Session row first. Join-first may commit its Participant before close; close-first makes the waiting join revalidate and return `SESSION_CLOSED` without insert or `last_seen` update. Both orders use the deterministic three-connection harness.

## Tests

- pg_proc: exact `(text,text)` signature, JSONB return, owner postgres, `prosecdef=true`, VOLATILE, PARALLEL UNSAFE, and empty search path;
- ACL: authenticated has EXECUTE; PUBLIC and anon do not;
- active new join and active idempotent recovery;
- paused and closed perform no Participant mutation;
- closed uses the approved friendly message;
- missing, invalid input, null auth, participant from another Session, and capacity cases;
- DTO contains exactly the approved fields and excludes auth/recovery data;
- close-first and join-first final-state assertions after commit.

## Offline and Realtime

Join is never queued or optimistic. A rejected closed join emits no Participant event. An active successful insert produces the existing Participant Realtime event after commit.
