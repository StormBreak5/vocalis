# Research & Technical Decisions: Session Closure

**Feature**: `003-close-session`
**Date**: 2026-07-29
**Scope**: Technical decisions required to plan permanent session closure. No implementation is included.

## R1. Existing schema is the migration baseline

**Decision**: Treat `public.sessions.status` and `public.sessions.closed_at` as existing production schema, not as new columns to recreate.

**Rationale**: Migration `20260714173446_001_initial_schema.sql` already defines:

- `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed'))`;
- `closed_at timestamptz NULL`;
- indexes on `host_id` and non-closed sessions.

The missing pieces are the cross-column consistency constraint, irreversible-transition trigger, safe closure RPC, RLS changes, Realtime publication, and updates to existing writers. Repeating the original DDL would make migrations fragile.

**Deployment rule**: Run a preflight assertion before adding the new constraint. If legacy rows violate `status = 'closed' ⇔ closed_at IS NOT NULL`, stop deployment and apply an explicit corrective migration using authoritative data. Do not invent a historical closure time automatically.

**Alternatives considered**:

- Add the column and status again with `IF NOT EXISTS`: rejected because it hides schema drift.
- Backfill an unknown closure time with `created_at` or migration time: rejected because neither represents the first closure time.

## R2. State integrity uses RPC + trigger + check constraint

**Decision**: Use three complementary controls:

1. `close_session` owns authorization, row locking, idempotency, and the authoritative timestamp.
2. A `BEFORE UPDATE OF status, closed_at` trigger rejects invalid transitions and mutation of the first `closed_at`.
3. A check constraint enforces `(status = 'closed') = (closed_at IS NOT NULL)`.

**Rationale**: A check constraint cannot compare old and new rows, while RLS and RPC permissions do not protect against every privileged or future write path. The trigger is necessary to make `closed` terminal at the database boundary. It must preserve the existing `active ↔ paused` behavior.

**Trigger behavior**:

- Allow `active → paused`, `paused → active`, `active → closed`, and `paused → closed`.
- Require a non-null `closed_at` on a transition to `closed`.
- Reject `closed → active`, `closed → paused`, clearing `closed_at`, or changing an existing `closed_at`.
- Reject `closed_at` on non-closed rows.
- Do not silently choose the closure time; `close_session` sets it.

**Alternatives considered**:

- RPC and RLS only: rejected because future privileged writes could reverse the state.
- Trigger only: rejected because authorization and idempotent DTO behavior belong in the controlled operation.

## R3. Common parent-row locking serializes all writes

**Decision**: Every operation whose validity depends on the session state acquires `SELECT ... FOR UPDATE` on the same `public.sessions` row before locking or mutating participant/queue rows.

**Global lock order**:

1. `sessions`;
2. `participants` or `queue`, only when required;
3. deterministic row order when more than one child row is ever needed.

**Rationale**: The session row is the natural concurrency boundary. PostgreSQL recommends consistent lock ordering to reduce deadlocks. `FOR UPDATE` holds the row until transaction end, so a waiting writer rechecks the committed state before writing.

**Race outcomes**:

- Two `close_session` calls: the first closes; the second observes `closed` and returns the original DTO without `UPDATE`.
- `close_session` wins: waiting join/create/cancel/status update observes `closed` and returns `SESSION_CLOSED`.
- Another writer wins: its transaction commits first; closure then succeeds. The earlier write remains preserved.
- Lost closure response: retry returns the same `closed_at`.

**Special handling for queue-id operations**: Read immutable `queue.session_id` without locking, lock the parent session, then re-read and lock the queue row while asserting the same `session_id`. Never lock queue first and session second.

**Alternatives considered**:

- Advisory locks: rejected as less transparent and dependent on every caller hashing keys consistently.
- Optimistic frontend ordering: rejected because it cannot protect database consistency.

Official references:

- https://www.postgresql.org/docs/current/explicit-locking.html
- https://www.postgresql.org/docs/current/sql-select.html

## R4. `close_session` is a narrowly privileged function

**Decision**: Implement `public.close_session(p_session_id uuid)` as `SECURITY DEFINER` because clients will not have direct `UPDATE` rights on `sessions`.

**Security controls**:

- Read identity only from `auth.uid()`.
- Select and lock with `WHERE id = p_session_id AND host_id = auth.uid()` so nonexistent and non-owned sessions are indistinguishable and unauthorized callers do not lock another Host's row.
- Use `SET search_path = ''` and schema-qualify every relation and function.
- Return only `session_id`, `status`, `closed_at`, and `changed`.
- Revoke `EXECUTE` from `PUBLIC` and `anon`; grant only to `authenticated`.
- Create the function and privileges in the same transaction.
- Validate ownership internally even though execution is granted to the shared `authenticated` role.

