# Tasks: Room Access MVP

**Input**: Design documents from `specs/001-room-access-mvp/`

**Prerequisites**: spec.md ✅ | plan.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅ | quickstart.md ✅

**Tests**: Included — TDD approach requested for this feature.

**Organization**: Tasks grouped by phase and user story to enable independent implementation and validation of each story.

## Format: `[ID] [P?] [Story?] Description with exact file path`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[US1]**: User Story 1 — Host Creates a Room (Priority: P1)
- **[US2]**: User Story 2 — Guest Joins a Room (Priority: P1)
- **[US3]**: Implicit Story 3 — Participant Recovery & Reconnection (from FR-004, NFR-004, contracts/recover-participant.md)

---

## Phase 1: Setup

**Purpose**: Prepare the repository, install approved dependencies, configure tooling. Does not create application code.

- [ ] T001 Verify project structure: ensure `app/` exists. Create `src/` directory if it does not exist. Do not automatically move any existing files. If structure conflicts with plan.md, stop and record the conflict as an inline comment in tasks.md before proceeding.
- [ ] T002 Install runtime dependencies: `npm install @supabase/supabase-js @supabase/ssr lucide-react` — update `package.json`
- [ ] T003 Install Vitest and React Testing Library: `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event` — update `package.json`
- [ ] T004 Install Playwright: `npm install -D @playwright/test` and run `npx playwright install chromium` — update `package.json`
- [ ] T005 Initialize shadcn/ui: run `npx shadcn@latest init` selecting dark mode + CSS variables + `src/components/ui/` output path — creates `components.json`, updates `app/globals.css`, `tailwind.config.*`
- [ ] T006 Add `vitest.config.ts` at project root with `jsdom` environment, path alias `@/*` matching `tsconfig.json`, and `globals: true` — file: `vitest.config.ts`
- [ ] T007 Add `playwright.config.ts` at project root with `baseURL: http://localhost:3000`, mobile viewport preset (`iPhone 14`), and `webServer` pointing to `npm run dev` — file: `playwright.config.ts`
- [ ] T008 Add test scripts to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`, `"typecheck": "tsc --noEmit"` — file: `package.json`
- [ ] T009 Install Supabase CLI locally and add `supabase/` directory structure: `supabase init` — creates `supabase/config.toml`, `supabase/migrations/`
- [ ] T010 Create `.env.example` with all required variable names but no secret values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — file: `.env.example`
- [ ] T011 Add shadcn/ui components required by this feature: `npx shadcn@latest add button input label toast card skeleton sonner` — creates files under `src/components/ui/` (Depends on T005)
- [ ] T012 Update imports documentation: Verify `tsconfig.json` uses `@/* -> ./*`. All new files created in `src/` must be imported using `@/src/...` to avoid alias ambiguity. No new aliases should be added.

**Checkpoint**: All dependencies installed, tooling configured, `npm run typecheck` and `npx vitest run` execute without error (zero tests is acceptable at this stage).

---

## Phase 2: Foundational

**Purpose**: Shared infrastructure that ALL user stories depend on. No story work begins until this phase is complete.

**⚠️ CRITICAL**: Migrations, RLS, domain types, and Supabase clients must be complete before any story implementation begins.

### 2A — Environment Validation

- [ ] T013 Create runtime environment variable validator using `process.env` assertions — file: `src/infrastructure/env.ts`
  - Exports typed constants: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Throws at module load time if any required variable is missing
  - Does NOT export `SUPABASE_SERVICE_ROLE_KEY` (server-only, guarded separately)

### 2B — Supabase Clients

- [ ] T014 Create Supabase browser client using `@supabase/supabase-js` — file: `src/infrastructure/supabase/client.ts`
  - Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Singleton pattern (one instance per browser context)
  - No auth storage override (default cookie-based via @supabase/ssr)
- [ ] T015 Create Supabase server client using `@supabase/ssr` — file: `src/infrastructure/supabase/server.ts`
  - Uses `createServerClient` with Next.js `cookies()` from `next/headers`
  - Exported as `async function createSupabaseServerClient()`
  - Must NOT import service role key
- [ ] T016 Write unit tests for env.ts: missing variable throws, present variables export correctly — file: `src/infrastructure/__tests__/env.test.ts`

### 2C — Domain Types

- [ ] T017 Create `SessionStatus` union type and `Session` domain interface — file: `src/domain/session.types.ts`
  - `SessionStatus`: `'active' | 'paused' | 'closed'`
  - `Session`: `{ id: string; code: string; status: SessionStatus; hostId: string; createdAt: string; closedAt: string | null; maxParticipants: number; maxQueueEntries: number }`
- [ ] T018 Create `Participant` domain interface — file: `src/domain/participant.types.ts`
  - `Participant`: `{ id: string; sessionId: string; displayName: string; disambiguationIndex: number; joinedAt: string; lastSeen: string; createdAt: string }`
  - `ParticipantView`: extends `Participant` with `displayLabel: string` (computed: base name + optional `#N` suffix) and `isCurrentUser: boolean`
- [ ] T019 Create `AppError` union type and user-facing message map — file: `src/domain/errors.types.ts`
  - Error codes: `AUTH_FAILED | CODE_GENERATION_FAILED | SESSION_NOT_FOUND | SESSION_CLOSED | SESSION_PAUSED | SESSION_FULL | INVALID_CODE_FORMAT | INVALID_NAME | PARTICIPANT_NOT_FOUND | UNKNOWN`
  - `USER_MESSAGES` record: maps each code to PT-BR string
  - `AppError` type: `{ ok: false; code: ErrorCode; userMessage: string }`
  - `AppSuccess<T>` type: `{ ok: true } & T`
- [ ] T020 Write unit tests for `USER_MESSAGES`: every `ErrorCode` has a corresponding message, messages are non-empty strings — file: `src/domain/__tests__/errors.test.ts`

### 2D — Shared Validation Schemas

- [ ] T021 Create session code validator — file: `src/domain/validators/session-code.validator.ts`
  - `validateSessionCode(code: unknown): string` — trims, uppercases, asserts exactly 6 chars from allowed alphabet `[A-Z2-9]`, throws `AppError` with `INVALID_CODE_FORMAT` otherwise
  - `normalizeCode(raw: string): string` — uppercases and trims
- [ ] T022 Create display name validator — file: `src/domain/validators/display-name.validator.ts`
  - `validateDisplayName(name: unknown): string` — trims, asserts 1–32 chars, throws `AppError` with `INVALID_NAME` otherwise
  - `normalizeDisplayName(raw: string): string` — trims
- [ ] T023 Write unit tests for `session-code.validator.ts`: valid code passes, code <6 chars fails, code >6 chars fails, lowercase normalized to upper, ambiguous chars rejected, empty string fails — file: `src/domain/__tests__/session-code.validator.test.ts`
- [ ] T024 Write unit tests for `display-name.validator.ts`: empty string fails, 32-char name passes, 33-char name fails, leading/trailing spaces are trimmed, emoji accepted — file: `src/domain/__tests__/display-name.validator.test.ts`

### 2E — Supabase Generated Types & Base Migrations

- [ ] T025 Start local Supabase: `supabase start` — verify Studio is accessible at `http://127.0.0.1:54323` (prerequisite for migrations)
- [ ] T026 Write migration `000_create_pgcrypto.sql`: create extension for crypto functions — file: `supabase/migrations/20260714000000_create_pgcrypto.sql`
  - `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;`
  - Apply locally: `supabase db push` and verify it succeeds.

### 2F — Base Layout & Theme

- [ ] T027 Update `app/layout.tsx`: add `dark` class to `<html>` element, set `lang="pt-BR"`, add `<meta name="theme-color">` and `<meta name="viewport" content="width=device-width, initial-scale=1">` — file: `app/layout.tsx`
- [ ] T028 Update `app/globals.css`: configure Tailwind dark mode CSS variables (background, foreground, card, primary, destructive tokens) and import shadcn/ui base styles — file: `app/globals.css`
- [ ] T029 Create `useOnlineStatus` custom hook — file: `src/hooks/useOnlineStatus.ts`
  - `'use client'` — uses `useState`, `useEffect`
  - Returns `{ isOnline: boolean }`
  - Subscribes to `window` `online` and `offline` events; initial value from `navigator.onLine`
  - Cleans up listeners on unmount
- [ ] T030 Write unit tests for `useOnlineStatus` — file: `src/hooks/__tests__/useOnlineStatus.test.ts`
- [ ] T031 Create `OfflineBanner` component — file: `src/components/ui/OfflineBanner.tsx`
  - `'use client'` — uses `useOnlineStatus()`
  - Renders a fixed top banner with text *"Sem conexão. Visualizando dados salvos."* when offline
  - Dismisses automatically when connection is restored
  - Uses `aria-live="polite"` for screen reader announcement
- [ ] T032 Write component test for `OfflineBanner`: renders when offline, hides when online, has correct ARIA attribute — file: `src/components/__tests__/OfflineBanner.test.tsx`
- [ ] T033 Add `<OfflineBanner />` to `app/layout.tsx` so it appears on all pages — file: `app/layout.tsx`

**Checkpoint**: Foundation ready. `npm run typecheck` passes. Unit tests pass. Supabase local is running. Ready to begin user story implementation.

---

## Phase 3: User Story 1 — Host Creates a Room (Priority: P1) 🎯 MVP

**Goal**: An authenticated Host can create a karaoke session and receive a unique 6-character code.

**Independent Test**: Navigate to `/`, click "Criar Sala", observe loading state, land on `/sala/[CODE]/dj`, verify code displayed and copyable.

**Covers**: FR-001, FR-002, FR-006, FR-008, SC-001, SC-002, NFR-001, NFR-002

### Migration — sessions table

- [ ] T034 [US1] Write migration `001_create_sessions.sql`: create `sessions` table with all columns from `data-model.md` — file: `supabase/migrations/20260714000001_create_sessions.sql`
  - Columns: `id uuid PK DEFAULT gen_random_uuid()`, `code char(6) NOT NULL UNIQUE`, `host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','closed'))`, `max_participants smallint NOT NULL DEFAULT 50`, `max_queue_entries smallint NOT NULL DEFAULT 200`, `created_at timestamptz NOT NULL DEFAULT now()`, `closed_at timestamptz`
  - SQL comment: `-- Vocalis: karaoke sessions table`
- [ ] T035 [US1] Write migration `002_sessions_indexes.sql`: create supporting indexes (Note: UNIQUE on code is in T034) — file: `supabase/migrations/20260714000002_sessions_indexes.sql`
  - `CREATE INDEX sessions_host_id_idx ON sessions (host_id)`
  - `CREATE INDEX sessions_status_idx ON sessions (status) WHERE status != 'closed'`
- [ ] T036 [US1] Write migration `003_sessions_rls.sql`: enable RLS and create all four policies for `sessions` — file: `supabase/migrations/20260714000003_sessions_rls.sql`
  - `ALTER TABLE sessions ENABLE ROW LEVEL SECURITY`
  - Policy `sessions_select_public`: `FOR SELECT TO anon, authenticated USING (status != 'closed')`
  - Policy `sessions_insert_blocked`: INSERT blocked for all roles (no policy = implicit block; add comment documenting this)
  - Policy `sessions_update_own`: `FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid())`
  - Policy `sessions_delete_blocked`: DELETE blocked (no policy; document with comment)
- [ ] T037 [US1] Write migration `004_create_session_rpc.sql`: create `create_session(p_host_id uuid)` Postgres function — file: `supabase/migrations/20260714000004_create_session_rpc.sql`
  - `SECURITY DEFINER`, `LANGUAGE plpgsql`, `SET search_path = public, extensions`
  - Restricted alphabet constant: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 chars, no 0/O/1/I)
  - Up to 5 retry attempts to generate a unique code via `gen_random_bytes`
  - On collision after 5 attempts: `RAISE EXCEPTION 'CODE_GENERATION_FAILED'`
  - Inserts into `sessions` with `status = 'active'`, returns full session row
  - `GRANT EXECUTE ON FUNCTION create_session TO authenticated` (anonymous and permanent hosts both get the `authenticated` role via Supabase Auth)

### Apply & Validate Migrations

- [ ] T038 [US1] Apply migrations 001–004 to local Supabase: `supabase db push` — verify tables and function exist in Studio
- [ ] T039 [US1] Generate TypeScript types from local schema: `supabase gen types typescript --local > src/infrastructure/supabase/database.types.ts` — file: `src/infrastructure/supabase/database.types.ts`

### Integration Tests — sessions

- [ ] T040 [US1] Write integration tests for `create_session` RPC — file: `src/infrastructure/__tests__/session.rpc.test.ts`
  - Uses local Supabase test client with authenticated user
  - Test: creates session → returns row with 6-char code matching alphabet
  - Test: code is unique (create 10 sessions → all codes distinct)
  - Test: unauthenticated call is rejected
  - Test: direct INSERT into `sessions` as `anon` is rejected (verifies absence of INSERT policy)
  - Test: direct INSERT into `sessions` as `authenticated` non-host is rejected (verifies absence of INSERT policy)
- [ ] T041 [US1] Write integration test for RLS UPDATE: authenticated host updates own session status → succeeds; authenticated user updates another host's session → 0 rows affected — file: `src/infrastructure/__tests__/session.rls.test.ts`

### Application Layer — createSession

- [ ] T042 [US1] Create `createSession` Server Action — file: `src/application/session/create-session.action.ts`
  - `'use server'`
  - Calls `supabase.auth.getUser()`; if no user → calls `supabase.auth.signInAnonymously()`
  - On auth failure → returns `AppError` with `AUTH_FAILED`
  - Calls `create_session(user.id)` RPC
  - On `CODE_GENERATION_FAILED` exception → returns `AppError`
  - On success → returns `AppSuccess<{ session: Session }>`
  - Maps all Supabase error codes to `AppError` using `errors.types.ts`
- [ ] T043 [US1] Write unit tests for `createSession` action with mocked Supabase client — file: `src/application/__tests__/create-session.action.test.ts`
  - Test: returns session on success
  - Test: returns `AUTH_FAILED` when auth fails
  - Test: returns `CODE_GENERATION_FAILED` when RPC throws that code
  - Test: returns `UNKNOWN` for unexpected errors

### UI Components — US1

- [ ] T044 [US1] Create `CreateSessionButton` client component — file: `src/components/session/CreateSessionButton.tsx`
  - `'use client'`
  - Uses `useTransition` to call `createSession` action
  - Shows `<Button>` with minimum `h-12` (48px) touch target
  - During pending: button disabled + `<Loader2>` icon spinning (Lucide)
  - On success: uses `useRouter().push('/sala/[code]/dj')` for redirect
  - On error: calls `toast.error(error.userMessage)` via sonner
  - While `navigator.onLine === false`: button is disabled with `aria-label` explaining why
- [ ] T045 [US1] Write component tests for `CreateSessionButton` — file: `src/components/__tests__/CreateSessionButton.test.tsx`
  - Test: renders button with accessible label
  - Test: shows spinner during pending state
  - Test: button disabled when offline
  - Test: toast shown on error (mock action)
- [ ] T046 [US1] Create `SessionCodeDisplay` client component — file: `src/components/session/SessionCodeDisplay.tsx`
  - `'use client'`
  - Props: `{ code: string; sessionId: string }`
  - Displays code in large monospace text (visually prominent)
  - "Copiar" button: uses `navigator.clipboard.writeText(code)` with fallback for browsers without Clipboard API; shows success toast "Código copiado!"
  - "Compartilhar" button: uses `navigator.share({ title: 'Vocalis', text: code })` if `navigator.share` is available; falls back to "Copiar" behavior if not
  - Both buttons min `h-12` touch target
- [ ] T047 [US1] Write component tests for `SessionCodeDisplay` — file: `src/components/__tests__/SessionCodeDisplay.test.tsx`
  - Test: displays code correctly
  - Test: copy button calls `navigator.clipboard.writeText`
  - Test: share button calls `navigator.share` when available
  - Test: share button falls back to copy when `navigator.share` not available

### Pages — US1

- [ ] T048 [US1] Update landing page `app/page.tsx` to be a Server Component with two sections: "Criar Sala" (renders `<CreateSessionButton>`) and "Entrar em uma Sala" (placeholder navigation to join form) — file: `app/page.tsx`
  - Page title: "Vocalis — Karaokê ao Vivo"
  - Mobile-first layout: single column, large touch targets, dark background
- [ ] T049 [US1] Create Host Dashboard Server Component shell — file: `app/sala/[code]/dj/page.tsx`
  - Reads `code` from route params
  - Calls `getSessionByCode(code)` (server query)
  - If session not found or `closed` → renders inline closed session message: "Esta sessão foi encerrada."
  - Verifies `session.host_id === auth.uid()` server-side; if mismatch → redirects to `/sala/[code]`
  - Renders `<SessionCodeDisplay code={session.code} sessionId={session.id} />`
- [ ] T050 [US1] Create `getSessionByCode` server query — file: `src/infrastructure/supabase/queries/session.queries.ts`
  - Uses Supabase server client
  - Uppercases input code before query
  - Returns `Session | null` (null if not found or closed)
  - Used in Server Components only (not imported in Client Components)

### E2E Tests — US1

- [ ] T051 [US1] Write Playwright E2E test: Host creates session — file: `e2e/host-creates-session.spec.ts`
  - Scenario 1: Navigate to `/` → click "Criar Sala" → assert redirect to `/sala/*/dj` → assert 6-char code is visible
  - Scenario 2: Assert code matches `[A-Z2-9]{6}` pattern
  - Scenario 3: Assert "Copiar" and "Compartilhar" buttons are present and have ≥ 48px height
  - Scenario 4: Simulate offline (route interception) → "Criar Sala" button is disabled
  - Viewport: iPhone 14 (390×844)

**Checkpoint — US1**: Host can create a session end-to-end. Code is displayed. Copy/share work. Offline state disables creation. All US1 tests pass independently. ✅

---

## Phase 4: User Story 2 — Guest Joins a Room (Priority: P1)

**Goal**: A guest enters a valid 6-character code and a display name to become a registered participant in the session.

**Independent Test**: Given a known valid session code, submit join form with a display name → land on `/sala/[code]` as a registered participant in the DB.

**Covers**: FR-003, FR-004, FR-005, FR-007, FR-010, FR-011, FR-015, SC-003, SC-004, SC-006, NFR-001, NFR-002, NFR-005

### Migration — participants table

- [ ] T052 [US2] Write migration `005_create_participants.sql`: create `participants` table — file: `supabase/migrations/20260714000005_create_participants.sql`
  - Columns: `id uuid PK DEFAULT gen_random_uuid()`, `session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE`, `display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 32)`, `disambiguation_index smallint NOT NULL DEFAULT 1`, `recovery_token_hash text NOT NULL`, `joined_at timestamptz NOT NULL DEFAULT now()`, `last_seen timestamptz NOT NULL DEFAULT now()`, `created_at timestamptz NOT NULL DEFAULT now()`
  - SQL comment: `-- Vocalis: session participants (guests)`
- [ ] T053 [US2] Write migration `006_participants_indexes.sql`: create indexes for `participants` — file: `supabase/migrations/20260714000006_participants_indexes.sql`
  - `CREATE UNIQUE INDEX participants_session_name_idx ON participants (session_id, display_name, disambiguation_index)`
  - `CREATE INDEX participants_session_id_idx ON participants (session_id)`
  - `CREATE INDEX participants_id_idx ON participants (id)`
- [ ] T054 [US2] Write migration `007_participants_rls.sql`: enable RLS and create policies for `participants` — file: `supabase/migrations/20260714000007_participants_rls.sql`
  - `ALTER TABLE participants ENABLE ROW LEVEL SECURITY`
  - Policy `participants_select_active_session`: `FOR SELECT TO anon, authenticated USING (session_id IN (SELECT id FROM sessions WHERE status != 'closed'))`
  - Policy `participants_insert_blocked`: INSERT blocked (no policy; comment documenting RPC-only inserts)
  - Policy `participants_update_blocked`: UPDATE blocked (no policy; direct updates revoked, allowed only via RPC)
  - Policy `participants_delete_blocked`: DELETE blocked (no policy; comment documenting permanent retention)
- [ ] T055 [US2] Write migration `008_join_session_rpc.sql`: create `join_session(p_code text, p_display_name text)` Postgres function — file: `supabase/migrations/20260714000008_join_session_rpc.sql`
  - `SECURITY DEFINER`, `LANGUAGE plpgsql`, `SET search_path = public, extensions`
  - Step 1: Uppercase-normalize `p_code`
  - Step 2: SELECT session by code → NOT FOUND → `RAISE EXCEPTION 'SESSION_NOT_FOUND'`
  - Step 3: Check `status = 'closed'` → `RAISE EXCEPTION 'SESSION_CLOSED'`; `status = 'paused'` → `RAISE EXCEPTION 'SESSION_PAUSED'`
  - Step 4: COUNT participants WHERE `session_id = session.id` → `>= max_participants` → `RAISE EXCEPTION 'SESSION_FULL'`
  - Step 5: Generate `v_recovery_token = encode(gen_random_bytes(32), 'hex')` and `v_hash = encode(digest(v_recovery_token, 'sha256'), 'hex')`
  - Step 6: Compute `disambiguation_index = COALESCE(MAX(disambiguation_index), 0) + 1 FROM participants WHERE session_id = session.id AND display_name = trim(p_display_name)`
  - Step 7: INSERT participant with `recovery_token_hash = v_hash`. RETURN new row PLUS `v_recovery_token`.
  - `GRANT EXECUTE ON FUNCTION join_session TO anon, authenticated`
- [ ] T056 Write migration `009_recover_participant_rpc.sql`: create `recover_participant(p_participant_id uuid, p_recovery_token text, p_code text)` Postgres function — file: `supabase/migrations/20260714000009_recover_participant_rpc.sql`
  - `SECURITY DEFINER`, `LANGUAGE plpgsql`, `SET search_path = public, extensions`
  - Validates session, participant exists, and `recovery_token_hash` matches hash of `p_recovery_token`.
  - Updates `last_seen` on match. Returns participant row.
  - `GRANT EXECUTE ON FUNCTION recover_participant TO anon, authenticated`

### Apply & Validate Migrations — US2

- [ ] T057 [US2] Apply migrations 005–008 to local Supabase: `supabase db push` — verify `participants` table and `join_session` function exist in Studio
- [ ] T058 [US2] Regenerate TypeScript types: `supabase gen types typescript --local > src/infrastructure/supabase/database.types.ts` — file: `src/infrastructure/supabase/database.types.ts`

### Integration Tests — participants

- [ ] T059 [US2] Write integration tests for `join_session` RPC — file: `src/infrastructure/__tests__/participant.rpc.test.ts`
  - Test: valid code + name → returns participant row with correct `disambiguation_index = 1`
  - Test: same name in same session → second call gets `disambiguation_index = 2`
  - Test: invalid code → exception `SESSION_NOT_FOUND`
  - Test: closed session → exception `SESSION_CLOSED`
  - Test: paused session → exception `SESSION_PAUSED`
  - Test: same `p_participant_id` on second call → returns same row with updated `last_seen` (recovery)
  - Test: 50 participants created → 51st call → exception `SESSION_FULL`
- [ ] T060 [US2] Write integration tests for participants RLS — file: `src/infrastructure/__tests__/participant.rls.test.ts`
  - Test: `anon` role can SELECT from `participants` of active session
  - Test: `anon` role CANNOT SELECT from `participants` of closed session
  - Test: `anon` role CANNOT INSERT directly into `participants`
  - Test: `anon` role CANNOT DELETE from `participants`
  - Test: participant of session A cannot SELECT participants of session B via direct query (cross-session isolation)

### Application Layer — joinSession

- [ ] T061 [US2] Create `joinSession` Server Action — file: `src/application/participant/join-session.action.ts`
  - `'use server'`
  - Input: `FormData` or typed object `{ code: string; displayName: string }`
  - Validates `code` via `validateSessionCode` → returns `AppError(INVALID_CODE_FORMAT)` on failure
  - Validates `displayName` via `validateDisplayName` → returns `AppError(INVALID_NAME)` on failure
  - Reads `vocalis_pid` from cookies (if present, passes to RPC as `p_participant_id`)
  - Calls `join_session(code, displayName, participantId?)` RPC
  - On success: sets `vocalis_pid` cookie (`SameSite: Strict`, `Max-Age: 86400`, path `/sala/${code}`)
  - Maps all RPC exceptions to `AppError` using `errors.types.ts`
  - Returns `AppSuccess<{ participant: Participant; session: Session; isRecovered: boolean }>`
- [ ] T062 [US2] Write unit tests for `joinSession` action with mocked Supabase — file: `src/application/__tests__/join-session.action.test.ts`
  - Test: valid inputs → success result
  - Test: invalid code format → `INVALID_CODE_FORMAT` without calling RPC
  - Test: invalid name (empty) → `INVALID_NAME` without calling RPC
  - Test: RPC throws `SESSION_NOT_FOUND` → returns mapped `AppError`
  - Test: RPC throws `SESSION_FULL` → returns mapped `AppError`
  - Test: sets cookie on success

### UI — displayLabel computation

- [ ] T063 [US2] Create `formatParticipantLabel` pure function — file: `src/domain/participant.utils.ts`
  - `formatParticipantLabel(displayName: string, disambiguationIndex: number): string`
  - Returns `displayName` if `disambiguationIndex === 1`, else `"${displayName} #${disambiguationIndex}"`
- [ ] T064 [US2] Write unit tests for `formatParticipantLabel` — file: `src/domain/__tests__/participant.utils.test.ts`
  - Test: index 1 → no suffix
  - Test: index 2 → `"João #2"`
  - Test: index 3 → `"Maria #3"`

### UI Components — US2

- [ ] T065 [US2] Create `JoinForm` client component — file: `src/components/participant/JoinForm.tsx`
  - `'use client'`
  - Props: `{ initialCode?: string }` (pre-filled from URL)
  - Fields: code input (uppercase-normalized on change, `maxLength={6}`, `inputMode="text"`, `autoCapitalize="characters"`) and display name input (`maxLength={32}`)
  - Submit button `<Button>` with min `h-12` (48px)
  - Uses `useTransition` to call `joinSession` action
  - Inline validation errors below each field (`<p role="alert">`)
  - During pending: spinner + button disabled
  - On success: cookie already set by Server Action; router redirects to `/sala/[code]`
  - On error: toast for session-level errors; inline for field-level errors
  - While offline: submit button disabled with aria label
  - All inputs have explicit `<label>` elements with `htmlFor`
- [ ] T066 [US2] Write component tests for `JoinForm` — file: `src/components/__tests__/JoinForm.test.tsx`
  - Test: renders both fields with accessible labels
  - Test: code field normalizes to uppercase
  - Test: empty name shows inline error before submit
  - Test: spinner shown during pending
  - Test: submit disabled when offline
  - Test: toast shown for SESSION_NOT_FOUND error
- [ ] T067 [US2] Create `ParticipantView` client component — file: `src/components/participant/ParticipantView.tsx`
  - `'use client'`
  - Props: `{ participant: ParticipantView; session: { code: string; status: SessionStatus } }`
  - Displays formatted label (`formatParticipantLabel`) + "Você" badge (only visible to current user; determined by `participant.isCurrentUser`)
  - "Você" badge: uses `aria-label="Este é você"` and is visually styled distinctly (e.g., subtle ring or tag)
  - Shows session status: active → normal; paused → info banner "A fila está pausada."; closed → redirect
  - All text meets WCAG AA contrast ratios
- [ ] T068 [US2] Write component tests for `ParticipantView` — file: `src/components/__tests__/ParticipantView.test.tsx`
  - Test: displays formatted label correctly
  - Test: "Você" badge visible when `isCurrentUser = true`
  - Test: "Você" badge NOT present when `isCurrentUser = false`
  - Test: paused banner shown when `session.status = 'paused'`

### Pages — US2

- [ ] T069 [US2] Create Guest Room Server Component shell — file: `app/sala/[code]/page.tsx`
  - Reads `code` from route params and `vocalis_pid` from request cookies
  - Attempts `recoverParticipant` if cookie present (calls `recover-participant.action.ts`)
  - If recovery succeeds: renders `<ParticipantView participant={...} session={...} />`
  - If recovery fails or no cookie: renders `<JoinForm initialCode={code} />`
  - If session not found or closed: renders `SessionClosedView` inline (full-page message)
  - Shows `<Suspense fallback={<Skeleton>}>` during server-side data fetch

### E2E Tests — US2

- [ ] T070 [US2] Write Playwright E2E test: Guest joins with valid code — file: `e2e/guest-joins-session.spec.ts`
  - Scenario 1: Enter valid code → submit name → land on `/sala/[code]` → see name + "Você" badge
  - Scenario 2: Enter invalid code `XXXXXX` → see toast "Sala não encontrada..."
  - Scenario 3: Submit without name → see inline error
  - Scenario 4: Two guests same name → second guest sees `#2` suffix; each sees "Você" on their own entry
  - Scenario 5: Simulate 50 participants in DB → 51st join attempt → see SESSION_FULL toast
  - Scenario 6: Offline simulation → submit button disabled; no false success shown
  - Viewport: iPhone 14 (390×844)

