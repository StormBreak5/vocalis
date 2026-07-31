# Quickstart: Validação do Encerramento de Sessão

**Feature**: `003-close-session`

This guide validates the completed implementation. It does not replace the contracts or contain implementation bodies.

## 1. Prerequisites

- Node/npm versions compatible with the repository.
- Docker running for Supabase local.
- Supabase CLI fixed at `2.106.0` as an exact project devDependency in `package.json`/`package-lock.json`; a global CLI is not the source of truth.
- Local environment values configured from `.env.example`.
- Anonymous sign-ins enabled in the local Supabase configuration, matching the participant flow.
- Feature migrations implemented in the order documented by [plan.md](./plan.md).

When introducing the dependency during setup, use exactly:

```powershell
npm install --save-dev --save-exact supabase@2.106.0
```

After the manifest and lockfile contain that exact version, clean environments use `npm ci`. Verify before starting Docker or any database gate:

```powershell
npx --no-install supabase --version
```

Expected output: `2.106.0`. If the command is missing or reports another version, stop. Run `npm ci` and verify again; if the dependency has not yet been introduced, execute the exact setup install above, commit both package files, and repeat the check. Never fall back to a global CLI, `latest`, a version range, or `npx` without `--no-install`.

Canonical local-only commands:

```powershell
npx --no-install supabase start
npx --no-install supabase status -o env
npx --no-install supabase migration up --local
npx --no-install supabase migration list --local
npx --no-install supabase db reset --local
npx --no-install supabase test db --local
npx --no-install supabase gen types typescript --local --schema public
```

- Development dependencies `pg` and `@types/pg` installed and locked in `package.json`/`package-lock.json`:

```powershell
npm install --save-dev pg @types/pg
```

The expected package script is:

```json
"test:db:race": "vitest run src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts src/infrastructure/__tests__/session-writer-races.integration.test.ts"
```

Do not use production, staging, preview, or another remote database for migrations, resets, type generation, concurrency, permission, RLS, or Realtime tests. `--linked`, remote `--db-url`, TLS/remote endpoints, and non-loopback database hosts are prohibited; absence of the local stack is a hard failure, never a remote fallback.

## 2. Start and reset the local backend

```powershell
npx --no-install supabase start
npx --no-install supabase db reset --local
```

Expected after the complete implementation:

- all migrations apply in sequence;
- migration preflight reports no inconsistent Session rows;
- Realtime is enabled;
- `public.sessions` appears once in `supabase_realtime`;
- anonymous authentication is available locally.

If preflight finds a legacy closed row without an authoritative timestamp, stop. Apply a reviewed corrective migration rather than inventing a value.

### Incremental migration gates

Apply and validate exactly two migrations. For each: create/update the file, run `npx --no-install supabase migration up --local`, confirm its timestamp with `npx --no-install supabase migration list --local`, execute the stage gate, and only then advance. `db reset --local` remains reserved for clean recovery and final validation.

| Gate | Applied through | Execute | Still forbidden |
|---|---|---|---|
| Post-015 atomic writer gate | `015_session_closure_atomic` | Invariants; permanent private/helper ACL; join/create/cancel/update-queue/pause-resume/Host-details/close contracts; close auth/idempotency; all paired races; **`supabase/tests/003_session_privileges.sql`** | Creating/applying 016, final policy/RLS matrix and Session Realtime |
| Post-016 final read/Realtime gate | `016_session_closure_rls_realtime` | Final policy catalog, column/table grants, Host/member/external × open/closed, publication, typed Realtime and complete suite | Nothing remains stage-forbidden |

Migration 015 is one explicit transaction. Its commit simultaneously exposes `closed`, invariants, every hardened writer, direct-DML revokes and `close_session`. It is invalid to split or partially apply this file. Migration 016 contains only policy removal/creation, read-grant contraction, Session publication and schema reload.

