# Requirements Quality Checklist: Security & Architecture

**Feature**: `002-song-queue`
**Date**: 2026-07-14
**Theme**: Identity, Realtime Authorization, and Concurrency Validation

## Identity & Auth Migration
- [ ] CHK001 - Are the exact steps for migrating the previous feature (Room Access MVP) to Supabase Anonymous Auth explicitly documented? [Completeness, Plan RD-008]
- [ ] CHK002 - Is the mapping mechanism between `auth.uid()` and the `Participant` row unambiguously defined? [Clarity, Data Model]
- [ ] CHK003 - Are the requirements for differentiating an authenticated Host from an anonymous Guest consistent across all auth flows? [Consistency, Plan §Identity]
- [ ] CHK004 - Are abuse mitigation strategies for anonymous sign-ins (e.g., rate limiting, cleanup) explicitly specified? [Completeness, Plan §Identity]

## Realtime & RLS Authorization
- [ ] CHK005 - Is the RLS `SELECT` policy explicitly formulated to evaluate `auth.uid()` against the requested `session_id`? [Clarity, Data Model]
- [ ] CHK006 - Does the spec explicitly define how the Realtime WebSocket connection acquires and uses the Supabase Auth JWT? [Completeness, Contracts]
- [ ] CHK007 - Are the requirements for JWT refresh and automatic WebSocket subscription renewal documented? [Coverage, Plan §Identity]
- [ ] CHK008 - Is strict cross-session isolation objectively verifiable through the defined RLS security policies? [Measurability, Spec §FR-007]

## Concurrency & Integrity (RPCs)
- [ ] CHK009 - Is the "Microfone Justo" rule defined as a strict database constraint rather than just application logic? [Completeness, Spec §FR-004]
- [ ] CHK010 - Are the concurrency guarantees for generating the `position` integer unambiguously documented (e.g., Row Locks)? [Clarity, Research R1]
- [ ] CHK011 - Do the `create_queue_entry` and `cancel_queue_entry` RPC contracts explicitly mandate deriving identity securely from `auth.uid()` inside the database? [Consistency, Data Model]
- [ ] CHK012 - Are the exact state transitions allowed during cancellation (`pending`/`preparing` → `cancelled`) clearly bounded? [Edge Case, Spec §FR-016]

## Offline & Resilience
- [ ] CHK013 - Does the specification explicitly prohibit storing authentication credentials in the offline read-only cache? [Edge Case, Plan]
- [ ] CHK014 - Are the exact visual feedback and interaction blocking behaviors for offline song requests clearly specified? [Clarity, Spec §FR-012]
- [ ] CHK015 - Is the behavior for restoring the Realtime connection after a network drop explicitly defined? [Coverage, Quickstart]