**Checkpoint — US2**: Guest can join independently of US1 implementation (given a pre-seeded session). All US2 tests pass. ✅

---

## Phase 5: User Story 3 — Participant Recovery & Reconnection (from NFR-004, contracts/recover-participant.md)

**Goal**: A participant who refreshes the page, closes the tab, or loses connection is restored to their room view without re-entering their name or creating a duplicate record.

**Independent Test**: Given a session with a joined participant and their `vocalis_pid` cookie, navigate to `/sala/[code]` → participant view is shown without the join form; no new row in `participants` table.

**Covers**: NFR-003, NFR-004, NFR-006, SC-005, FR-010 (stable identity after refresh)

### Application Layer — recoverParticipant

- [ ] T071 [US3] Create `recoverParticipant` Server Action — file: `src/application/participant/recover-participant.action.ts`
  - `'use server'`
  - Reads `vocalis_pid` cookie server-side
  - Parses JSON to extract `participantId` and `recoveryToken`
  - Calls `recover_participant` Postgres RPC via server Supabase client
  - Returns `ok: true` and participant row if RPC succeeds
  - If RPC fails (e.g. invalid token, not found, session closed) → returns `{ ok: false, code: ... }` silently
- [ ] T072 [US3] Write unit tests for `recoverParticipant` with mocked Supabase — file: `src/application/__tests__/recover-participant.action.test.ts`
  - Test: valid cookie + valid participant → returns success with updated `lastSeen`
  - Test: missing cookie → returns error silently
  - Test: invalid UUID → returns error without DB call
  - Test: session closed → returns error silently
  - Test: participant not in session → returns error silently
  - Test: same action called twice → `last_seen` updated both times; no duplicate participant

