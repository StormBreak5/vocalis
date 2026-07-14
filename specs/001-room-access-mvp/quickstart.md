# Quickstart: Room Access MVP

**Feature**: `001-room-access-mvp`
**Date**: 2026-07-14

---

## Prerequisites

| Tool | Minimum version | Check |
|---|---|---|
| Node.js | 20.x | `node --version` |
| npm | 10.x | `npm --version` |
| Supabase CLI | 1.200+ | `supabase --version` |
| Git | any | `git --version` |

---

## 1. Environment Variables

Create `.env.local` in the project root (never commit this file):

```bash
# Supabase project URL (from dashboard → Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co

# Supabase anon/public key (safe to expose in the browser)
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Supabase service role key — NEVER exposed to the browser
# Used only in server-side scripts (e.g., seeding, migration verification)
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

> See `.env.example` for the full list of required variables.

---

## 2. Local Supabase Setup

```bash
# Initialize Supabase locally (first time only)
supabase init

# Start local Supabase stack (PostgreSQL + Auth + Studio)
supabase start

# Output includes:
#   API URL:      http://127.0.0.1:54321
#   Anon Key:     eyJ...
#   Studio:       http://127.0.0.1:54323
```

Update `.env.local` with the local values printed by `supabase start`.

---

## 3. Run Migrations

```bash
# Apply all migrations to local Supabase
supabase db push

# Verify migrations applied
supabase db diff   # should output nothing if DB is in sync
```

Expected tables after migration:
- `public.sessions`
- `public.participants`

Expected Postgres functions after migration:
- `public.create_session(p_host_id uuid)`
- `public.join_session(p_code text, p_display_name text, p_participant_id uuid DEFAULT NULL)`

---

## 4. Enable Anonymous Auth

In the Supabase Dashboard (or local Studio at `http://127.0.0.1:54323`):

1. Go to **Authentication → Providers**.
2. Enable **Anonymous Sign-ins**.

---

## 5. Generate TypeScript Types

```bash
# Generate types from local Supabase schema
supabase gen types typescript --local > src/infrastructure/supabase/database.types.ts
```

Run this after every migration to keep types in sync.

---

## 6. Install Dependencies

```bash
# Install production + dev dependencies
npm install

# Install Supabase SSR + JS client
npm install @supabase/supabase-js @supabase/ssr

# Install Lucide icons
npm install lucide-react

# Initialize shadcn/ui (follow prompts: dark mode, CSS variables)
npx shadcn@latest init

# Add required shadcn components
npx shadcn@latest add button input label toast card skeleton
```

---

## 7. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 8. Run Tests

```bash
# Unit tests (Vitest)
npx vitest run

# Unit tests in watch mode
npx vitest

# E2E tests (Playwright) — requires dev or built server
npx playwright test

# E2E tests with browser UI
npx playwright test --ui
```

---

## 9. Manual Flow Validation

### Flow 1: Host Creates a Session

1. Open [http://localhost:3000](http://localhost:3000).
2. Click **"Criar Sala"**.
3. ✅ Expected: Loading spinner appears on button.
4. ✅ Expected: Redirected to `/sala/[CODE]/dj`.
5. ✅ Expected: A 6-character code is prominently displayed.
6. ✅ Expected: Copy button and share button are visible.

### Flow 2: Guest Joins with Valid Code

1. Open [http://localhost:3000](http://localhost:3000) in a different browser / incognito.
2. Enter the code from Flow 1.
3. Click **"Entrar"** or proceed to name form.
4. Enter a display name (e.g., `João`).
5. Click **"Entrar na Sala"**.
6. ✅ Expected: Loading spinner appears.
7. ✅ Expected: Redirected to `/sala/[CODE]`.
8. ✅ Expected: Name displayed with **"Você"** tag.

### Flow 3: Participant Recovery after Refresh

1. After completing Flow 2, press **F5** or navigate away and back to `/sala/[CODE]`.
2. ✅ Expected: Skeleton loader appears briefly.
3. ✅ Expected: Participant view is restored **without** showing the join form again.
4. ✅ Expected: No new row is created in the `participants` table (verify in Supabase Studio).

### Flow 4: Invalid Code

1. Open [http://localhost:3000](http://localhost:3000).
2. Enter `XXXXXX` (a non-existent code).
3. ✅ Expected: Toast appears: *"Sala não encontrada. Verifique o código e tente novamente."*

### Flow 5: Offline Behavior

1. In Chrome DevTools → Network → set to **Offline**.
2. Attempt to click **"Criar Sala"**.
3. ✅ Expected: Error toast appears; no redirect occurs.
4. Set network back to **Online**.
5. ✅ Expected: Offline banner (if shown) dismisses; actions re-enable.

### Flow 6: Duplicate Name Disambiguation

1. Join session as `Maria` (first guest).
2. Join the same session as `Maria` from a different device/browser.
3. ✅ Expected: Second guest's display name shows as **`Maria #2`**.
4. ✅ Expected: Each guest sees **"Você"** next to their own name only.

---

## 10. RLS Policy Validation

Use `psql` connected to local Supabase for full session control. The Supabase Studio SQL Editor may not support setting arbitrary session variables safely.

```sql
-- Test 1: anon role can SELECT active sessions
SET ROLE anon;
SELECT * FROM sessions WHERE status = 'active'; -- should return rows

-- Test 2: anon role cannot INSERT into sessions directly
INSERT INTO sessions (host_id, code, status) VALUES (gen_random_uuid(), 'TEST00', 'active');
-- Expected: ERROR (RLS or permission denied)

-- Test 3: authenticated host can UPDATE their own session
SET ROLE authenticated;
-- Set claims for the current psql session
SET request.jwt.claims TO '{"sub": "<host-uuid>", "role": "authenticated"}';
UPDATE sessions SET status = 'paused' WHERE host_id = '<host-uuid>';
-- Expected: 1 row updated

-- Test 4: authenticated user cannot UPDATE another host's session
UPDATE sessions SET status = 'closed' WHERE host_id != '<host-uuid>';
-- Expected: 0 rows updated (RLS filters it out silently)

-- Test 5: anon role cannot INSERT or UPDATE participants directly
SET ROLE anon;
INSERT INTO participants (session_id, display_name, recovery_token_hash) VALUES ('<session-id>', 'Hacker', 'hash');
-- Expected: ERROR (permission denied)
UPDATE participants SET display_name = 'Hacked';
-- Expected: ERROR (permission denied)

-- Clean up claims
RESET request.jwt.claims;
RESET ROLE;
```

---

## 11. Playwright E2E Scenarios

These scenarios map directly to spec success criteria:

| Scenario | Spec ref |
|---|---|
| Host creates session → code displayed | SC-001, SC-002, FR-001, FR-002 |
| Guest enters valid code + name → joins | SC-003, FR-003, FR-005 |
| Guest refreshes → identity recovered, no duplicate | NFR-004, FR: recovery |
| Guest enters invalid code → error toast | SC-004, FR-003 |
| Two guests with same name → suffixes shown | FR-010, FR-011 |
| Offline simulation → no false success | SC-005, NFR-003 |
| Host cannot access another host's session | NFR-005 |
| Session full (51st participant) → rejection | SC-006, FR-015 |