Supabase anonymous users also use the `authenticated` database role. The grant therefore does not distinguish Host from participant; the ownership test does.

**Alternatives considered**:

- `SECURITY INVOKER`: rejected because it would require direct table update privileges.
- Accepting room code or client-provided `host_id`: rejected due ambiguity and authorization risk.

Official references:

- https://www.postgresql.org/docs/current/sql-createfunction.html
- https://supabase.com/docs/guides/database/functions

## R5. Minimal session visibility requires grants, RLS, and sanitized reads

**Decision**:

- Direct client reads of `sessions` receive only `id`, `code`, `status`, and `closed_at`.
- RLS permits active/paused lookup for the existing room-entry flow.
- A closed row is visible only to its Host or an already linked participant.
- Full Host session details are returned through a separate ownership-checking server/RPC contract.
- Participant and queue rows stop being readable to participants after closure; the Host retains read access.

**Rationale**: RLS restricts rows, not columns. A `.select()` projection in application code alone is not a security boundary. Column-level grants minimize REST and Realtime exposure, while a sanitized privileged query preserves the clarified Host access.

**Recursion avoidance**: Existing and proposed policies cross-reference `sessions` and `participants`. Use small, fixed-search-path membership/ownership helpers in a non-exposed schema, with narrowly granted execution, so RLS evaluation does not recurse.

**Policy principle**: Knowing a UUID or code is never sufficient for reading a closed session.

**Alternatives considered**:

- Keep table-level `SELECT *`: rejected because it exposes `host_id` and configuration fields to participants.
- Use the Realtime filter as authorization: rejected because filters only reduce events.
- Make closed sessions public: rejected by the clarified isolation requirement.

Official references:

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html

## R6. Realtime uses filtered Postgres Changes

**Decision**: Subscribe to `public.sessions`, `UPDATE`, filter `id=eq.<sessionId>`, with selected columns `id`, `status`, and `closed_at`.

**Repository compatibility**: Installed `@supabase/realtime-js` types expose `select?: string[]` for Postgres Changes filters. This supports payload minimization without changing the chosen transport.

**Subscription rules**:

- Set the current Supabase JWT before connection.
- Register every `.on()` callback before one `.subscribe()`.
- Create a new channel for each lifecycle mount/session; do not add listeners to an already subscribed channel.
- Use a unique topic suffix to avoid channel reuse during Strict Mode cleanup.
- Validate payload shape and session id at runtime.
- Remove the exact channel during cleanup.
- Include `sessions` in `supabase_realtime` idempotently.

**Why Postgres Changes**: It matches the explicit feature requirement and existing queue architecture. Broadcast is more scalable but would broaden scope and replace the required table subscription.

Official references:

- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/reference/javascript/setauth
- https://supabase.com/docs/reference/javascript/removechannel

## R7. Realtime is a signal, not the source of truth

**Decision**: Initial load and every reconnection path perform a point-in-time status read. Postgres Changes only prompts immediate state convergence.

**Resynchronization triggers**:

- initial Server Component load;
- first `SUBSCRIBED`;
- `SUBSCRIBED` after a connection interruption;
- browser `online`;
- `visibilitychange` to visible or `pageshow` after suspension;
- auth `TOKEN_REFRESHED`;
- uncertain result after `close_session`;
- invalid Realtime payload.

`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`, offline, and uncertain mutation responses place the client in a non-confirmed state where all writes stay blocked. No timer or polling loop is introduced.

**Rationale**: Postgres Changes does not guarantee replay of events missed while disconnected. A socket being subscribed does not prove that no state transition was missed.

Official references:

- https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- https://supabase.com/docs/guides/realtime/protocol
- https://react.dev/reference/react/useEffect
- https://react.dev/reference/react/StrictMode

## R8. Shared lifecycle controller prevents duplicated client rules

**Decision**: Add one `SessionLifecycleProvider`/`useSessionLifecycle` controller shared by Host and participant routes.

It owns:

- confirmed session status and `closedAt`;
- connection/synchronization state;
- Realtime channel lifecycle;
- `writesAllowed`;
- a mutation epoch used to suppress stale success responses;
- final cleanup and navigation.

Server Components remain responsible for initial authorized reads and pass a sanitized snapshot into the Client Component boundary. Visual components consume capabilities; they do not authorize or decide state transitions.

