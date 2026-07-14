# Research: Room Access MVP

**Feature**: `001-room-access-mvp`
**Date**: 2026-07-14
**Purpose**: Resolve all technical unknowns before Phase 1 design

---

## RD-001: PWA Strategy with Next.js 16

**Decision**: Manual PWA implementation using the native `app/manifest.ts` API and a hand-authored service worker registered via `next.config.ts`.

**Rationale**: Next.js 16 defaults to Turbopack. Serwist and next-pwa rely on Webpack plugin hooks that are incompatible with Turbopack without forcing `--webpack`. For the MVP scope (offline read-only cache + installability), a manual approach is sufficient, avoids build complexity, and produces no additional third-party dependency. The native `manifest.ts` file covers all required PWA metadata. The service worker only needs to cache the app shell and static assets — no push notifications or background sync required for this feature.

**Alternatives considered**:
- `serwist` with `--webpack` flag: Works but ties the project to a deprecated bundler path.
- `next-pwa`: Unmaintained since 2023; not compatible with Next.js 15+.
- `@ducanh2912/next-pwa`: Active fork; viable if advanced precaching is needed later.

**Tracking requirement**: NFR-003, NFR-004, NFR-006 (offline read-only cache).

---

## RD-002: Supabase Auth — Anonymous + Permanent Account Strategy

**Decision**: Use `@supabase/ssr` for all server-side auth (Server Actions, Server Components). Anonymous sign-in via `supabase.auth.signInAnonymously()` executed as a Server Action on first Host access. Anonymous users can later link a permanent provider (Google OAuth or email/password) to the same `auth.uid()` without changing their `host_id`.

**Key points**:
- Anonymous users receive the `authenticated` Postgres role, so RLS policies apply equally.
- RLS must distinguish anonymous vs. permanent hosts using `(auth.jwt() ->> 'is_anonymous')::boolean`.
- `supabase.auth.getUser()` (server-side) is used to verify identity — never `getSession()` alone.
- For Guests/Participants, no Supabase Auth account is created. Identity is a `participant_id` UUID stored in a cookie or `localStorage`, recovered on reconnect. This avoids requiring guests to sign up.

**Tracking requirement**: FR-001 (Host creation), FR-003 (Guest join), NFR-005 (security).

---

## RD-003: Guest Identity Without Supabase Auth

**Decision**: Guests do not authenticate via Supabase Auth. Instead, on successful join, the system generates a stable `participant_id` (UUID) AND a high-entropy `recovery_token`. Only the `recovery_token_hash` is persisted in the database. The plain token is returned exactly once. Both the ID and token are stored in the browser via an `HttpOnly`, `SameSite=Lax`, `Secure` cookie (`vocalis_pid`).

On page refresh or re-navigation to `/sala/[code]`, the app reads the cookie and verifies both the `participant_id` and the `recovery_token` against the hash in the `participants` table via a specific `SECURITY DEFINER` function. If found, it skips the join form and restores the participant view (FR: recovery / idempotency).

**Why not Supabase Auth for guests**: Requiring sign-up creates friction in a bar setting and contradicts the spec's principle of minimal touches. A secure recovery token stored client-side is sufficient for this read-mostly role. Knowing the `participant_id` alone is not enough to impersonate or update a participant.

**RLS implication**: The `participants` table uses `session_id` + code validation performed in a Server Action. Guests do not have `auth.uid()`. RLS for participant reads uses `anon` role with a session-scoped filter. Write operations (INSERT participant) are performed via a **Postgres RPC** running as `SECURITY DEFINER` to ensure atomicity and bypass the limitation that the anon role cannot directly insert with guaranteed idempotency.

**Tracking requirement**: FR-003, FR-005, FR-007, NFR-004 (reconnection).

---

## RD-004: Server Actions vs. Route Handlers vs. RPCs

**Decision matrix**:

| Operation | Mechanism | Rationale |
|---|---|---|
| Create session | Server Action | Needs auth context (`host_id`); atomic; no public URL needed |
| Join session (guest) | Postgres RPC (`join_session`) via Server Action | Must be atomic (validate code + insert participant + return ID); idempotent by design |
| Get session by code | Server Component data fetch | Read-only; no side effects; benefits from RSC streaming |
| Recover participant | Server Action | Reads cookie, validates against DB, returns participant data |

**Why RPC for join**: The join operation must: (1) validate the session code exists and is `active`, (2) check the 50-participant limit, (3) compute `disambiguation_index`, (4) insert or return existing participant — all atomically. A single Postgres function handles this without race conditions. It runs as `SECURITY DEFINER`.

**Tracking requirement**: FR-003, FR-005, FR-015 (limits), SC-003.

---

## RD-005: shadcn/ui on Next.js 16 + React 19

**Decision**: Install via `npx shadcn@latest init`. Use `--legacy-peer-deps` if npm raises peer dependency conflicts with React 19. Components are copied into `src/components/ui/` and owned by the project.

**Tailwind CSS**: Already at v4 (confirmed by `@tailwindcss/postcss` in `devDependencies`). shadcn/ui v2+ supports Tailwind v4 with CSS-variable–based theming.

**Dark mode**: Configured via `class` strategy in Tailwind config; `<html>` element gets `dark` class by default (no system-preference toggle in MVP).

**Tracking requirement**: Constitution Principle II (Mobile First), IV (shadcn/ui preferred).

---

## RD-006: Testing Stack

**Decision**: **Vitest** (unit + component) + **Playwright** (E2E).

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest + React Testing Library | Domain logic, validators, hooks |
| RLS / Integration | Supabase local via `supabase test` or psql | Migration correctness, RLS policies |
| E2E | Playwright | Full user flows against local dev build |

**Why Vitest over Jest**: Native ESM, Vite-native, faster, Jest-compatible API, zero config with TypeScript.
**Why Playwright over Cypress**: Better async Server Component support, first-class mobile viewports, maintained by Microsoft.

**Supabase RLS tests**: Use `supabase db test` (pgTAP) or direct psql assertions in a local Supabase instance to validate each policy.

**Tracking requirement**: Constitution Principle VI (Quality), spec test scenarios 1–8.

---

## RD-007: Realtime Scope for MVP

**Decision**: Supabase Realtime is **NOT used** in this MVP feature. The only real-time data surfaces (participant list, session status) are loaded on navigation and do not require live updates for the Room Access MVP scope (no queue display yet).

Realtime will be introduced in the queue management feature, where live queue updates are a core requirement (FR-009, FR-014). For now, `useEffect` + Supabase browser client is reserved for future features.

**This avoids**: Unnecessary client components, bundle weight, and Realtime channel management in a scope where they add no user value.

**Tracking requirement**: Constitution Principle V (Performance by Default), Constitution Principle VI (Simplicity).

---

## RD-008: 6-Character Code Generation Strategy

**Decision**: Generate the code in a Postgres function using `gen_random_bytes` from the `pgcrypto` extension, mapped to a 32-character alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) that excludes visually ambiguous characters (0/O, 1/I). The `pgcrypto` extension must be enabled (typically in the `extensions` schema) before creating the function. Uniqueness is enforced by a `UNIQUE` constraint on `sessions.code`. Collision is handled by retrying up to 5 times within the function before raising a user-translated error.

**Security Consideration**: 6-character codes can be enumerated. Error responses must not leak internal state. Rate limiting is a necessary control before production to mitigate brute-force enumeration.

**Why server-side generation**: Prevents client-forgeable codes and avoids round-trip validation.
**Why the restricted alphabet**: Improves readability when shared verbally or written on a chalkboard.

**Tracking requirement**: FR-002, SC-002.