`supabase/tests/003_private_schema_post_015.sql` is preserved for historical traceability but is not executed or included in the post-015 gate or any later gate.

## 3. Regenerate database types

Generate from the local database after each migration.

After migration 015 and the immediate SQL privilege/invariant gate is green—but before compiling typed writer and concurrency tests:

```powershell
npx --no-install supabase gen types typescript --local --schema public > src/infrastructure/supabase/database.types.ts
npm run typecheck
```

Verify `get_host_session_details`, `update_queue_status`, `update_session_status`, `close_session`, rewritten join/create/cancel and exact DTOs are present.

After applying migration 016 and confirming `20260729101000`:

```powershell
npx --no-install supabase gen types typescript --local --schema public > src/infrastructure/supabase/database.types.ts
npm run typecheck
```

Reconfirm all functions and final `sessions.status`/`closed_at`. Only after this final generation may the typed Realtime integration test and close UI be compiled/released. Never edit generated types, use `any`, broad casts or remove the `Database` generic.
## 4. Run static and automated checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Then run browser tests:

```powershell
npm run test:e2e
```

All existing tests and the new closure tests must pass.

## 5. Database contract validation

Use Supabase-local integration tests with separate JWT clients for:

### Authorization and Host details

- owner closes active;
- owner closes paused;
- participant cannot close;
- other Host cannot close;
- unauthenticated caller cannot close;
- nonexistent and non-owned targets return the same sanitized error;
- `public.get_host_session_details(p_session_id uuid)` accepts only a Session UUID and has no code overload;
- the owner reads active, paused and closed through that RPC;
- null JWT returns `AUTH_REQUIRED`;
- participant, other Host, external user and nonexistent target return `SESSION_NOT_FOUND_OR_FORBIDDEN`;
- the exact DTO is `id,code,status,closed_at,created_at,max_participants,max_queue_entries`;
- the DTO never includes `host_id`, auth/token fields, Participant/Queue rows, the whole Session row, or future columns.

### State and idempotency

- first close returns `changed=true`;
- status becomes `closed`;
- `closed_at` is populated;
- retry returns `changed=false` with identical timestamp;
- the first `close_session` call closes the Session and returns `changed=true`; nineteen strictly sequential retries return `changed=false`; all twenty results and the database preserve exactly the first `closed_at`;
- direct reopen, timestamp overwrite, UPDATE, and DELETE fail.

### Blocked writes

After close:

- `join_session` creates no Participant;
- `create_queue_entry` creates no Queue row;
- `cancel_queue_entry` preserves Queue status and its application result remains `AppSuccess<void>` / `{ok:true}`, with no cancelled-entry DTO;
- Host queue-status operation preserves Queue status;
- pause/resume cannot alter the Session.

Every operation should return the common friendly closed message.

### Controlled Host status RPCs

Validate `public.update_queue_status(p_queue_id uuid, p_new_status text)`:

- only the owning Host succeeds;
- Session id is derived from Queue and Session locks before Queue;
- allowed transitions are pending→preparing/cancelled, preparing→singing/cancelled, and singing→completed/cancelled;
- same-status retry returns `changed=false` without changing `updated_at` or emitting an event;
- DTO is exactly `id,status,updated_at,changed`;
- closed, missing/cross-session, unauthorized, and invalid transition outcomes are sanitized;
- PUBLIC/anon cannot execute; authenticated can call but internal ownership remains authoritative.

Validate `public.update_session_status(p_session_id uuid, p_new_status text)`:

- only active/paused targets are accepted;
- owner active↔paused succeeds and same-status retry returns `changed=false` without an event;
- a closed Session returns `SESSION_CLOSED` and target closed is invalid;
- DTO is exactly `id,status,changed`;
- PUBLIC/anon cannot execute; authenticated execution still requires internal ownership;
- `close_session` remains the only operation that can set closed or `closed_at`.

### RLS and grants

Validate the matrix:

