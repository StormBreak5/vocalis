# Implementation Plan: Room Access MVP

**Branch**: `001-room-access-mvp` | **Date**: 2026-07-14
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)
**Data Model**: [data-model.md](./data-model.md)

---

## Summary

Implement the foundational access layer of Vocalis: a Host creates a karaoke session (generating a unique 6-char code), and a Guest joins via that code by providing a display name. The feature establishes the `sessions` and `participants` database entities, the Supabase Auth strategy (anonymous + upgradable), participant recovery after reconnection, and the full offline-resilient UI flow.

No queue management, music features, or DJ panel are implemented in this phase.

---

## Constitution Check

*Reference: `.specify/memory/constitution.md` — Vocalis Constitution v1.0.0*

- [x] **I. Clean Architecture**: Business logic lives in `src/application/`; UI components in `src/components/`; Supabase access in `src/infrastructure/`; domain types in `src/domain/`.
- [x] **II. Mobile First & PWA**: Dark mode default via Tailwind `dark` class on `<html>`; all touch targets ≥ 48px; every async op has spinner/skeleton/toast; manual PWA service worker + `manifest.ts`.
- [x] **III. Database-Enforced Integrity**: Session code uniqueness via `UNIQUE` index; participant idempotency via RPC; RLS on all tables; Supabase errors mapped to PT-BR messages. Realtime is deferred for this feature (documented in Complexity Tracking).
- [x] **IV. Typed & DRY Code**: TypeScript `strict: true` (already in `tsconfig.json`); shared error types in `src/domain/errors.ts`; shadcn/ui components used for all UI primitives.
- [x] **V. Performance by Default**: Landing page and session lookup are Server Components; only join form and participant view are Client Components (form state); no Realtime subscriptions in this feature.
- [x] **VI. Quality & Simplicity**: No premature abstractions; RPC chosen only where atomicity is genuinely required; manual PWA instead of bundler plugin.

**Deviation recorded**: None.

---

## Technical Context

| Concern | Choice | Version / Notes |
|---|---|---|
| Framework | Next.js App Router | 16.2.10 (current in repo) |
| Language | TypeScript | 5.x, `strict: true` ✅ |
| Styling | Tailwind CSS | v4 (`@tailwindcss/postcss` already installed) |
| UI Components | shadcn/ui | Latest; install with `npx shadcn@latest init` |
| Icons | Lucide React | Install: `npm install lucide-react` |
| Backend / Auth | Supabase + `@supabase/ssr` | Anonymous + upgradable account |
| PWA | Manual: `app/manifest.ts` + service worker | No serwist (Turbopack incompatibility — see RD-001) |
| Testing | Vitest + Playwright | See RD-006 |
| Performance | Server Components default | Client Components only for form state |

---

## Project Structure

### Documentation

```
specs/001-room-access-mvp/
├── spec.md
├── research.md
├── data-model.md
├── plan.md               ← this file
├── quickstart.md
├── checklists/
│   └── requirements.md
└── contracts/
    ├── create-session.md
    ├── get-session-by-code.md
    ├── join-session.md
    └── recover-participant.md
```

### Source Code