**Alternatives considered**:

- Separate Host and participant hooks: rejected due duplicated race/offline/Realtime logic.
- Convert whole pages to Client Components: rejected by the constitution.

## R9. Preserve anonymous and Host authentication on exit

**Decision**: “Voltar para o início” removes only room-scoped state:

- session/queue/participant React state;
- any room snapshot;
- all channels for that room;
- room-specific identifiers if introduced.

It does not call `signOut`, clear Supabase cookies, erase another room, or clear global preferences. Use replacement navigation so the closed route is not the immediate history destination.

**Rationale**: Supabase anonymous identity is the participant's stable JWT-backed identity and can be shared by another tab. Ending it would violate the clarified decision and could disrupt another room.

## R10. AlertDialog is controlled and non-dismissible

**Decision**: Use the shadcn/ui AlertDialog primitive for both confirmation and final closure UI.

For the final dialog:

- controlled `open={isClosed}`;
- no Cancel, Close, or “X” control;
- ignore attempts to set `open=false`;
- prevent Escape and outside interaction;
- explicitly focus the sole “Voltar para o início” button;
- use a regular Button if the primitive Action would close before cleanup/navigation;
- keep the modal above all loading states.

The Host confirmation remains a normal destructive AlertDialog with Cancel and Confirm.

Official references:

- https://www.radix-ui.com/primitives/docs/components/alert-dialog
- https://www.radix-ui.com/primitives/docs/overview/accessibility

## R11. Offline snapshots never authorize writes

**Decision**:

- Keep active room snapshots in memory only.
- Explicitly exclude authenticated room navigations/RSC payloads and Server Actions from persistent service-worker caching.
- Never store JWTs or auth responses in the service-worker cache.
- Offline mode may display the last in-memory queue behind the offline banner, but lifecycle state becomes unconfirmed and all writes are disabled.
- Closure is never queued offline or shown optimistically.

**Rationale**: The current service worker already excludes Server Actions but can network-first cache other same-origin successful GET responses. Explicit room-route exclusion prevents a stale active page from being treated as authoritative after closure.

## R12. One atomic write cutover followed by final read/Realtime cutover

**Decision**: use exactly two sequential, transactional migrations:

1. `20260729100000_015_session_closure_atomic.sql` uses explicit `BEGIN`/`COMMIT` and introduces in one visible commit: `private`; trigger/constraint; helpers; lock-safe join/create/cancel; `update_queue_status`; `update_session_status`; `get_host_session_details`; `close_session`; exact function ACLs; and revocation of incompatible direct INSERT/UPDATE/DELETE.
2. Its post-015 gate executes invariants, helper ACL/no-recursion, every writer contract, close authorization/idempotency, deterministic races, and `supabase/tests/003_session_privileges.sql`. Migration 016 cannot be created or applied until this gate passes.
3. `20260729101000_016_session_closure_rls_realtime.sql` uses explicit `BEGIN`/`COMMIT` and performs only the final policy catalog cutover, read-grant contraction, idempotent Session publication, and schema reload.
4. Its post-016 gate executes final RLS/grants/publication/Realtime and the complete isolation matrix.

No maintenance mode or write freeze is used. The feature is not yet published; a legacy client failing closed after 015 is acceptable, while any commit that permits a writer after `closed` is not. If 015 fails, PostgreSQL rolls back every statement. If 016 fails, the safe post-015 writer state remains committed and only the read/Realtime cutover rolls back.

**Rationale**: constraints alone do not protect writers, and splitting writers from `close_session` creates a database-visible unsafe state. The single write-boundary commit is simpler than coordinating an unpublished client rollout and satisfies database-enforced integrity at every applied checkpoint.

Rollback remains forward-only after commit: stop at the failing gate and ship a corrective migration. Never reopen, clear `closed_at`, restore unsafe DML or delete preserved rows.
## R13. Existing defects are corrected only where required

**Decision**: The plan corrects these feature-blocking baseline issues:

- `join_session` and `create_queue_entry` compare against nonexistent `ended` instead of `closed`;
- `cancel_queue_entry` locks queue before session and ignores session state;
- Host queue status updates and pause/resume use direct table updates;
- `getSessionByCode` discards closed rows;
- `sessions` is absent from the Realtime publication;
- current RLS hides `closed` from legitimate clients and allows broader reads elsewhere;
- `SESSION_CLOSED` messages are inconsistent.