| Caller | Active/paused status | Closed status | Participants/queue after closed |
|---|---|---|---|
| Owning Host | allowed | allowed | allowed read-only |
| Linked participant | allowed | minimal status allowed | denied |
| External user | existing minimal open lookup | denied | denied |

Validate the transition function first:

- exact signature `private.enforce_session_state_transition() RETURNS trigger`, zero arguments;
- PL/pgSQL, VOLATILE, SECURITY INVOKER, PARALLEL UNSAFE, owner `postgres`, `search_path=''`;
- trigger `sessions_enforce_state_transition` is a row-level `BEFORE UPDATE OF status, closed_at` on `public.sessions`;
- the body uses only `OLD`/`NEW`, returns `NEW`, rejects invalid terminal transitions, and never sets `closed_at`;
- PUBLIC, `anon`, `authenticated`, and `service_role` receive no direct EXECUTE grant. Clients use public RPCs; they never call the trigger routine.

Use `pg_proc`, `pg_language`, `pg_namespace`, `pg_roles`, `pg_trigger`, `pg_attribute`, and ACL checks to prove signature, return `trigger`, owner, `prosecdef=false`, `provolatile='v'`, `proparallel='u'`, language, empty search path, exact binding and lack of web EXECUTE. `supabase/tests/003_session_closure_invariants.sql` contains these permanent assertions and behavioral cases.

Then validate the permanent schema ACL created by migration 015: `supabase/tests/003_session_rls_helpers.sql` proves `authenticated` has only schema USAGE and the three exact helper EXECUTEs, remains without CREATE, while PUBLIC/`anon` remain without CREATE/USAGE and no broad privilege appears. Preserve `003_private_schema_post_015.sql`, but do not execute or include it in any gate.

The permanent helper contract is:

- `private.is_session_host(p_session_id uuid) RETURNS boolean`;
- `private.is_session_member(p_session_id uuid) RETURNS boolean`;
- `private.is_session_open(p_session_id uuid) RETURNS boolean`;
- each is SQL, STABLE, SECURITY DEFINER, PARALLEL UNSAFE, non-STRICT and non-LEAKPROOF, owner `postgres`, with `search_path=''` and only schema-qualified references;
- null JWT, null argument, missing and cross-session targets return false;
- the owner bypass avoids sessions↔participants policy recursion; `FORCE ROW LEVEL SECURITY` is not enabled.

Execute the positive/negative no-recursion matrix for Host, member, external identity and null auth over active, paused, closed, missing and cross-session UUIDs.

Validate the exact policy inventory before the column boundary:

- `pg_policies` no longer contains `sessions_select_public`, `sessions_update_own`, `participants_select_session`, `"Users can read active queue of their session"`, or `"Host can update queue"`;
- `pg_policies` contains exactly `sessions_select_open`, `sessions_select_owned_or_member`, `participants_select_authorized_open_or_host`, `queue_select_authorized_open_or_host`, `"Block direct inserts on queue"`, and `"Block direct deletes on queue"` across the three tables;
- no residual policy contains `USING(true)` or `WITH CHECK(true)`;
- behavior proves Host/member/external access for open and closed exactly as the matrix above.

Validate the cutover and column boundary:

- `information_schema.table_privileges` contains no Session table-level SELECT for PUBLIC, anon or authenticated;
- `information_schema.column_privileges` contains exactly `id`, `code`, `status`, `closed_at` for anon/authenticated;
- `has_table_privilege` is false while `has_column_privilege` matches only those four columns;
- direct `SELECT *`, `host_id`, `created_at`, `max_participants`, `max_queue_entries` and future/internal columns fail for both Host and participant;
- Host details succeed only through `get_host_session_details(uuid)`;
- direct sessions/queue writes are absent and no permissive legacy policy remains.

Confirm the migration contains the explicit ordering:

```sql
REVOKE SELECT ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, code, status, closed_at)
ON TABLE public.sessions
TO anon, authenticated;
```

