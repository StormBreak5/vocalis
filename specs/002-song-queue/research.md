# Research & Decisions: Song Queue

**Feature**: `002-song-queue`
**Date**: 2026-07-14

## R1: Atomic Position Assignment

**Decision**: Take a row-level lock on the parent `sessions` row (`SELECT id FROM sessions WHERE id = p_session_id FOR UPDATE`) inside the `create_queue_entry` RPC before calculating the next position.

**Rationale**: When two participants request a song at the exact same millisecond, executing `SELECT COALESCE(MAX(position), 0) + 1` concurrently would result in the same position being assigned to both. By taking a `FOR UPDATE` lock on the session row, PostgreSQL serializes the transactions for that specific session. The second transaction will wait for the first to commit, ensuring it reads the newly updated `MAX(position)`. This is highly scalable as it only locks concurrent inserts within the *same* session, not across the whole platform.

**Alternatives considered**:
- `SERIAL` / `IDENTITY` column: Rejected because it's global to the table and doesn't guarantee a gapless, 1-based sequence per session, which complicates UI display and future reordering.
- `pg_advisory_xact_lock`: More complex to manage and prone to collision if hash keys aren't perfect.

## R2: Realtime Strategy

**Decision**: Use Supabase **Postgres Changes**.

**Rationale**: `Postgres Changes` automatically streams database mutations (INSERT, UPDATE) to subscribed clients. It integrates perfectly with the `@supabase/supabase-js` client, requires zero custom PostgreSQL triggers, and pushes changes natively.

**Alternatives considered**:
- **Broadcast via Trigger**: Requires setting up `pg_notify` triggers on the `queue` table and broadcasting custom payloads. Adds unnecessary backend complexity for a standard CRUD mirroring use-case.
- **Polling**: Explicitly forbidden by the Constitution.

## R3: Realtime Authorization and Session Isolation

**Decision**: Adopt **Supabase Anonymous Auth** (`signInAnonymously`) for guests and deprecate the custom `vocalis_pid` HttpOnly cookie.

**Rationale**: To securely isolate Realtime channels per session without trusting the client, the Supabase PostgreSQL Realtime engine relies on RLS policies that evaluate `auth.uid()`. Since the previous architecture used a custom cookie, the `anon` websocket connection had no secure way to prove identity to the DB. By migrating to Supabase Anonymous Auth, each participant receives a unique `auth.uid()` mapped to their `participants.auth_user_id`. The RLS policy for `SELECT` on the `queue` table can now easily verify if `auth.uid()` belongs to the requested `session_id`.

**Consequence**: The previous feature (Room Access MVP) will be refactored to replace the recovery token with Supabase Auth. The `participants` table will require a new `auth_user_id UUID REFERENCES auth.users(id)` column and a `UNIQUE(session_id, auth_user_id)` constraint.

**Risk**: Medium. Requires migrating the existing auth flow, but guarantees robust security for Realtime subscriptions.

## R4: Offline Cache and Reconnection

**Decision**: Store a serialized snapshot of the active queue in memory or React state, and disable form inputs when `navigator.onLine` is false.

**Rationale**: The spec requires the queue to be read-only when offline. Instead of relying on `localStorage` (which might persist across session exits), keeping the last known state in memory via the React/Realtime hook ensures it is immediately available during transient drops but cleared when the tab closes.

**Alternatives considered**:
- Service Worker caching of API responses: Rejected per user instructions (dynamic data shouldn't be blindly cached by SW).
- Optimistic UI updates for offline writes: Rejected per clarify decisions (offline writes are blocked).