Unrelated legacy cleanup, including the stale `join_session_result` type and obsolete `recover_participant` function/type entries, is documented as risk but not included unless type regeneration cannot complete.

## R14. RLS helpers are private, stable security-definer predicates

**Decision**: Create the non-exposed schema `private` with owner `postgres` and three exact predicates:

| Signature | Language / volatility | Security | Return |
|---|---|---|---|
| `private.is_session_host(p_session_id uuid)` | `LANGUAGE sql STABLE PARALLEL UNSAFE` | `SECURITY DEFINER SET search_path = ''` | `boolean` |
| `private.is_session_member(p_session_id uuid)` | `LANGUAGE sql STABLE PARALLEL UNSAFE` | `SECURITY DEFINER SET search_path = ''` | `boolean` |
| `private.is_session_open(p_session_id uuid)` | `LANGUAGE sql STABLE PARALLEL UNSAFE` | `SECURITY DEFINER SET search_path = ''` | `boolean` |

No additional private helper is required; adding one would require a new documented signature, ACL and test matrix.

All three functions are non-`STRICT`, non-`LEAKPROOF`, contain no dynamic SQL, fully qualify `auth.uid()`, `public.sessions`, and `public.participants`, and return `false` when `auth.uid()` or `p_session_id` is null.

- `is_session_host` reads only `sessions.id` and `sessions.host_id` and is true only when the current `auth.uid()` owns the argument Session.
- `is_session_member` reads only `participants.session_id` and `participants.auth_user_id` and remains true for an existing member after closure.
- `is_session_open` reads only Session status/ownership and participant membership. It returns true only when the Session is `active|paused` **and** the current `auth.uid()` is its Host or a linked participant. It therefore cannot be used as an oracle for an unrelated Session.

The functions are owned explicitly by the trusted migration role `postgres`, never by `anon`, `authenticated`, `authenticator`, or another web-controlled role. The migration repeats `ALTER FUNCTION ... OWNER TO postgres` and ACL changes after every `CREATE OR REPLACE`, because existing ACLs can survive replacement.

**Why `SECURITY DEFINER`**: `sessions` policies need membership from `participants`, while `participants` and `queue` policies need ownership/open state from `sessions`. An invoker helper would evaluate the consulted table's RLS again and recreate the `sessions ↔ participants` recursion. A table-owner definer reads the minimum qualified columns without re-entering those policies. `FORCE ROW LEVEL SECURITY` is not enabled; introducing it later requires an explicit redesign because it invalidates this bypass assumption.

**Schema and ACL**:

- `private` stays outside `supabase/config.toml [api].schemas` and `extra_search_path`, so the Data API cannot expose the helpers as RPCs.
- Revoke all schema privileges from `PUBLIC`, `anon`, and `authenticated`, then grant only `USAGE` to `authenticated`; never grant `CREATE`.
- Revoke function execution from `PUBLIC` and `anon`; grant only `authenticated`.
- Supabase Anonymous Auth users carry the `authenticated` database role, so linked participants still evaluate the policies.
- `service_role` needs no grant because it bypasses RLS and is never a client identity.

**Policy shape**: Separate open lookup from protected closed visibility so unauthenticated `anon` never needs helper execution:

1. `sessions_select_open` — `TO anon, authenticated`, `USING (status IN ('active','paused'))`.
2. `sessions_select_owned_or_member` — `TO authenticated`, `USING (private.is_session_host(id) OR private.is_session_member(id))`.
3. `participants_select_authorized_open_or_host` and `queue_select_authorized_open_or_host` — `TO authenticated`, `USING (private.is_session_host(session_id) OR private.is_session_open(session_id))`.

PostgreSQL combines the two permissive Session SELECT policies with OR. Membership deliberately remains independent of Session status, so the NEW `closed` row is still visible to an existing participant and the Realtime UPDATE is not suppressed. The open predicate is authorized internally and becomes false after closure, which blocks participant/queue reads while the Host predicate continues to allow preserved data.

**Verification**:

- Inspect `pg_proc`/`pg_namespace`: exact `(uuid)` signatures, `prosecdef=true`, `provolatile='s'`, `proparallel='u'`, `proleakproof=false`, return `boolean`, owner `postgres`, and empty fixed search path in `proconfig`.
- Inspect schema/function ACLs: no PUBLIC/anon USAGE or EXECUTE; authenticated has USAGE and only the three EXECUTEs; no client has CREATE.
- Test null JWT, null argument, missing Session, another Host, another participant, and cross-session UUIDs all return false.
- Test Host/member/external across active, paused, and closed rows without `infinite recursion detected in policy`.
- Test that `private` is absent from exposed API schemas and a `/rest/v1/rpc/is_session_*` call is unavailable.
- Test Realtime with Host/member/external JWTs: Host and member receive the closed UPDATE; external does not.

