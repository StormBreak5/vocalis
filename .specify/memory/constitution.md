<!--
  SYNC IMPACT REPORT
  ==================
  Version Change: [TEMPLATE] → 1.0.0 (initial ratification)

  Modified Principles:
    - All principles are NEW (first ratification from template)

  Added Sections:
    - I. Clean Architecture (architecture principle)
    - II. Mobile First & PWA (interface principle)
    - III. Database-Enforced Integrity (backend principle)
    - IV. Typed & DRY Code (code quality principle)
    - V. Performance by Default (performance principle)
    - VI. Quality & Simplicity (quality principle)
    - Technology Stack (additional constraints section)
    - Routing & Source Structure
    - Governance

  Templates Updated:
    - ✅ .specify/templates/plan-template.md — Constitution Check gates reflect Vocalis principles (see notes below)
    - ✅ .specify/templates/spec-template.md — No structural changes required; aligns with existing format
    - ✅ .specify/templates/tasks-template.md — Existing path conventions compatible; no changes needed
    - ✅ .specify/templates/constitution-template.md — Blank master template intentionally unchanged

  Deferred TODOs:
    - None
-->

# Vocalis Constitution

## Core Principles

### I. Clean Architecture (NON-NEGOTIABLE)

Every feature MUST respect a clear separation of concerns across four layers:
UI, Application (use-cases), Domain (business logic), and Infrastructure (Supabase, HTTP, etc.).

- Business logic MUST NOT reside inside React components (visual or otherwise).
- Components MUST have a single, well-defined responsibility.
- Domain rules MUST be expressible independently of any framework or library.
- Use-cases orchestrate domain logic and MUST call infrastructure through interfaces/adapters.

**Rationale**: Tight coupling to frameworks makes the codebase fragile, hard to test, and expensive to
evolve. Separation ensures that UI changes never accidentally break business rules, and vice versa.

### II. Mobile First & PWA (NON-NEGOTIABLE)

The application MUST be designed for mobile devices first and MUST be installable as a PWA.

- Dark Mode is the primary theme; it is NOT optional.
- Every interactive element (buttons, links, form controls) MUST have a minimum touch target of 48x48 px.
- Every asynchronous operation MUST provide visual feedback: loading spinners, skeleton loaders,
  toast notifications, and empty-state illustrations are MANDATORY — never a blank or frozen screen.
- All components MUST be accessible (WCAG 2.1 AA minimum): correct ARIA roles, keyboard navigation,
  sufficient color contrast.

**Rationale**: Vocalis operates in bars — low-light, one-handed use, unstable networks. A desktop-first
or accessibility-agnostic design would fail the primary audience entirely.

### III. Database-Enforced Integrity (NON-NEGOTIABLE)

Every critical business rule MUST be enforced at the database level (PostgreSQL constraints, partial
unique indexes, RLS policies), not solely in the frontend or API layer.

- Supabase Realtime MUST be used for live data updates; polling (setInterval) is forbidden.
- The Anti-Spam rule (one active queue entry per participant per session) MUST be guaranteed by a
  partial unique index on `(session_id, participant_id) WHERE status IN ('pending','preparing','singing')`.
- Row-Level Security (RLS) MUST be enabled on all tables.
- Supabase errors from constraint violations MUST surface as user-friendly toast messages,
  never raw error strings.

**Rationale**: Network partitions, client bugs, and race conditions are inevitable in bar environments.
Database-level enforcement is the only guarantee that survives all these failure modes.

### IV. Typed & DRY Code (NON-NEGOTIABLE)

All source code MUST be written in TypeScript with strict type checking enabled (`strict: true`).

- `any` is forbidden; use `unknown` with proper narrowing when the type is genuinely unknown.
- Logic duplication is forbidden; shared logic MUST be extracted into reusable hooks, utilities,
  or service functions.