### PWA — Service Worker & Offline

- [ ] T073 [US3] Create PWA manifest — file: `app/manifest.ts`
  - Next.js `MetadataRoute.Manifest` format
  - `name: "Vocalis"`, `short_name: "Vocalis"`, `display: "standalone"`, `background_color: "#09090b"`, `theme_color: "#09090b"`, `start_url: "/"`
  - References icons at `/icons/icon-192.png` and `/icons/icon-512.png`
- [ ] T074 [US3] Generate and place PWA icons: create two simple PNG placeholders (192×192 and 512×512) with a dark background and a white "V" letter — files: `public/icons/icon-192.png`, `public/icons/icon-512.png`
- [ ] T075 [US3] Create manual service worker with app shell caching strategy — file: `public/sw.js`
  - Cache name: `vocalis-shell-v1`
  - On `install`: pre-cache `["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]`
  - On `fetch`: cache-first for shell assets; network-first for everything else
  - Explicitly excludes API responses and Supabase URLs from cache (matches `supabase.co` origin → always network)
  - On `activate`: delete old caches
- [ ] T076 [US3] Register service worker in root layout — file: `app/layout.tsx` (Depends on T075)
  - Add inline `<script>` that calls `navigator.serviceWorker.register('/sw.js')` (only in browser context, guarded by `typeof window !== 'undefined'`)
  - Does not use `next/script` to avoid hydration issues with SW registration timing
