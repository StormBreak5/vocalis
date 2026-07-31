# Contract Change: Create Queue Entry

**Application operation**: `createQueueEntryAction`  
**Definitive database operation**: `public.create_queue_entry(p_session_id uuid, p_song_title varchar, p_artist varchar)`

## Exact SQL contract

```sql
public.create_queue_entry(
  p_session_id uuid,
  p_song_title varchar,
  p_artist varchar
)
RETURNS TABLE (
  id uuid,
  session_id uuid,
  participant_id uuid,
  song_title varchar,
  artist varchar,
  status varchar,
  position integer,
  created_at timestamptz,
  updated_at timestamptz
)
```

The explicit nine-column result preserves the existing QueueEntry consumer without returning `public.queue` as an expanding whole-row type.

## Input and identity

- `p_session_id`: target Session UUID.
- `p_song_title` and `p_artist`: trimmed, non-empty, maximum 100 characters.
- Identity comes only from qualified `auth.uid()`.
- The caller must be a linked `public.participants` row for the locked Session whose `auth_user_id` equals the JWT identity. A Host may request a song only through its own linked Participant row; ownership alone is not a substitute for `participant_id`.
- The client never supplies Participant or Host identity as authorization evidence.

## Locking, authorization, and status

Global order is Session → Participant/Queue:

1. validate auth, UUID, title, and artist;
2. select and lock `public.sessions` by `p_session_id FOR UPDATE` before resolving the Participant or inspecting Queue rows;
3. missing Session returns `SESSION_NOT_FOUND`;
4. `closed` returns `SESSION_CLOSED` before every Participant/Queue lookup or mutation;
5. `paused` preserves `SESSION_PAUSED` and inserts nothing;
6. in `active`, resolve the caller's Participant, enforce capacity and the Microfone Justo partial unique index, calculate the next position under the Session lock, insert one pending row, and return the sanitized DTO.

The partial unique index remains the final anti-spam authority. The explicit precheck exists only for a friendlier error.

## Security mode and privileges

- `LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE`.
- SECURITY DEFINER is required because direct Queue INSERT is revoked.
- Owner: `postgres`.
- Fixed `SET search_path = ''` and fully qualified `auth.uid()`, `public.sessions`, `public.participants`, and `public.queue`.
- No dynamic SQL.

```sql
ALTER FUNCTION public.create_queue_entry(uuid,varchar,varchar) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_queue_entry(uuid,varchar,varchar)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_queue_entry(uuid,varchar,varchar)
  TO authenticated;
```

Supabase Anonymous Auth callers execute as `authenticated`; the unauthenticated database role `anon` has no EXECUTE.

## Domain errors

| Code | Meaning |
|---|---|
| `AUTH_REQUIRED` | Missing authenticated JWT |
| `SESSION_NOT_FOUND` | Session does not exist |
| `SESSION_CLOSED` | “Esta sala já foi encerrada.”; no Queue insert |
| `SESSION_PAUSED` | Existing paused behavior; no Queue insert |
| `PARTICIPANT_NOT_FOUND_OR_FORBIDDEN` | Caller is not a linked Participant |
| `ACTIVE_SONG_EXISTS` | Microfone Justo violation |
| `SESSION_QUEUE_FULL` | Existing queue limit reached |
| `VALIDATION_ERROR` | Invalid title/artist/UUID |
| `UNKNOWN` | Sanitized unexpected failure |

## Realtime, idempotency, and concurrency

A successful insert emits one Queue INSERT after commit. Rejected operations emit nothing. The operation is not retry-idempotent by request id; response uncertainty must resync before retry, while the Microfone Justo index prevents a second active request.

Close-first makes the waiting create revalidate `closed` and insert nothing. Create-first preserves the committed row and close follows. Both orders use Session-first locks and the deterministic three-connection harness.

## Tests

- pg_proc exact signature/return columns, owner, SECURITY DEFINER, VOLATILE, PARALLEL UNSAFE, and `search_path=''`;
- ACL authenticated-only; PUBLIC/anon negative calls;
- active success and exact DTO;
- paused, closed, missing Session, missing/cross-session Participant, invalid input, queue limit, and null auth;
- Microfone Justo and deterministic position remain valid;
- no Queue row/event after closed;
- close-first/create-first final assertions and no deadlock;
- direct Queue INSERT remains blocked.

## Offline

No offline queue or optimistic insert. `writesAllowed=false` prevents invocation while Session state is unconfirmed.