- shadcn/ui components MUST be preferred over custom-built equivalents. A custom component is only
  acceptable when no shadcn/ui equivalent exists or when the existing component cannot reasonably
  be adapted.

**Rationale**: TypeScript strict mode and DRY discipline are the primary defenses against subtle bugs
at runtime and against divergent implementations as the codebase grows.

### V. Performance by Default

React Server Components (RSC) are the default rendering strategy. Client Components (`"use client"`)
MUST only be introduced when strictly necessary: user interactivity, browser-only APIs, or Supabase
Realtime subscriptions.

- Unnecessary re-renders MUST be avoided; memoize only when a profiled bottleneck justifies it.
- Assets and data MUST be optimized for slow mobile networks (lazy loading, image optimization,
  minimal JavaScript bundles).
- The critical rendering path MUST feel instant; use streaming, Suspense, and skeleton loaders to
  progressively reveal content.

**Rationale**: Vocalis targets mobile devices on potentially congested bar Wi-Fi. Every unnecessary
byte and render cycle degrades the experience for the primary user.

### VI. Quality & Simplicity

Simple solutions MUST be attempted and exhausted before introducing complex ones.

- New features MUST NOT break existing functionality.
- Code changes MUST preserve compatibility with the current architecture; architectural deviations
  require an explicit constitution amendment.
- Every new feature MUST be designed for future evolution: avoid hard-coded assumptions that would
  require a large refactor to change.
- Premature optimization is forbidden; optimize only after measuring.

**Rationale**: Simplicity is a competitive advantage in a project designed for rapid iteration.
Unjustified complexity is technical debt from day one.

## Technology Stack

The following choices are canonical for this project. Deviations require an explicit amendment.

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Server Components by default |
| Language | TypeScript (`strict: true`) | No `any` allowed |
| Styling | Tailwind CSS | Dark mode configured as primary theme |
| UI Components | shadcn/ui (Radix UI) | Prefer over custom implementations |
| Icons | Lucide React | Only icon library |
| Backend / DB | Supabase (PostgreSQL) | Realtime subscriptions; RLS mandatory |
| Auth | Supabase Auth + `@supabase/ssr` | Cookie-based session management |
| PWA | serwist or next-pwa | Installable, offline-capable shell |

## Routing & Source Structure

```text
app/
├── page.tsx                  # Landing — enter room code
├── sala/
│   └── [code]/
│       ├── page.tsx          # Singer view (Client Component)
│       └── dj/
│           └── page.tsx      # Host/DJ view (Client Component)
src/
├── domain/                   # Business entities & rules (no framework deps)
├── application/              # Use-cases / services
├── infrastructure/           # Supabase clients, adapters
└── components/               # UI components (shadcn/ui + custom when justified)
```

## Governance

This constitution supersedes all other informal conventions or preferences.
Any amendment MUST follow the procedure below:

1. **Propose**: Open a documented proposal describing the change, the motivation, and the migration path.
2. **Approve**: The project owner (host) MUST explicitly approve the amendment.
3. **Ratify**: Update this file, increment the version according to semantic versioning rules, and
   update `LAST_AMENDED_DATE`.
4. **Propagate**: Update all dependent templates and AGENTS.md to reflect the amendment.
5. **Compliance**: All code reviews MUST verify adherence to the active version of this constitution.

**Versioning Policy**:
- MAJOR bump: backward-incompatible removal or redefinition of an existing principle.
- MINOR bump: new principle or section added, or existing guidance materially expanded.
- PATCH bump: clarifications, wording corrections, non-semantic refinements.

**Deviation Policy**: Any deviation from these principles in production code MUST be recorded in the
`Complexity Tracking` section of the affected feature's `plan.md`, with explicit justification for
why a simpler, compliant approach was insufficient.

**Runtime Guidance**: For day-to-day development guidance, refer to `AGENTS.md` at the project root.

---

**Version**: 1.0.0 | **Ratified**: 2026-07-14 | **Last Amended**: 2026-07-14