- [ ] T077 [US3] Add `<link rel="manifest">` and Apple PWA meta tags to root layout `<head>` — file: `app/layout.tsx` (Depends on T073)
  - `<link rel="manifest" href="/manifest.webmanifest">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  - `<link rel="apple-touch-icon" href="/icons/icon-192.png">`


### UI — Recovery skeleton & reconnection

- [ ] T078 [US3] Update `app/sala/[code]/page.tsx` to show a `<Skeleton>` full-screen loader during Suspense while server attempts recovery — file: `app/sala/[code]/page.tsx` (Depends on T069)
  - Uses `<Suspense fallback={<ParticipantSkeleton />}>`
- [ ] T079 [US3] Create `ParticipantSkeleton` component — file: `src/components/participant/ParticipantSkeleton.tsx`
  - Uses shadcn/ui `<Skeleton>` primitives
  - Renders approximate layout of `ParticipantView` (name area, status area)
  - Has `aria-label="Carregando sua sessão..."` for screen readers

### E2E Tests — US3

- [ ] T080 [US3] Write Playwright E2E test: participant recovery after refresh — file: `e2e/participant-recovery.spec.ts`
  - Scenario 1: Join session → refresh page → assert participant view shown (not join form); assert no new row in `participants` table (count remains 1)
  - Scenario 2: Join session → close tab → reopen `/sala/[code]` → assert recovery works within 24h cookie window
  - Scenario 3: Join session → simulate offline → go online → assert offline banner dismissed; assert participant view intact
  - Scenario 4: No cookie → navigate to `/sala/[code]` → assert join form is shown
  - Scenario 5: Cookie with invalid UUID → navigate to `/sala/[code]` → assert join form shown (silent error)
  - Scenario 6: Retry `joinSession` with same name after network error → assert only one participant row exists (idempotency via `vocalis_pid` cookie)
  - Viewport: iPhone 14 (390×844)

**Checkpoint — US3**: Participant identity survives refresh, reconnection, and retry without duplicates. Offline read-only behavior confirmed. PWA installable. All US3 tests pass. ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality gate before feature is considered complete.

- [ ] T081 Accessibility audit: verify all interactive elements in `CreateSessionButton`, `JoinForm`, `ParticipantView`, `SessionCodeDisplay` have accessible labels, keyboard focus styles, and meet 48px minimum touch target — no new files created; document issues
- [ ] T082 Apply accessibility fixes identified in T081 to all affected components
- [ ] T083 Mobile review: open app in Playwright with iPhone 14 viewport and manually verify all screens have no horizontal overflow, no text clipped, buttons fully tappable — document results
- [ ] T084 Security audit: grep for `SUPABASE_SERVICE_ROLE_KEY` in all `src/components/` and `app/` files — must return zero results; grep for `service_role` in any Client Component — file: no new file, run as CI check
- [ ] T085 Error message review: verify all `USER_MESSAGES` in `src/domain/errors.types.ts` are in PT-BR, complete sentences, and match strings defined in `contracts/` files — file: `src/domain/errors.types.ts`
- [ ] T086 Review `public/sw.js` cache exclusions: verify that `*.supabase.co` URLs and all `NEXT_DATA` paths are excluded from cache — file: `public/sw.js`
- [ ] T087 Validate `.env.example` is complete and matches all variables consumed in `src/infrastructure/env.ts` — file: `.env.example`
- [ ] T088 Run full test suite: `npm run typecheck && npx vitest run && npx playwright test` — all must pass; document any failures
- [ ] T089 Run production build: `npm run build` — must complete without TypeScript errors or warnings — no new files
- [ ] T090 Validate manual acceptance criteria from `specs/001-room-access-mvp/quickstart.md` Flows 1–6 and RLS validation steps — document pass/fail for each scenario

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion — **BLOCKS all user stories**
- **Phase 3 (US1)**: Depends on Phase 2 — no dependency on US2 or US3
- **Phase 4 (US2)**: Depends on Phase 2 — no dependency on US1 *(but requires a valid session to test; seed one or run US1 first)*
- **Phase 5 (US3)**: Depends on Phase 2 + Phase 4 (recovery requires a joined participant) — US1 optional but recommended
- **Phase 6 (Polish)**: Depends on Phases 3, 4, 5

### User Story Dependencies

```
Phase 1 → Phase 2 → US1 (Phase 3) ─────────────────────────────┐
                  → US2 (Phase 4) → US3 (Phase 5) → Polish (Phase 6)
