# Tasks: Song Queue

**Feature**: `002-song-queue`
**Plan**: `specs/002-song-queue/plan.md`

## Phase 1 — Setup

- [ ] T001 Validate branch, repository structure, and `.env.local` existence in the root directory.
- [ ] T002 Verify Vitest and Playwright configurations exist in `vitest.config.ts` and `playwright.config.ts`.
- [ ] T003 Ensure Supabase local stack is running and healthy via `supabase status`.

## Phase 2 — Foundational

### Identidade e Anonymous Auth (Migrations & Typings)

- [ ] T004 Create migration `supabase/migrations/20260714220000_005_participants_auth_user_id.sql` to add `auth_user_id UUID REFERENCES auth.users(id)` and `UNIQUE(session_id, auth_user_id)` to `participants`, dropping `recovery_token_hash`.
- [ ] T005 Create migration `supabase/migrations/20260714220100_006_create_queue_table.sql` defining `public.queue` with `session_id`, `participant_id`, `song_title`, `artist`, `status`, `position`, `created_at`, `updated_at`.
- [ ] T006 Create migration `supabase/migrations/20260714220200_007_queue_constraints.sql` for `queue_status_check` and the Microfone Justo partial index `queue_active_participant_idx`.
- [ ] T007 Create migration `supabase/migrations/20260714220300_008_create_queue_entry_rpc.sql` defining the `SECURITY DEFINER` function that locks the session row and calculates position securely.
- [ ] T008 Create migration `supabase/migrations/20260714220400_009_cancel_queue_entry_rpc.sql` defining the `SECURITY DEFINER` function for safe cancellations.
- [ ] T009 Create migration `supabase/migrations/20260714220500_010_queue_rls_policies.sql` implementing `auth.uid()` evaluation for SELECT (Host/Participant) and blocking direct INSERT/UPDATE/DELETE.
- [ ] T010 Create migration `supabase/migrations/20260714220600_011_realtime_publication.sql` to add `public.queue` to `supabase_realtime` publication.
- [ ] T011 Run `supabase db push` and `npm run generate-types` to update `src/infrastructure/supabase/database.types.ts`.
- [ ] T012 Update `src/application/participant/join-session.action.ts` to authenticate via `supabase.auth.signInAnonymously()` instead of generating a recovery token.
- [ ] T013 Update `src/application/participant/recover-participant.action.ts` to rely on `supabase.auth.getUser()` rather than checking custom cookies.

### Tipos e Infraestrutura Compartilhada

- [ ] T014 [P] Create `src/domain/queue.types.ts` defining `QueueEntry`, `ActiveQueueEntry`, `QueueStatus`, and Zod schemas for song requests.
- [ ] T015 [P] Update `src/domain/errors.types.ts` to include queue-specific domain errors (e.g., `ACTIVE_SONG_EXISTS`, `INVALID_STATUS_TRANSITION`).

## Phase 3 — User Story 1 (Add Song Request)

**Goal**: Participant can successfully submit a song to the queue.
**Test Criteria**: Submitted song appears in database with `pending` status and deterministic position.

- [ ] T016 [US1] Create server action `src/application/queue/create-queue-entry.action.ts` wrapping the `create_queue_entry` RPC.
- [ ] T017 [P] [US1] Create UI component `src/components/queue/RequestSongForm.tsx` with title, artist inputs, loading states, and 48px touch targets.
- [ ] T018 [US1] Integrate `RequestSongForm` into `app/sala/[code]/page.tsx`.
- [ ] T019 [US1] Write unit tests in `__tests__/domain/queue.validators.test.ts` to validate Zod schemas for title and artist.
- [ ] T020 [US1] Write DB integration tests in `__tests__/infrastructure/db/create_queue_entry.test.ts` to verify atomic position generation under concurrency and RLS boundaries.

## Phase 4 — User Story 2 (Real-time Queue Visualization)

**Goal**: Real-time queue updates propagate securely across all isolated clients.
**Test Criteria**: Queue synchronizes without refresh, respects RLS, and blocks offline writes.

- [ ] T021 [US2] Create server action `src/application/queue/list-active-queue.action.ts` to fetch initial queue state.
- [ ] T022 [P] [US2] Create custom hook `src/hooks/useActiveQueue.ts` managing the Supabase Realtime subscription, JWT refresh logic, deduplication, and local offline cache.
- [ ] T023 [P] [US2] Create UI component `src/components/queue/QueueItem.tsx` to render a single row (highlighting "Você" for the current participant).
- [ ] T024 [US2] Create UI component `src/components/queue/QueueList.tsx` combining `useActiveQueue` and `QueueItem` with empty/offline states.
- [ ] T025 [US2] Integrate `QueueList` into `app/sala/[code]/page.tsx` (Guest View).
- [ ] T026 [US2] Integrate `QueueList` into `app/sala/[code]/dj/page.tsx` (Host View).
- [ ] T027 [US2] Write unit tests in `__tests__/hooks/useActiveQueue.test.ts` verifying deduplication, ordering, and offline state transitions.

## Phase 5 — User Story 3 (Anti-Spam Rule)

**Goal**: System strictly blocks a participant from queuing a second song while one is active.
**Test Criteria**: DB Partial Index correctly rejects the second entry and UI displays a friendly toast.

- [ ] T028 [US3] Update `src/application/queue/create-queue-entry.action.ts` to translate PostgreSQL unique violation into `ACTIVE_SONG_EXISTS` domain error.
- [ ] T029 [US3] Update `src/components/queue/RequestSongForm.tsx` to display toast and disable inputs when an active song is detected.
- [ ] T030 [US3] Write DB integration test in `__tests__/infrastructure/db/queue_anti_spam.test.ts` to prove `queue_active_participant_idx` blocks concurrent spam.

## Phase 6 — User Story 4 (Cancel Own Song)

**Goal**: Participants can cancel their own `pending` songs securely.
**Test Criteria**: Cancellation triggers `UPDATE` via RPC and removes item from active realtime list.

- [ ] T031 [US4] Create server action `src/application/queue/cancel-queue-entry.action.ts` wrapping the `cancel_queue_entry` RPC.
- [ ] T032 [US4] Update `src/components/queue/QueueItem.tsx` to include a cancellation button and confirmation modal (only visible for the owner's `pending` song).
- [ ] T033 [US4] Write DB integration test in `__tests__/infrastructure/db/cancel_queue_entry.test.ts` proving a user cannot cancel another user's song or a `singing` song.

## Phase 7 — Polish & Quality Check

- [ ] T034 Add instructions to `quickstart.md` explaining how to configure Supabase rate-limiting for Anonymous Sign-ins in the dashboard.
- [ ] T035 Run accessibility audit manually on `app/sala/[code]/page.tsx` ensuring focus and contrast on `RequestSongForm`.
- [ ] T036 Execute `npm run lint` and resolve any issues.
- [ ] T037 Execute `npm run typecheck` and resolve any TS strict errors.
- [ ] T038 Execute `npx vitest run` ensuring 100% pass rate for domain, hook, and db tests.
- [ ] T039 Execute `npm run build` to confirm production build succeeds without Next.js errors.

---

## Execution Dependencies

- Phase 2 (Migrations and Auth Update) **MUST** be fully completed before any other phases can begin.
- Phase 3 (Add Song) serves as the prerequisite to adequately test Phase 4 (Realtime).
- Phase 5 (Anti-Spam) and Phase 6 (Cancel) can be implemented in parallel after Phase 4 is completed.
- The `[P]` tasks inside phases can be executed concurrently by agents as they touch completely distinct files (e.g., Domain Types vs Database Queries).