Finally inspect `close_session`, `get_host_session_details`, `join_session(text,text)`, `create_queue_entry(uuid,varchar,varchar)`, and `cancel_queue_entry(uuid)`: fixed empty search path, owner `postgres`, exact returns, PUBLIC/anon execution revoked, authenticated execution granted, qualified objects and sanitized outputs. Confirm join/create reject paused and closed without mutation, while cancel remains allowed in active/paused and rejects closed.

## 6. Manual multi-client flow

Use three isolated browser contexts, not three tabs sharing one auth profile:

1. Context A: create a room as Host and open DJ dashboard.
2. Context B: join as Participant 1 using anonymous auth.
3. Context C: join as Participant 2.
4. Add representative queue entries.
5. In A, select **Encerrar sala**.
6. Verify confirmation explains:
   - action is permanent;
   - active experience ends;
   - new writes stop;
   - current data is preserved.
7. Confirm once.

Expected:

- button shows loading and blocks duplicate clicks;
- no success appears before server confirmation;
- A, B, and C show the same final modal without F5;
- title/message/action exactly match the spec;
- Escape, outside click, and absent X cannot dismiss it;
- focus is trapped and begins on the sole action;
- action target is at least 48×48 px;
- underlying actions are inert.

## 7. Return-to-home cleanup

In each context, select **Voltar para o início**.

Expected:

- navigation uses `/` and does not automatically return to the closed route;
- room channels are removed;
- room-specific React state/snapshot/identifiers are cleared;
- Host authentication remains;
- participant anonymous authentication remains;
- another tab/room is not signed out or cleared;
- no token appears in Cache Storage.

Manually validate browser navigation:

- the official action performs room-scoped cleanup and `router.replace('/')`;
- Back, `popstate` and a mobile back-swipe that actually leave the route unmount it and clean channels without reopening the Session;
- a navigation gesture that leaves the same route does not dismiss the modal;
- Forward, deep link and a new visit to the closed URL execute the initial status query and reopen the modal;
- returning through BFCache (`pageshow.persisted`) marks a nonterminal snapshot unconfirmed, blocks writes and resynchronizes; an already confirmed `closed` remains terminal;
- there is no history trap, `beforeunload` prompt or automatic redirect.

## 8. Realtime wiring validation

Inspect test spies or development instrumentation:

- JWT is configured before channel connection;
- table is `sessions`;
- event is `UPDATE`;
- filter is `id=eq.<sessionId>`;
- selected columns are `id,status,closed_at`;
- all `.on()` registrations occur before `.subscribe()`;
- cleanup removes the exact channel;
- Strict Mode leaves no duplicate active channel;
- changing session id removes the old channel.

Confirm an external JWT subscribed to the same UUID receives no closed event due to RLS.

## 9. Missed-event and reconnection scenarios

### Participant offline during close

1. Put Context B offline.
2. Close the room in A.
3. Confirm C sees the modal.
4. Reconnect B.

Expected:

- B remains read-only while offline;
- no stale active snapshot enables writes;
- reconnect triggers status resync;
- B opens the modal even though it missed the UPDATE.

### WebSocket event intentionally dropped

Suppress the session-change callback while allowing point reads, then close.

Expected: the next subscribed/visible/online resync discovers `closed`.

### Browser suspension

Suspend/background a participant page, close the room, then restore it.

Expected: `visibilitychange`/`pageshow` resync discovers `closed`.

### Token refresh

Trigger/observe `TOKEN_REFRESHED`.

Expected: Realtime auth is refreshed, status is resynchronized, and exactly one session channel remains.

## 10. Uncertain close response

Simulate the database commit succeeding while the Host loses the response.

Expected:

- UI does not announce unconfirmed success;
- state becomes uncertain and all writes remain disabled;
- status resync discovers closed and opens the modal;
- a retry, if issued, returns the original timestamp.

If resync confirms active/paused instead, only then may the Host retry.

## 11. Deterministic concurrency validation