**Alternatives considered**:

- `SECURITY INVOKER`: rejected because it re-enters RLS and can recurse.
- One combined Session policy granted to `anon`: rejected because the optimizer does not guarantee OR short-circuiting and would require excessive helper grants to `anon`.
- A new BYPASSRLS role: rejected as unnecessary complexity when the trusted table/migration owner is sufficient.

Official references:

- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/troubleshooting/do-i-need-to-expose-security-definer-functions-in-row-level-security-policies-iI0uOw
- https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- https://www.postgresql.org/docs/current/sql-createfunction.html

## R15. Host full details use one ownership-checking RPC

**Decision**: The only full-read operation is `public.get_host_session_details(p_session_id uuid)`. It accepts no room code, `host_id`, participant id, or authorization claims. The server resolves the minimal Session id first and calls this RPC only with that UUID.

The operation is `LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL UNSAFE SET search_path = ''`, owned by `postgres`, and performs one qualified read from `public.sessions` where `id = p_session_id AND host_id = auth.uid()`. It does not lock or mutate. `AUTH_REQUIRED` is returned when `auth.uid()` is null. Null/missing UUID, another Host, participant, or any non-owned row returns the same `SESSION_NOT_FOUND_OR_FORBIDDEN`.

Sanitized `RETURNS TABLE` fields are exactly `id uuid`, `code text`, `status text`, `closed_at timestamptz`, `created_at timestamptz`, `max_participants smallint`, and `max_queue_entries smallint`. It never returns `host_id`, `auth.users` data, JWTs, tokens, configuration added in the future, or `RETURNS public.sessions`. The application adapter validates status/`closed_at` and maps the row to `HostSessionDetails`.

ACL is recreated in the same transaction: revoke all execution from `PUBLIC`, `anon`, and `authenticated`, then grant EXECUTE only to `authenticated`. Anonymous participants can reach the shared database role but fail the internal ownership predicate; `anon` cannot execute at all.

**Rationale**: Column-level grants intentionally prevent every client, including the Host, from direct SELECT of full Session fields. A narrowly scoped definer RPC preserves the clarified full Host read without weakening participant grants.

**Tests**: owned active/paused/closed succeeds; missing, null, participant, anonymous-without-owner, and other Host fail; errors do not reveal existence; output set is exact; `pg_proc` proves signature, owner, STABLE, definer, and empty search path; ACL proves authenticated-only execution; no overload accepting code exists.

**Alternative considered**: Direct table SELECT for the Host was rejected because Host and participant JWTs both use `authenticated`, and a broad table grant would expose sensitive columns whenever RLS permits a row.

## R16. Session grants use explicit revoke-then-grant cutover

**Decision**: writer DML and read grants are split by responsibility without creating an unsafe write state. Migration 015 revokes incompatible direct INSERT/UPDATE/DELETE and drops or neutralizes direct write authorization in the same transaction that creates hardened writers and `close_session`. Migration 016 removes the legacy table-level SELECT before granting columns:

```sql
REVOKE SELECT ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, code, status, closed_at)
ON TABLE public.sessions
TO anon, authenticated;
```

RLS decides rows; column ACLs decide fields. Host and participant direct reads are limited to four columns; the Host obtains other approved fields only through `get_host_session_details`, already present and typed after 015. No broad grant is retained as fallback.

`003_session_privileges.sql` runs immediately after 015 and proves direct INSERT/UPDATE/DELETE, direct close/reopen, timestamp removal/overwrite, participant close and other-Host close all fail while authorized RPCs succeed. A failure blocks 016.

Final tests inspect table/column privileges, negative SELECTs, Host RPC ownership and Realtime `select: ['id','status','closed_at']`.
## R17. Concurrency tests use one process-scoped local PostgreSQL bootstrap

**Decision**: approve `pg` and `@types/pg`; use `src/infrastructure/__tests__/supabase/postgres-race-harness.ts` with three persistent `pg.Client` connections (`txA`, `txB`, `observer`). Supabase JS/PostgREST cannot retain transaction locks after an RPC response.

