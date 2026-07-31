# Data Model: Encerramento de Sessão

**Feature**: `003-close-session`  
**Date**: 2026-07-29  
**Baseline**: migrations atuais até `20260715123000_014_align_session_code_alphabet.sql`

## Existing entities and preservation

The feature changes the lifecycle rules around `public.sessions`. It does not create a replacement entity and does not delete or automatically mutate related records.

Relationships remain:

```text
auth.users 1 ─── N sessions
sessions   1 ─── N participants
sessions   1 ─── N queue
participants 1 ─ N queue
```

`participants` and `queue` rows remain stored after closure. Existing foreign keys and cascade definitions are not invoked by this feature because no session is deleted.

## Entity: `public.sessions`

### Current and target fields

| Column | Type | Nullability/default | Target invariant | Migration impact |
|---|---|---|---|---|
| `id` | `uuid` | PK, generated | Immutable session identifier and locking key | Existing |
| `code` | `char(6)` | NOT NULL, UNIQUE | Retained and never reused | Existing |
| `host_id` | `uuid` | NOT NULL, FK auth.users | Owner used only through trusted auth context | Existing |
| `status` | `text` | NOT NULL, DEFAULT `active` | Exactly `active`, `paused`, or `closed` | Existing check is audited/retained |
| `max_participants` | `smallint` | NOT NULL, DEFAULT 50 | Existing join limit | Existing |
| `max_queue_entries` | `smallint` | NOT NULL, DEFAULT 200 | Existing queue limit | Existing |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation timestamp | Existing |
| `closed_at` | `timestamptz` | NULL | Non-null exactly when status is `closed`; first value immutable | Existing column, new consistency rule |

### Status domain

```text
active ──pause──▶ paused
paused ──resume─▶ active
active ──close──▶ closed
paused ──close──▶ closed
closed ─────────▶ no transition
```

`paused` is nonterminal. Existing behavior is preserved: pause/resume remains possible for the Host, and operations that already reject paused continue to return `SESSION_PAUSED`. `closed` blocks every write regardless of frontend state.

### Check constraints

Existing status-domain check:

```sql
status IN ('active', 'paused', 'closed')
```

New cross-column consistency check named `sessions_status_closed_at_consistency`:

```sql
(status = 'closed') = (closed_at IS NOT NULL)
```

Examples:

| Status | `closed_at` | Valid? | Reason |
|---|---|---:|---|
| active | NULL | yes | Open state |
| paused | NULL | yes | Open, nonterminal state |
| closed | timestamp | yes | Closed state with authoritative time |
| closed | NULL | no | Closed requires time |
| active | timestamp | no | Open state cannot carry closure time |
| paused | timestamp | no | Paused is not closed |

### Transition trigger

The exact function contract is:

| Property | Value |
|---|---|
| Schema/name | `private.enforce_session_state_transition` |
| SQL signature | `private.enforce_session_state_transition() RETURNS trigger` |
| Arguments | none |
| Language/volatility | `LANGUAGE plpgsql VOLATILE` |
| Security/parallel | `SECURITY INVOKER PARALLEL UNSAFE` |
| Owner | `postgres` |
| Name resolution | `SET search_path = ''`; all SQL objects schema-qualified |
| Direct ACL | `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; no client GRANT |

Migration 015 first executes `CREATE SCHEMA IF NOT EXISTS private`, then creates the function and binds `sessions_enforce_state_transition` as `BEFORE UPDATE OF status, closed_at FOR EACH ROW` on `public.sessions`. The body reads only `OLD.status`, `OLD.closed_at`, `NEW.status`, and `NEW.closed_at`, raises a domain error when invalid, and returns `NEW`. It performs no table access, no dynamic SQL, no `auth.uid()` lookup, and no mutation beyond the triggering row, so SECURITY INVOKER is sufficient and avoids an unnecessary owner-privilege context.

Rules:

1. If `OLD.status = 'closed'`, require:
   - `NEW.status = 'closed'`;
   - `NEW.closed_at IS NOT DISTINCT FROM OLD.closed_at`.
2. If transitioning to `closed`, require:
   - `OLD.status IN ('active','paused')`;
   - `NEW.closed_at IS NOT NULL`.
3. If `NEW.status IN ('active','paused')`, require `NEW.closed_at IS NULL`.
4. Preserve `active ↔ paused`.
5. Return `NEW` for valid rows and raise a stable domain error for invalid transitions.

The trigger does not set the timestamp. `close_session` sets it inside the locked transaction. This keeps one authoritative clock source and prevents a direct write from being “fixed” silently. Web clients never call the trigger function directly: public controlled RPCs update `public.sessions`, and the bound trigger runs in that transaction.

### Private schema permission lifecycle

Migration 015 creates the permanent ACL atomically with the trigger, helpers, writers and `close_session`:

- schema owner `postgres`;
- PUBLIC/`anon`/`authenticated` have no CREATE;
- PUBLIC/`anon` have no USAGE;
- `authenticated` has only USAGE and EXECUTE on `private.is_session_host(uuid)`, `private.is_session_member(uuid)` and `private.is_session_open(uuid)`;
- the transition trigger function has no web EXECUTE.

`supabase/tests/003_session_closure_invariants.sql` checks permanent trigger metadata/behavior. `supabase/tests/003_session_rls_helpers.sql` checks the permanent schema/helper ACL from the post-015 gate onward. `supabase/tests/003_private_schema_post_015.sql` is preserved for historical traceability but is not executed or included in any gate because its former no-USAGE checkpoint no longer exists.
### Idempotency and timestamp

For `active|paused`:

```text
UPDATE sessions
SET status = 'closed',
    closed_at = transaction_timestamp()