```
app/
├── manifest.ts                         # PWA manifest (Server Component)
├── layout.tsx                          # Root layout — sets dark class, loads fonts
├── page.tsx                            # Landing page (Server Component)
│                                       # Shows: "Criar Sala" + "Entrar com Código" CTA
├── sala/
│   └── [code]/
│       ├── page.tsx                    # Guest room page (Server Component shell)
│       │                               # Loads session by code; renders JoinForm or ParticipantView
│       └── dj/
│           └── page.tsx                # Host dashboard (Server Component shell)
│                                       # Verifies host ownership; renders SessionCodeDisplay
public/
├── sw.js                               # Manual service worker (app shell cache)
├── icons/                             # PWA icons (192, 512px)
└── ...

src/
├── domain/
│   ├── session.types.ts               # Session, SessionStatus types
│   ├── participant.types.ts           # Participant, ParticipantRecovery types
│   └── errors.types.ts               # AppError, ErrorCode union types + user messages
│
├── application/
│   ├── session/
│   │   └── create-session.action.ts  # 'use server' — creates session via RPC
│   └── participant/
│       ├── join-session.action.ts    # 'use server' — calls join_session RPC
│       └── recover-participant.action.ts # 'use server' — recovery flow
│
├── infrastructure/
│   └── supabase/
│       ├── client.ts                  # Browser client (public anon key)
│       ├── server.ts                  # Server client (cookie-based, @supabase/ssr)
│       └── queries/
│           └── session.queries.ts     # getSessionByCode — used in Server Components
│
└── components/
    ├── ui/                            # shadcn/ui components (Button, Input, Toast, etc.)
    ├── session/
    │   ├── CreateSessionButton.tsx    # 'use client' — triggers createSession action
    │   └── SessionCodeDisplay.tsx     # 'use client' — shows code + share button
    └── participant/
        ├── JoinForm.tsx               # 'use client' — code + name inputs
        └── ParticipantView.tsx        # 'use client' — shows "you're in" + room info
```

---

## Architecture Decisions

### A1: Server Actions over Route Handlers

Server Actions are used for `createSession`, `joinSession`, and `recoverParticipant`. They execute server-side code without exposing an HTTP endpoint, colocate with the calling component tree, and integrate naturally with Next.js form handling and loading states.

Route Handlers (API routes) are avoided for this feature — they would add unnecessary URL surface area and require manual CSRF protection.

### A2: SECURITY DEFINER RPCs for Atomic Operations

`join_session` and `create_session` run as `SECURITY DEFINER` Postgres functions. This ensures:
- Atomicity: validation + insert happen in a single transaction.
- Security: the anon role never directly writes to `sessions` or `participants`.
- Idempotency: the RPC handles duplicate-join detection internally.

### A3: Guest Identity via Cookie (No Supabase Auth)

Guests receive a high-entropy `recovery_token` upon joining, alongside a public `participant_id`. The DB stores only a `recovery_token_hash`. Both values are stored in a `vocalis_pid` cookie (`HttpOnly: true`, `SameSite: Lax`, `Secure` in production). This is sufficient for recovery without requiring Supabase Auth signup. `participant_id` is NOT treated as a secret.

RLS for participants blocks direct `UPDATE`. All updates to participants (like updating `last_seen`) must be done through a specific `SECURITY DEFINER` RPC that requires and validates both the `participant_id` and the `recovery_token`.

### A5: Security against Code Enumeration
Since 6-character codes can be enumerated:
- Error responses must not expose internal data or sensitive details during invalid queries.
- Rate limiting is required as a control. If the current infrastructure supports it without unapproved dependencies, it will be added; otherwise, this control is recorded as an accepted risk for MVP development but is **mandatory** before public production exposure. Code entropy alone does not eliminate this risk.

### A4: Offline = Read-Only with Cached Shell

The service worker caches the app shell (HTML, JS, CSS, fonts). When offline:
- Previously loaded pages are served from cache.
- A top banner appears: *"Sem conexão. Visualizando dados salvos."*
- All form submit buttons are disabled.
- On reconnect, the page re-validates session state automatically.

No optimistic offline writes are implemented (per spec decision Q4).

---

## RLS Policy Plan

### `sessions` table

| Operation | Role | Condition | Notes |
|---|---|---|---|
| SELECT | `anon`, `authenticated` | `status != 'closed'` | Anyone can look up active/paused sessions by code |
| INSERT | Blocked for all roles | — | Only via `create_session` SECURITY DEFINER RPC |
| UPDATE | `authenticated` | `host_id = auth.uid()` | Host can update status (pause/resume/close) |
| DELETE | Blocked | — | Sessions are never deleted |

### `participants` table