The sole entry point is `scripts/test-db-race-local.ps1`, invoked by `npm run test:db:race`. In that one PowerShell process it captures `npx --no-install supabase status -o env` in memory, extracts only `DB_URL` through a strict parser, validates `NODE_ENV`, loopback host, configured local port and absence of TLS/remote endpoint, assigns `SUPABASE_TEST_DB_URL` only to the child Vitest environment, waits for Vitest, and removes the variable in `finally`. It neither depends on a variable created by a prior task nor persists/prints credentials. Missing local Supabase fails immediately; no remote override exists.

Each race uses fresh fixtures, bounded timeouts, explicit transactions/JWT claims, an observed `pg_blocking_pids` barrier, post-commit assertions and `try/finally` rollback/cleanup/`Client.end()`. Both commit orders cover close × close/join/create/cancel/pause/resume/update-queue. Separately, one close plus nineteen sequential retries proves one timestamp and exactly one `changed=true`.

**Alternatives rejected**: cross-task environment mutation, manual copy/paste of DB URL, Supabase JS ordering, timing-only delays, remote databases and additional actor pools.

Official reference: https://node-postgres.com/features/transactions
## R18. Cancellation has a void application result

**Decision**: `cancelQueueEntryAction(queueId)` has one public success contract: `AppSuccess<void>` (`{ ok: true }`). No cancelled-entry DTO is returned to consumers. The controlled RPC also returns no consumer payload; database tests query the Queue after commit, and UI convergence uses the existing Queue Realtime event or an authorized refresh. This matches current consumers, avoids optimistic mutation, and does not add an unused DTO.

Errors remain typed: `SESSION_CLOSED`, sanitized not-found/unauthorized, invalid transition, and unknown. A late success is ignored when the lifecycle epoch changed.

**Alternative considered**: Returning the Queue row was rejected because current consumers ignore it and a table-row return would expose future columns automatically.

## R19. Browser navigation is navigation, not dialog dismissal

**Decision**: The final AlertDialog cannot close by Escape, pointer outside, open-state change, or gesture while its route remains mounted. The application does not install a history trap, synthetic `pushState`, `beforeunload`, or native confirmation.

- The supported in-app action performs room-scoped cleanup and `router.replace('/')`.
- Browser Back, a `popstate`, or a mobile swipe that actually changes route is platform navigation; route unmount invalidates epochs and removes channels.
- If `popstate` leaves the same closed route mounted, lifecycle remains terminal and the modal remains open.
- Forward navigation, deep link, typed URL, or revisiting the closed route performs the authorized initial status read and opens the modal again.
- `pageshow`, including BFCache restoration (`event.persisted=true`), marks nonterminal snapshots unconfirmed and triggers resync with writes blocked. A snapshot already confirmed `closed` remains terminal.

This satisfies “not dismissible while on the room route” without trapping the user in browser history or introducing an automatic redirect.

## R20. Host Queue transitions use one definitive controlled RPC

**Decision**: Replace direct Host Queue UPDATE with `public.update_queue_status(p_queue_id uuid, p_new_status text)`. It is a `VOLATILE SECURITY DEFINER PARALLEL UNSAFE` PL/pgSQL function, owner `postgres`, `search_path=''`, authenticated-only, and returns exactly `id,status,updated_at,changed`.

The function derives Session from Queue, authorizes only `auth.uid() = sessions.host_id`, locks Session before Queue, rejects closed, and never trusts client Session/Host identifiers. Allowed transitions match the existing UI: pending→preparing/cancelled, preparing→singing/cancelled, singing→completed/cancelled. Same-status retry is a no-op success with `changed=false`; terminal states have no other outgoing transition. Missing, cross-session, and unauthorized callers share `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN`.

**Rationale**: One narrow RPC removes direct UPDATE, preserves the current DJ workflow, serializes with close, and returns no whole Queue row or future columns.

**Alternative considered**: separate RPCs per Queue transition were rejected as unnecessary surface area and duplicated authorization/locking.

## R21. Pause/resume uses one definitive controlled RPC

**Decision**: Replace direct Session UPDATE with `public.update_session_status(p_session_id uuid, p_new_status text)`. It is a `VOLATILE SECURITY DEFINER PARALLEL UNSAFE` PL/pgSQL function, owner `postgres`, `search_path=''`, authenticated-only, and returns exactly `id,status,changed`.

It accepts only active/paused, derives identity from `auth.uid()`, locks the owned Session, permits active↔paused, and treats active→active or paused→paused as idempotent `changed=false`. A closed target is invalid; a Session already closed returns `SESSION_CLOSED`. Only `close_session` can set closed or `closed_at`.

**Rationale**: The single RPC preserves the current toggle while eliminating the direct-update race and preventing pause/resume from becoming an alternate closure or reopening path.

