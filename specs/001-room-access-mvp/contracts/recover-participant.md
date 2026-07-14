# Contract: Recover Participant

**Operation**: `recoverParticipant`
**Mechanism**: Next.js Server Action
**File**: `src/application/participant/recover-participant.action.ts`
**Trigger**: Automatic — called on mount of `/sala/[code]` page if `vocalis_pid` cookie is present.

---

## Input

| Field | Source | Type | Notes |
|---|---|---|---|
| `participantId` | Cookie `vocalis_pid` | `string` (UUID) | Read server-side from cookies |
| `recoveryToken` | Cookie `vocalis_pid` | `string` | Read server-side from cookies |
| `code` | URL param | `string` | The room code from the current route |

---

## Authorization

- No Supabase Auth required.
- Server Action reads cookie server-side; no client-provided `participantId` is trusted directly from the request body.

---

## Validations

| Check | Failure |
|---|---|
| `vocalis_pid` cookie exists | If missing → `PARTICIPANT_NOT_FOUND` (show join form) |
| `participantId` is a valid UUID format | If invalid → `PARTICIPANT_NOT_FOUND` |
| Session with `code` exists | `SESSION_NOT_FOUND` |
| Session is not `closed` | `SESSION_CLOSED` |
| Participant row exists and belongs to that session | `PARTICIPANT_NOT_FOUND` |

---

## Database Effect

## Database Effect

Calls `recover_participant($participantId, $recoveryToken, $code)` RPC.

The RPC securely verifies that the provided `recoveryToken` matches the `recovery_token_hash` stored for the participant, and atomically updates `last_seen`. This runs as `SECURITY DEFINER` with a fixed `search_path`.

---

## Success Response

```typescript
type RecoverParticipantSuccess = {
  ok: true;
  participant: {
    id: string;
    sessionId: string;
    displayName: string;
    disambiguationIndex: number;
    joinedAt: string;
    lastSeen: string;
  };
  session: {
    id: string;
    code: string;
    status: 'active' | 'paused';
  };
};
```

## Error Response

```typescript
type RecoverParticipantError = {
  ok: false;
  code: 'PARTICIPANT_NOT_FOUND' | 'SESSION_NOT_FOUND' | 'SESSION_CLOSED' | 'UNKNOWN';
  // No userMessage — errors are silent; UI falls back to the join form
};
```

---

## UX Behavior on Error

Recovery errors are **silent** — no toast is shown. The UI simply renders the join form as if the participant had never joined. This avoids confusing error messages for returning users with an expired cookie.

---

## Idempotency

Fully idempotent. Repeated calls update `last_seen` and return the same participant data.