```

- **US1 and US2** are both P1 priority; they can start in parallel after Phase 2, but US2 tests require a session to exist (seed via DB or run US1 first)
- **US3** requires a participant record from US2 to test recovery meaningfully

### Tasks Blocking ALL Stories

| Task | Why Blocking |
|---|---|
| T013–T016 (env + Supabase clients) | Every story needs the Supabase clients |
| T017–T020 (domain types + errors) | All actions and components depend on these types |
| T021–T024 (validators) | Both join and create actions use validators |
| T025 (Supabase start) | Migrations cannot run without local Supabase |
| T027–T028 (layout + CSS) | All pages share the root layout and theme |

### Parallel Opportunities

```bash
# Phase 2 — these can run simultaneously:
T013 (env.ts) + T017 (session.types.ts) + T018 (participant.types.ts) + T019 (errors.types.ts)
T021 (code validator) + T022 (name validator)
T031 (OfflineBanner) + T029 (useOnlineStatus)

# Phase 3 + Phase 4 — after Phase 2:
T034–T037 (session migrations) can run while T052–T055 (participant migrations) are being written
# BUT: migrations must be APPLIED sequentially: 001 before 002 before 003...

# Within US1:
T046 (SessionCodeDisplay) + T044 (CreateSessionButton)  [different files]
T047 (SessionCodeDisplay tests) + T045 (CreateSessionButton tests) [different files]