**Alternative considered**: separate pause and resume functions were rejected because the state machine and ACL are identical and one constrained target parameter is simpler.


## R22. Final policy cutover removes every incompatible permissive policy

**Decision**: migration 016 inventories and drops by exact name `sessions_select_public`, `sessions_update_own`, `participants_select_session`, `"Users can read active queue of their session"`, and `"Host can update queue"` before creating final policies. The write capabilities behind the two update policies were already removed by migration 015; their DROP in 016 finalizes the catalog atomically with read policies and Realtime.

It preserves only `"Block direct inserts on queue"` and `"Block direct deletes on queue"`, then creates `sessions_select_open`, `sessions_select_owned_or_member`, `participants_select_authorized_open_or_host`, and `queue_select_authorized_open_or_host`. The same transaction contracts SELECT grants and adds `public.sessions` to `supabase_realtime` once.

`pg_policies`, table/column catalogs and behavioral matrices prove the exact final set, no residual permissive policy and no `USING(true)`/`WITH CHECK(true)`.
## R23. The private schema has one permanent ACL from migration 015

**Decision**: migration 015 creates `private`, its trigger function and all three RLS helpers in one transaction. Owner is `postgres`; PUBLIC/anon/authenticated have no CREATE; authenticated receives only schema USAGE and EXECUTE on the three helpers; the trigger function receives no web EXECUTE.

`supabase/tests/003_session_closure_invariants.sql` verifies trigger metadata/behavior. `supabase/tests/003_session_rls_helpers.sql` verifies the permanent schema/helper ACL and no-recursion matrix immediately after 015 and in later full gates.

The historical `supabase/tests/003_private_schema_post_015.sql` is preserved for traceability but is **not executed or included in the post-015 gate or any later gate**. Its no-USAGE expectation described the removed four-stage design and is not an invariant of the atomic design.
## R24. Every incremental gate applies and verifies its migration

**Decision**: for migrations 015 and 016 the executable sequence is file creation/update → `npx --no-install supabase migration up --local` → `npx --no-install supabase migration list --local` with the timestamp applied → stage-specific gate. File creation alone never counts as application.

The post-015 gate includes `003_session_privileges.sql` and all writer/close races; it must pass before 016 exists or is applied. `db reset --local` is reserved for clean validation, controlled recovery and the final gate.
## R25. Existing writers use one hardened SECURITY DEFINER standard

**Decision**: `public.join_session(text,text) RETURNS jsonb`, `public.create_queue_entry(uuid,varchar,varchar) RETURNS TABLE(...)`, and `public.cancel_queue_entry(uuid) RETURNS void` are owned by `postgres`, use `LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path=''`, fully qualify every object, and contain internal `auth.uid()` authorization. After create/replace, each exact signature receives REVOKE ALL from PUBLIC, anon, and authenticated followed by GRANT EXECUTE only to authenticated.

Supabase Anonymous Auth users have a JWT and database role authenticated; role anon represents an unauthenticated call and receives no EXECUTE. Session-first locking and closed validation occur before Participant/Queue mutation. Join/create reject paused; cancel preserves cancellation in active and paused. Their exact DTOs, domain errors, ACLs, `pg_proc` metadata, and close races are defined in their contracts.

**Alternatives rejected**: `search_path=public`, grants to anon, whole-row returns that expand with the table, or a generic “minimum grants” statement without executable ACL commands.

## R26. Twenty-call evidence is sequential idempotency, not a fake stress test

**Decision**: Deterministic concurrency remains pairwise with txA, txB, and observer. Separately, execute one successful `close_session` and nineteen sequential authenticated retries against the same closed Session. Assert the first `changed=true`, every retry `changed=false`, and identical `closed_at` in all twenty results and the database.

The specification criterion is satisfied by repeated calls. No pool or additional connections are introduced.

## R27. Final generated types precede typed Realtime close tests

**Decision**: regenerate `src/infrastructure/supabase/database.types.ts` after migration 015 so every hardened writer, Host RPC and `close_session` is typed before application adapters are written. Apply migration 016, regenerate final types, reconfirm the exact functions/schema, then create/compile the Realtime integration test and release the close UI.

Raw clients, `any`, broad casts and a Supabase client without generic `Database` remain forbidden.
## R28. Supabase CLI is a pinned project devDependency

**Baseline inspection**: `package.json` has no `supabase` package, no global CLI is available, and `npx --no-install supabase --version` fails. Relying on an implicit download would make migration, type-generation, and pgTAP behavior drift between machines.