Run only the approved wrapper:

```powershell
npm run test:db:race
```

That script invokes `scripts/test-db-race-local.ps1`. In the same process that starts Vitest, the wrapper captures `npx --no-install supabase status -o env` in memory, extracts and validates the loopback `DB_URL`, injects `SUPABASE_TEST_DB_URL` only into the Vitest child, waits for completion and removes it in `finally`. It never depends on an environment variable from an earlier task, never prints/persists credentials, and refuses production, TLS, remote hosts or a port different from `supabase/config.toml`.

For every race and each commit order, use a fresh fixture plus three persistent `pg.Client` connections: `txA`, `txB`, and `observer`.

1. `BEGIN` both actors; set `ROLE authenticated` and transaction-local JWT claims so `auth.uid()` identifies the fixture caller.
2. Set bounded connection, lock, statement, idle-transaction, and Vitest timeouts; record both backend PIDs.
3. Execute the first RPC and keep its transaction open so the Session row lock remains held.
4. Start the second RPC asynchronously.
5. From the observer, require `pg_blocking_pids(pidB)` to contain `pidA` before release.
6. Commit the first actor, await the second result, then commit success or roll back its domain error.
7. Assert committed Session, Participant, and Queue state from the observer.
8. In `finally`, roll back open transactions, remove the fresh fixture, and close all three clients; `afterAll` closes any leaked registry entry.

Cover both winner orders for:

- close × close;
- close × join;
- close × `create_queue_entry`;
- close × `cancel_queue_entry`;
- close × pause and resume through `update_session_status`;
- close × `update_queue_status`.

Expected invariant:

```text
writer commits first → its write is preserved, then close commits
close commits first  → waiting writer revalidates closed and makes no write
```

For the 20-call idempotency gate, execute one authenticated owner close and then nineteen sequential authenticated retries against the same Session. Assert exactly one `changed=true`, nineteen `changed=false`, and the same single `closed_at` in every result and in the database. Do not add a connection pool; real concurrency is already proven by the paired three-client races above.

Arbitrary `setTimeout`, timing-only assertions, REST `Promise.all`, shared irreversible fixtures, and remote databases are prohibited. A bounded catalog retry may only observe the blocking predicate; it cannot determine the winner.
## 12. Data preservation

Before closure record:

- Session id/status;
- Participant row count and values;
- Queue row count and every status.

After closure confirm:

- Session still exists;
- `closed_at` exists;
- Participant count/content unchanged;
- Queue count/content/status unchanged;
- no automatic cancelled/completed transitions.

No visual history/report is expected in this feature.

## 13. PWA/cache inspection

With DevTools:

- verify app shell/static assets remain cacheable;
- verify `/sala/*`, RSC payloads, Server Actions, RPC/auth responses, session status, participants, and queue are not persisted;
- verify no JWT/cookie/token is in Cache Storage;
- confirm offline shell still renders the existing offline banner.

## 14. Performance sampling

In staging or an environment representative of deployment:

- capture at least 20 closure deliveries across supported mobile browsers;
- record Supabase region, browser/device, and network profile;
- verify at least 95% display the modal within 2 seconds of confirmed closure;
- verify return navigation completes within 5 seconds.

Mocked unit timing alone does not satisfy these outcome measurements.

## 15. Final acceptance

The feature is ready only when:

- lint, typecheck, unit/integration, E2E, and build pass;
- helper catalog/ACL/no-recursion, Host RPC, cutover privilege, security/grant/RLS tests pass;
- deterministic concurrency covers both commit orders and preserves closed;
- one successful close plus nineteen sequential retries yields one `changed=true`, nineteen `changed=false`, and exactly one preserved `closed_at`;
- the project-local Supabase CLI reports exactly `2.106.0`, and every database command remains local-only;
- lost events converge through reads;
- modal is inaccessible to dismissal;
- auth and data preservation are proven;
- no polling or offline mutation queue exists.