# Within US2:
T065 (JoinForm) + T067 (ParticipantView) [different files]
T066 (JoinForm tests) + T068 (ParticipantView tests) [different files]
T063 (formatParticipantLabel) + T065 (JoinForm) [different files, no dependency]
```

### MVP Delivery Strategy

**MVP = US1 complete**

1. Complete Phase 1 + Phase 2 → foundation ready
2. Complete US1 (Phase 3) → Host can create a session and share the code → **DEMO-ABLE**
3. Complete US2 (Phase 4) → Guest can join → **CORE LOOP DEMO-ABLE**
4. Complete US3 (Phase 5) → Recovery and offline resilience → **PRODUCTION-READY**
5. Complete Phase 6 (Polish) → Quality gate passed → **RELEASABLE**

### Independent Story Validation Criteria

| Story | Pass Criterion |
|---|---|
| US1 | Host creates session, 6-char code visible, copy works, offline blocks creation. DB has 1 `sessions` row. All US1 Playwright tests pass. |
| US2 | Guest joins with valid code, `participants` row created, "Você" tag visible. Duplicate names get `#2` suffix. 51st participant rejected. All US2 Playwright tests pass. |
| US3 | Page refresh restores participant view without new DB row. Offline shows cached UI. PWA installable in Chrome. All US3 Playwright tests pass. |

---

## Notes

- `[P]` = different files, no shared dependencies — safe to implement concurrently
- `[USx]` maps each task to its user story for traceability
- Each story's checkpoint is independently verifiable without the other stories being complete
- All migrations are numbered sequentially; apply with `supabase db push` in order
- After any migration: regenerate types with `supabase gen types typescript --local > src/infrastructure/supabase/database.types.ts`
- Do not implement Supabase Realtime in this feature — deferred to queue feature per RD-007
- Do not implement `is_online` column — deferred to presence feature per data-model.md decision
- The `vocalis_pid` cookie is the only guest identity mechanism; `localStorage` is NOT used for authorization
