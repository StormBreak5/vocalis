# Contract: Join Session (Guest)

**Operation**: `joinSession`
**Mechanism**: Next.js Server Action → Postgres RPC `join_session`
**File**: `src/application/participant/join-session.action.ts`

---

## Input

| Field | Type | Validation |
|---|---|---|
| `code` | `string` | Uppercase-normalized; 6 alphanumeric chars |
| `displayName` | `string` | Trimmed; 1–32 chars after trim |

---

## Authorization

- No Supabase Auth required for guests.
- Operation executes via `SECURITY DEFINER` RPC — the function validates the session internally.
- The Server Action must NOT accept a client-provided `session_id`; it resolves it from the `code`.

---

## Validations (Server Action layer — before RPC call)

| Check | Failure |
|---|---|
| `code` is 6 uppercase alphanumeric chars | Return `INVALID_CODE_FORMAT` |
| `displayName` after trim is 1–32 chars | Return `INVALID_NAME` |

---

## Validations (RPC layer — atomic)

| Check | Failure |
|---|---|
| Session with code exists | `SESSION_NOT_FOUND` |
| Session status is `active` | `SESSION_CLOSED` or `SESSION_PAUSED` |
| Participant count < `max_participants` | `SESSION_FULL` |

---

## Database Effect

- Returns new row PLUS `v_recovery_token` (plain text).
- Atomic within the RPC transaction.

---

## Success Response

```typescript
type JoinSessionSuccess = {
  ok: true;
  participant: {
    id: string;             // UUID
    recoveryToken: string;  // Plain text token — store securely
    sessionId: string;
    displayName: string;    // Base name (no suffix)
    disambiguationIndex: number; // 1 = no suffix; 2+ = show "#N"
    joinedAt: string;
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
type JoinSessionError = {
  ok: false;
  code:
    | 'INVALID_CODE_FORMAT'
    | 'INVALID_NAME'
    | 'SESSION_NOT_FOUND'
    | 'SESSION_CLOSED'
    | 'SESSION_PAUSED'
    | 'SESSION_FULL'
    | 'UNKNOWN';
  userMessage: string;
};
```

---

## User-Facing Messages

| Code | Display location | Message |
|---|---|---|
| `INVALID_CODE_FORMAT` | Inline (field error) | *"O código deve ter 6 letras ou números."* |
| `INVALID_NAME` | Inline (field error) | *"O nome deve ter entre 1 e 32 caracteres."* |
| `SESSION_NOT_FOUND` | Toast | *"Sala não encontrada. Verifique o código e tente novamente."* |
| `SESSION_CLOSED` | Toast | *"Esta sessão já foi encerrada."* |
| `SESSION_PAUSED` | Toast | *"A fila está pausada. Aguarde o DJ reabrir."* |
| `SESSION_FULL` | Toast | *"Sala cheia. Limite de 50 participantes atingido."* |
| `UNKNOWN` | Toast | *"Ocorreu um erro inesperado. Tente novamente."* |

---

## Post-Success Side Effect

The Server Action sets a cookie `vocalis_pid` containing a JSON payload with `id` and `token` (or two separate cookies). This cookie is:
- `HttpOnly: true` (MUST NOT be readable by client JS for security)
- `SameSite: Lax`
- `Secure` (in production)
- `Max-Age: 86400` (24 hours)
- `Path: /sala/[code]` (scoped to the room)

---

## Idempotency

Not strictly idempotent by itself — repeated calls create new participants with higher `disambiguation_index` values. However, the overall flow is idempotent because the client first attempts `recoverParticipant` using the cookie. If recovery succeeds, `joinSession` is never called.
