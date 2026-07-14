# Implementation Plan: Song Queue

**Branch**: `002-song-queue` | **Date**: 2026-07-14
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)
**Data Model**: [data-model.md](./data-model.md)

---

## Summary

Implement the core karaoke song request queue and real-time visualization. Participants can add songs and cancel their own pending requests. The Host and all participants see the active queue update in real-time. The "Microfone Justo" (Anti-Spam) rule is strictly enforced by PostgreSQL to ensure fairness, preventing a user from having more than one active song.

---

## Constitution Check

*Reference: `.specify/memory/constitution.md` — Vocalis Constitution v1.1.0*

- [x] **I. Clean Architecture**: Business logic in `src/application/queue/`; UI components in `src/components/queue/`; Supabase access in `src/infrastructure/`.
- [x] **II. Mobile First & PWA**: Dark mode; minimum 48px touch targets for forms and buttons; loading states for song submission and cancellation.
- [x] **III. Database-Enforced Integrity**: Anti-Spam enforced by `queue_active_participant_idx` partial unique index. Updates via `SECURITY DEFINER` RPCs to guarantee atomic position assignment and credential validation.
- [x] **IV. Typed & DRY Code**: TypeScript `strict: true`; Zod validation schemas for inputs.
- [x] **V. Performance by Default**: Initial queue load via Server Components (or Server Actions). Client Components used for Realtime subscription (`useActiveQueue`).
- [x] **VI. Quality & Simplicity**: Read-only offline cache to avoid complex optimistic UI conflict resolution.

**Deviation recorded**: Realtime RLS session isolation cannot be fully enforced at the DB level due to custom cookie auth (See Complexity Tracking RD-008).

---

## Technical Context

| Concern | Choice | Version / Notes |
|---|---|---|
| Language | TypeScript | `strict: true` |
| Primary Dependencies | Supabase Realtime | `@supabase/supabase-js`, `@supabase/ssr` |
| Storage | PostgreSQL | `public.queue` table |
| Testing | Vitest | |
| Project Type | Web Application | Next.js App Router |
| Constraints | Offline read-only | Network drops block submissions but keep UI visible |

---

## Identity & Realtime Authorization Architecture

To strictly isolate queue data per session and securely authenticate both REST and Realtime connections, the system adopts **Supabase Anonymous Auth** alongside standard Auth.

### 1. Identity Acquisition & Participant Mapping
- **Guests**: When a guest joins a session via code, the application calls `supabase.auth.signInAnonymously()`. This generates a unique `auth.uid()`. A row is then created in the `participants` table linking `session_id` to this `auth_user_id`. The application discards the legacy `vocalis_pid` cookie in favor of the standard Supabase Auth session.
- **Hosts**: The Host is already authenticated (e.g., via OAuth or Email/Password). If the Host also acts as a singer, the system reuses their existing `auth.uid()` to create the `participants` row. It does **not** downgrade the Host to an anonymous session.

### 2. Deriving Identity in the Database
- Client components never send a raw `participant_id` as proof of identity.
- When calling RPCs (`create_queue_entry`, `cancel_queue_entry`), the Postgres function extracts the identity securely using `auth.uid()`.
- The DB looks up the corresponding `participant_id` in the `participants` table where `session_id = p_session_id AND auth_user_id = auth.uid()`. This guarantees the operation is performed by the verified owner.

### 3. Realtime Authorization & Token Refresh
- **Supabase-JS**: The `@supabase/supabase-js` client automatically manages the Auth session, attaching the JWT to both REST requests and the Realtime WebSocket connection.
- **RLS Enforcement**: The Realtime engine evaluates the RLS `SELECT` policy using the claims in this JWT.
- **Token Refresh**: The Supabase client automatically refreshes the JWT before expiration. When refreshed, the client automatically sends the new token over the active WebSocket, seamlessly maintaining the authorized subscription without dropping the connection. If the session is lost (e.g., manual logout), the Realtime channel will gracefully reject further events due to RLS failure.

### 4. Migration of the Previous Feature
- **Action**: The `join-session` and `recover-participant` Server Actions from the Room Access MVP will be rewritten to drop the custom `recovery_token`.
- **Flow**: `join-session` will now initiate `signInAnonymously()`, pass the resulting token to the Server Action (or rely on `@supabase/ssr` middleware), and insert the `participant` with `auth_user_id`.
- **Cleanup**: The `recovery_token_hash` column will be dropped in a migration.

### 5. Abuse Mitigation for Anonymous Sign-ins
- **Rate Limiting**: Configured in the Supabase Dashboard to prevent automated bot networks from exhausting the anonymous user pool.
- **Garbage Collection**: An Edge Function or `pg_cron` job will run nightly to purge `auth.users` (is_anonymous = true) that have been inactive for > 24 hours, keeping the auth database clean.

---

## Project Structure

### Documentation

```
specs/002-song-queue/
├── spec.md
├── research.md
├── data-model.md
├── plan.md               ← this file
├── quickstart.md
├── checklists/
│   └── requirements.md
└── contracts/
    ├── list-active-queue.md
    ├── create-queue-entry.md
    └── cancel-queue-entry.md
```

### Source Code

```text
app/
├── sala/
│   └── [code]/
│       ├── page.tsx                    # Updated to render QueueList and RequestSongForm
│       └── dj/
│           └── page.tsx                # Updated to render QueueList (Host view)

src/
├── domain/
│   └── queue.types.ts                 # QueueEntry, QueueStatus, ActiveQueueEntry DTOs
│
├── application/
│   └── queue/
│       ├── create-queue-entry.action.ts # 'use server' - calls create_queue_entry RPC
│       ├── cancel-queue-entry.action.ts # 'use server' - calls cancel_queue_entry RPC
│       └── list-active-queue.action.ts  # 'use server' - fetches initial queue state
│
├── infrastructure/
│   └── supabase/
│       └── queries/
│           └── queue.queries.ts        # DB selections
│
├── hooks/
│   └── useActiveQueue.ts              # Custom hook managing Realtime subscription + local state
│
├── components/
│   └── queue/
│       ├── QueueList.tsx              # Renders the active list (used by guest and host)
│       ├── QueueItem.tsx              # Single row in the queue (handles cancel logic if owner)
│       └── RequestSongForm.tsx        # Form to add a song (disabled if already has active song or offline)
```

**Structure Decision**: Integrating into the existing domain-driven folder structure inside `src/`. Components are modularized inside `src/components/queue` to be reused across the Guest and Host views.

---

## Complexity Tracking

### RD-008: Realtime RLS vs Custom Cookie Identity (RESOLVED)
- **Issue**: The previous MVP architecture used a custom `vocalis_pid` cookie for identity, which cannot be securely evaluated by Supabase Realtime's RLS engine since it only inspects the Supabase JWT (`auth.uid()`).
- **Decision**: Migrate the guest identity layer to **Supabase Anonymous Auth** (`signInAnonymously`), establishing a standard session that native Realtime RLS can evaluate.
- **Resolution**: Fully documented in the **Identity & Realtime Authorization Architecture** section above. The `NEEDS CLARIFICATION` flag has been scrubbed from all artifacts as the technical solution completely fulfills the strict isolation requirements without trusting client input.

---

## Verification Plan

### Automated Tests

```bash
# Unit tests (validators, hooks logic)
npx vitest run

# E2E tests (future/Playwright)
# - Scenario: Participant A adds song
# - Scenario: Participant A blocked from adding second song
# - Scenario: Participant A cancels song
# - Scenario: Realtime propagation to Host
```

### Manual Verification

See [quickstart.md](./quickstart.md) for step-by-step validation of each flow including concurrency checks and offline handling.