| Operation | Role | Condition | Notes |
|---|---|---|---|
| SELECT | `anon`, `authenticated` | `session_id IN (SELECT id FROM sessions WHERE status != 'closed')` | Read participants of active sessions |
| INSERT | Blocked for all roles | — | Only via `join_session` SECURITY DEFINER RPC |
| UPDATE | Blocked for all roles | — | Direct UPDATE is revoked. Updates exclusively via SECURITY DEFINER function validating `recovery_token`. |
| DELETE | Blocked | — | Participants are never deleted (history) |

> **Authority clarification**: RLS is the enforcement layer; Server Actions are the orchestration layer. A rule defined in both layers (e.g., session code validation) has the DB as the authority — the Server Action validation is a UX fast-fail only.

---

## Offline & Network Resilience Plan

| Scenario | Behavior |
|---|---|
| First open without internet | Service worker serves cached app shell; join form shown; submit disabled with offline message |
| Network drops during `createSession` | Server Action throws network error; UI shows toast: *"Sem conexão. Verifique sua internet."*; session is NOT created |
| Network drops during `joinSession` | Same as above; participant is NOT created; form remains ready to retry |
| Request sent, no response received | Server Action times out (Next.js default); UI shows error toast; user can retry safely (idempotent via `participantId` cookie) |
| Page refresh | `recoverParticipant` Server Action runs automatically; if found, skip form |
| Browser close + reopen | Same as page refresh (cookie persists for 24h) |
| Connection returns | `navigator.onLine` listener + Supabase client reconnection; offline banner dismissed; form re-enabled |
| Duplicate retry (same participantId) | `join_session` RPC returns existing row; `isRecovered: true`; no duplicate created |

---

## UI Screens & States

### Landing Page (`/`)

**Type**: Server Component
**Components**: `CreateSessionButton` (client), `JoinForm` (client)
**States**:
- Default: Two CTAs — "Criar Sala" + "Entrar em uma Sala"
- Offline: Both actions disabled with tooltip; offline banner shown
- Creating: Button shows spinner; disabled

### Host Dashboard (`/sala/[code]/dj`)

**Type**: Server Component (shell) + Client Components
**Components**: `SessionCodeDisplay`
**States**:
- Default: Large room code with copy button + share button (Web Share API)
- Offline: Code display static; management actions disabled

### Guest Room (`/sala/[code]`)

**Type**: Server Component (shell) + Client Components
**States**:
- Recovery in progress: Full-screen skeleton
- Join form: Code field (pre-filled from URL) + Name field + Submit button
- Joined: Participant view showing name with "Você" tag + session status
- Session paused: Banner "A fila está pausada."
- Session closed: Full-page message "Esta sessão foi encerrada."
- Offline: Offline banner; content from cache if available

---

## Complexity Tracking

### RD-001: Manual PWA Service Worker
- **Decision**: Use a manual service worker and native `manifest.ts` instead of a plugin.
- **Reason**: Next.js 16 defaults to Turbopack, which is incompatible with `serwist` or `next-pwa` plugins without forcing Webpack.
- **Rejected Alternatives**: `serwist` and `next-pwa` (would tie project to legacy Webpack bundler).
- **Risks**: Missing advanced precaching capabilities provided by Workbox.
- **Mitigation**: The manual app shell cache is sufficient for the MVP's read-only offline requirement.
- **Review Criteria**: Revisit this decision if future features require complex offline synchronization or background push notifications.

### RD-007: Realtime Deferral
- **Decision**: Supabase Realtime is not implemented in this feature.
- **Reason**: The Room Access MVP does not have any requirement for simultaneous live updates between clients (e.g., the participant list is not required to update instantly on other screens). Polling remains strictly forbidden.
- **Future Mandate**: The adoption of Supabase Realtime is mandatory when the Queue feature is introduced (where live updates of the singing order are a core requirement).
---

## Verification Plan

### Automated Tests

```bash
# Unit tests (domain logic, validators)
npx vitest run

# E2E tests (full user flows)
npx playwright test
```

### Manual Verification

See [quickstart.md](./quickstart.md) for step-by-step validation of each flow including RLS policy checks.