WHERE id = target
```

For `closed`:

- perform no update;
- return existing `closed_at`;
- return `changed = false`;
- emit no second Realtime UPDATE.

The first timestamp can never be overwritten by repeat calls, pause/resume, direct updates, or privileged future code without disabling the trigger.

### Indexes

No new index is mandatory:

- PK `sessions(id)` supports lookup and `FOR UPDATE`;
- unique `sessions(code)` supports join and route lookup;
- `sessions_host_id_idx` supports Host access;
- partial `sessions_status_idx` supports non-closed queries;
- `participants_session_auth_user_unique(session_id, auth_user_id)` supports membership;
- existing queue indexes support session ordering and Microfone Justo.

Any additional membership index must be justified by `EXPLAIN`/profiling, not added preemptively.

## Related entity: `public.participants`

No column or data mutation is required.

Closure effects:

- no row deleted;
- no `last_seen` update caused by closure;
- `join_session` rejects `closed` before participant counting, recovery update, or insert;
- Host may read preserved participants after closure;
- participant clients cannot list participants after closure;
- membership remains usable only to authorize minimal `sessions` status visibility.

## Related entity: `public.queue`

No column or automatic status mutation is required.

Closure effects:

| Queue status | Database effect of closure |
|---|---|
| `pending` | Preserved as pending |
| `preparing` | Preserved as preparing |
| `singing` | Preserved as singing |
| `completed` | Preserved as completed |
| `cancelled` | Preserved as cancelled |

After closure:

- no insert;
- no cancel;
- no Host status transition;
- no direct update;
- participant SELECT is denied;
- Host SELECT remains authorized for preservation/future history.

## Database operation: `public.close_session`

### Signature

```text
close_session(p_session_id uuid)
```

### Sanitized return

| Field | Type | Notes |
|---|---|---|
| `session_id` | uuid | Echo of the authorized target |
| `status` | text | Always `closed` on success |
| `closed_at` | timestamptz | First authoritative timestamp |
| `changed` | boolean | True only for the first transition |

### Atomic behavior

1. Read `auth.uid()`; fail `AUTH_REQUIRED` if absent.
2. Select the row where `id = p_session_id AND host_id = auth.uid()` `FOR UPDATE`.
3. If no row, raise the common `SESSION_NOT_FOUND_OR_FORBIDDEN`.
4. If already closed, return existing DTO without update.
5. If active/paused, update status and timestamp.
6. Return sanitized DTO.
7. Never query/update participants or queue as a side effect.

### Security

- `SECURITY DEFINER` is required because clients have no direct sessions UPDATE.
- `SET search_path = ''`.
- Schema-qualified objects.
- Owner is a trusted migration role.
- Revoke execution from `PUBLIC` and `anon`.
- Grant only to `authenticated`.
- Authorization remains internal because Host and signed-in anonymous participants share `authenticated`.

## Database operation: `public.get_host_session_details`

### Signature and execution

```text
public.get_host_session_details(p_session_id uuid)
```

- `LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL UNSAFE`.
- `SET search_path = ''`; every reference is qualified.
- Owner: `postgres`, the trusted migration/table owner.
- Input is only `p_session_id`; no code or `host_id` overload exists.
- No row lock or mutation.

### Authorization and errors

1. Read identity from `auth.uid()`; null raises `AUTH_REQUIRED`.
2. Read `public.sessions` where `id = p_session_id AND host_id = auth.uid()`.
3. Null/missing id, participant, external user, and another Host all raise `SESSION_NOT_FOUND_OR_FORBIDDEN`.
4. The function does not rely on caller RLS because its internal ownership predicate is the security boundary.

### Sanitized return

| Field | Type |
|---|---|
| `id` | uuid |
| `code` | text |
| `status` | text |
| `closed_at` | timestamptz |
| `created_at` | timestamptz |
| `max_participants` | smallint |
| `max_queue_entries` | smallint |

It never returns `host_id`, an entire Session row type, authentication data, tokens, Participant, or Queue. The Host adapter validates status invariants and maps names to `HostSessionDetails`.

### ACL

- Revoke all execution from `PUBLIC`, `anon`, and `authenticated` after creation/replacement.
- Grant EXECUTE only to `authenticated`.
- Participant Anonymous Auth callers share `authenticated` but fail ownership internally.
- Catalog tests assert exact signature, owner, definer, STABLE, empty search path, output columns, and ACL.

## Common locking model

Every session-dependent writer locks the parent session first:

```text
Session → Participant/Queue
```

| Operation | First lock | Second lock/work | Closed check occurs |
|---|---|---|---|
| close_session | owned Session | none | after lock |
| join_session | Session by code | participant count/row | after lock, before mutation |
| create_queue_entry | Session by id | participant/active queue/insert | after lock, before mutation |
| cancel_queue_entry | Session derived from queue id | Queue row | after Session lock |
| update_queue_status | Session derived from queue id | Queue row | after Session lock |
| pause/resume | owned Session | none | after lock |

Queue-id operations may read immutable `session_id` before locking, but must re-fetch the queue row after the Session lock and assert it still belongs to that session.

### Deterministic lock verification

Concurrency tests use independent PostgreSQL transactions `txA` and `txB` plus an observer. Each actor sets transaction-local authenticated JWT claims so `auth.uid()` matches the fixture. The first RPC returns while its transaction stays open and retains the Session lock; the second RPC starts and must appear in `pg_blocking_pids` before the first transaction is committed. Final assertions occur after both commit/rollback outcomes.

Every pair uses a fresh Session and runs close-first and writer-first. The harness covers close×close, join, create, cancel, pause, resume, and queue-status. It uses bounded `lock_timeout`/`statement_timeout` and `try/finally` rollback, never arbitrary delay as the ordering mechanism. Separately, the idempotency sample performs one close plus nineteen sequential retries on the same fixture; the three-client harness remains limited to paired races.

## RLS helpers

From migration 015 onward, `private` is owned by `postgres` and absent from exposed schemas. PUBLIC, `anon`, and `authenticated` have no CREATE; only `authenticated` receives the minimum USAGE needed by the final policies. This state is created in the same transaction as all writers and `close_session`.

### Exact function metadata

| Helper | Body access | Metadata |
|---|---|---|
| `private.is_session_host(p_session_id uuid) RETURNS boolean` | `public.sessions(id,host_id)` | SQL, STABLE, SECURITY DEFINER, PARALLEL UNSAFE, owner postgres, `search_path=''` |
| `private.is_session_member(p_session_id uuid) RETURNS boolean` | `public.participants(session_id,auth_user_id)` | SQL, STABLE, SECURITY DEFINER, PARALLEL UNSAFE, owner postgres, `search_path=''` |
| `private.is_session_open(p_session_id uuid) RETURNS boolean` | Session status/owner and participant membership | SQL, STABLE, SECURITY DEFINER, PARALLEL UNSAFE, owner postgres, `search_path=''` |

No additional private helper is required for this feature.

All are non-STRICT and non-LEAKPROOF, use no dynamic SQL, and qualify `auth.uid()`, `public.sessions`, and `public.participants`. They return false for null JWT, null argument, nonexistent or unrelated Session.

`is_session_open` is authorized internally: it returns true only for active/paused and when `auth.uid()` owns or participates in the Session. It cannot reveal the state of an unrelated UUID. `is_session_member` deliberately ignores status so an existing member remains authorized to read the minimal NEW closed Session row for Realtime.

SECURITY DEFINER is necessary to break policy recursion: Session policies can inspect membership without re-entering Participant RLS, and Participant/Queue policies can inspect Session state without re-entering Session RLS. The trusted owner bypasses ordinary RLS; `FORCE ROW LEVEL SECURITY` must remain disabled unless this design is revisited.

### Helper ACL and verification

- `ALTER FUNCTION ... OWNER TO postgres` after every create/replace.
- Revoke EXECUTE from PUBLIC and `anon`; grant only `authenticated`.
- Revoke all schema privileges first, then grant only USAGE on `private` to `authenticated`; never CREATE.
- The schema must remain absent from `[api].schemas` and `extra_search_path` in `supabase/config.toml`.
- `service_role` receives no helper grant.
- `pg_proc` tests assert `prosecdef`, `provolatile='s'`, `proparallel='u'`, owner, return boolean, non-leakproof, exact UUID arguments, and empty search path.
- ACL tests assert no PUBLIC/anon execution, no client CREATE, authenticated EXECUTE only on the three helpers, and no web EXECUTE on `private.enforce_session_state_transition()`.
- Matrix tests cover Host/member/external/null across active, paused, closed, missing, null, and cross-session ids and prove no recursive-policy error.

## RLS and grants

### Exact baseline and final policy set

Baseline policies are:

| Table | Existing policy | Cutover |
|---|---|---|
| sessions | `sessions_select_public` | DROP; replaced by `sessions_select_open` |
| sessions | `sessions_update_own` | DROP; no direct UPDATE replacement |
| participants | `participants_select_session` | DROP; replaced by `participants_select_authorized_open_or_host` |
| queue | `"Users can read active queue of their session"` | DROP; replaced by `queue_select_authorized_open_or_host` |
| queue | `"Host can update queue"` | DROP; replaced by controlled RPC |
| queue | `"Block direct inserts on queue"` | Preserve |
| queue | `"Block direct deletes on queue"` | Preserve |

Permissive policies combine by OR. Migration 016 must execute `DROP POLICY IF EXISTS` for `sessions_select_public`, `sessions_update_own`, `participants_select_session`, `"Users can read active queue of their session"`, and `"Host can update queue"` on their qualified tables before any CREATE POLICY. Final `pg_policies` must contain exactly the four new read policies plus the two preserved Queue deny policies, with no residual permissive policy, `USING(true)`, or `WITH CHECK(true)`.

### Explicit grant cutover on `public.sessions`

The existing table-level grant is removed before any column grant:

```sql
REVOKE SELECT ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, code, status, closed_at)
ON TABLE public.sessions
TO anon, authenticated;
```

RLS controls rows; these ACLs control columns. Direct SELECT of `host_id`, `created_at`, `max_participants`, `max_queue_entries`, `SELECT *`, or future columns fails for both participant and Host roles. The Host obtains the approved full DTO only through `public.get_host_session_details(uuid)`.

Tests assert zero table-level SELECT entries in `information_schema.table_privileges`, the exact four-column set in `information_schema.column_privileges`, false `has_table_privilege`, positive/negative `has_column_privilege`, and real SELECT attempts. The same cutover revokes SELECT/INSERT/UPDATE/DELETE on `public.participants` and `public.queue` from PUBLIC, `anon`, and `authenticated`, then grants only table SELECT to `authenticated`; all mutations remain RPC-only.

### `public.sessions` SELECT policies

#### `sessions_select_open`

- Roles: `anon`, `authenticated`.
- Command: SELECT.
- USING: `status IN ('active','paused')`.
- WITH CHECK: not applicable.
- Purpose: preserve existing minimal room-code lookup without granting helpers to unauthenticated `anon`.

#### `sessions_select_owned_or_member`

- Role: `authenticated`.
- Command: SELECT.
- USING: `private.is_session_host(id) OR private.is_session_member(id)`.
- WITH CHECK: not applicable.
- Purpose: owner/member minimal visibility including closed and Realtime authorization on the NEW closed row.

Both policies are permissive and combine with OR. The legacy `sessions_select_public` policy is dropped rather than supplemented.

Positive tests: external open lookup, Host closed minimal read, linked participant closed minimal read, Host/member Realtime closed event. Negative tests: `anon` closed, unrelated authenticated closed, cross-session member, sensitive-column SELECT, and external Realtime subscription.

### `public.sessions` UPDATE and DELETE

- Drop `sessions_update_own`.
- Revoke INSERT/UPDATE/DELETE and other legacy client write privileges from PUBLIC, `anon`, and `authenticated`.
- Create no UPDATE or DELETE policy.
- Controlled RPCs are the only mutation path; direct re-open or timestamp mutation fails.

### `public.participants`

#### `participants_select_authorized_open_or_host`

- Role: `authenticated`.
- Command: SELECT.
- USING: `private.is_session_host(session_id) OR private.is_session_open(session_id)`.
- WITH CHECK: not applicable.

Host reads preserved rows after closed. A linked participant reads only while active/paused. External and cross-session callers never read. Direct INSERT/UPDATE/DELETE remains absent/blocked; join uses its RPC.

### `public.queue`

#### `queue_select_authorized_open_or_host`

- Role: `authenticated`.
- Command: SELECT.
- USING: `private.is_session_host(session_id) OR private.is_session_open(session_id)`.
- WITH CHECK: not applicable.

Revoke direct UPDATE from `authenticated`, drop the legacy Host UPDATE policy, and keep direct INSERT/DELETE blocked. Create, cancel, and Host status changes use controlled RPCs.

### Realtime interaction

Host normal Auth and participant Anonymous Auth both arrive with role `authenticated` and an `auth.uid()` derived from the JWT. After active/paused→closed, `sessions_select_open` stops matching, but `sessions_select_owned_or_member` remains true for the owner/member NEW row. An external JWT fails both branches. The subscription requests only `id,status,closed_at`, all covered by column grants; its `id=eq.<sessionId>` filter never substitutes for RLS.

## Read projections

### Minimal session status

Used by participant initial load, shared resync, and Realtime:

```text
id, code, status, closed_at
```

It never includes `host_id`, limits, or unrelated session configuration.

### Host details

`public.get_host_session_details(p_session_id uuid)` returns only `id,code,status,closed_at,created_at,max_participants,max_queue_entries` after verifying `auth.uid() = sessions.host_id`. No overload by code exists. It is separate because row-level policy cannot grant different columns to Host and participant when both use the same database role.

## Realtime representation

Published table: `public.sessions`.

Event payload consumed:

| Field | Validation |
|---|---|
| `id` | UUID and equals current session |
| `status` | active, paused, or closed |
| `closed_at` | null for open states; valid timestamp for closed |

The subscription requests only those columns. The primary key is present, so default replica identity is sufficient for UPDATE delivery; old-row contents are not required.

## Compatibility with current records

- Existing active/paused rows with NULL `closed_at` are valid.
- Existing closed rows with a timestamp are valid.
- Existing inconsistent rows block constraint validation.
- No participant or queue migration/backfill occurs.
- Room codes remain unique and retained.
- Existing status/index definitions are audited instead of recreated.
- Post-015 TypeScript types are regenerated from the local database immediately after the atomic writer cutover. They contain `get_host_session_details`, `join_session`, `create_queue_entry`, `cancel_queue_entry`, `update_queue_status`, `update_session_status`, and `close_session` with exact returns.
- Final TypeScript types are regenerated immediately after migration 016. They reconfirm all functions and final `sessions.status`/`closed_at` after RLS/grants/publication. The typed Realtime test is created/compiled only after this generation.
- Both generations target `src/infrastructure/supabase/database.types.ts`, retain the `Database` generic, and forbid `any`, broad casts, or manual edits.

## Valid end-to-end examples

### First close

```text
Before: status=paused, closed_at=NULL
After:  status=closed, closed_at=T1
Result: changed=true
```

### Retry

```text
Before: status=closed, closed_at=T1
After:  unchanged
Result: changed=false, closed_at=T1
```

### Concurrent song creation

```text
create locks first → queue insert commits → close commits → inserted row preserved
close locks first  → close commits → create wakes, sees closed, inserts nothing
```

## Invalid examples

- `closed → active`.
- `closed → paused`.
- `closed_at T1 → T2`.
- clear `closed_at` while closed.
- set `closed_at` while active/paused.
- direct client UPDATE of sessions or queue.
- create/cancel/update queue after the close transaction committed.
- participant reading queue/participants after closed.