**Decision**: install exactly `supabase@2.106.0` with:

```powershell
npm install --save-dev --save-exact supabase@2.106.0
```

The committed `package.json` must contain `"supabase": "2.106.0"` and `package-lock.json` must lock the complete dependency graph. Fresh environments use `npm ci`. Every invocation uses `npx --no-install supabase`, and `npx --no-install supabase --version` must return exactly `2.106.0` before any local backend action.

If the executable is missing or the version differs, setup fails before Docker, migrations, resets, generated types, or database tests. The operator first runs `npm ci`; the exact install command above is used only when introducing or deliberately updating the locked dependency. There is no fallback to a global CLI, `latest`, or an implicit network download.

The canonical local commands are `npx --no-install supabase start`, `status -o env`, `migration up --local`, `migration list --local`, `db reset --local`, `test db --local`, and `gen types typescript --local --schema public`. Tests reject `--linked`, remote `--db-url` values, production/staging/preview projects, TLS/remote endpoints, and non-loopback database hosts. A missing local stack fails fast; it never triggers a remote fallback.

**Rationale**: a project-local exact dependency is reproducible on Windows and CI, is restored by the existing npm lockfile workflow, and makes the binary used by every gate explicit.

**Alternatives rejected**:

- global installation: not represented by the repository lockfile and may differ by workstation;
- bare `npx supabase`: may download a different current release;
- floating `latest`, caret, or tilde range: does not make CLI behavior reproducible;
- remote testing: permission and concurrency suites mutate roles, claims, fixtures, and locks and are local-only.

Official references:

- https://supabase.com/docs/guides/local-development/cli/getting-started
- https://supabase.com/docs/guides/local-development/cli-workflows
- https://supabase.com/docs/reference/cli/supabase-projects-create
- https://www.npmjs.com/package/supabase/v/2.106.0

## R29. The terminal transition trigger is SECURITY INVOKER

**Decision**: the exact routine is `private.enforce_session_state_transition() RETURNS trigger`, with zero arguments, `LANGUAGE plpgsql VOLATILE SECURITY INVOKER PARALLEL UNSAFE SET search_path=''`, owner `postgres`, and only schema-qualified SQL object references. It is bound as `sessions_enforce_state_transition`, a `BEFORE UPDATE OF status, closed_at FOR EACH ROW` trigger on `public.sessions`.

Invoker mode is compatible because the function only compares the `OLD` and `NEW` trigger records, raises stable domain errors, and returns `NEW`. It performs no table lookup or mutation, has no `auth.uid()` dependency, dynamic SQL, or RLS bypass requirement. A controlled SECURITY DEFINER writer still causes the trigger inside the same write transaction, while the trigger itself receives no unnecessary privilege elevation.

After creation, the migration sets owner `postgres` and executes `REVOKE ALL ON FUNCTION private.enforce_session_state_transition() FROM PUBLIC, anon, authenticated`. It grants no direct EXECUTE to web roles or `service_role`. Web clients call approved public RPCs; the trigger manager invokes this routine as part of the row update, so exposing it as a callable RPC would add attack surface without enabling any valid flow.

Catalog verification asserts exact namespace/name/empty identity arguments, return type `trigger`, `prolang=plpgsql`, `provolatile='v'`, `prosecdef=false`, `proparallel='u'`, owner `postgres`, empty fixed search path, and no web EXECUTE. `pg_trigger` verification asserts the exact function binding, enabled state, row timing, event, and update-column set. Behavioral pgTAP cases cover active↔paused, active/paused→closed, rejection of closed→open, immutable first `closed_at`, invalid status/timestamp pairs, and no mutation beyond returning `NEW`.

**Rationale**: PostgreSQL data-change trigger functions have no ordinary arguments and return `trigger`; trigger execution follows invoker privileges unless the function is SECURITY DEFINER. Since this body needs no additional access, SECURITY INVOKER is the least-privilege choice.

**Alternative rejected**: SECURITY DEFINER. It would run as `postgres` despite the body requiring no elevated read or write and would make owner/ACL mistakes more consequential.

Official references:

- https://www.postgresql.org/docs/current/plpgsql-trigger.html
- https://www.postgresql.org/docs/current/trigger-definition.html
- https://www.postgresql.org/docs/current/sql-createfunction.html
- https://www.postgresql.org/docs/16/sql-createtrigger.html
- https://www.postgresql.org/docs/current/sql-revoke.html

## Remaining unknowns

None. No unresolved decision remains for planning.
