# Contract: Get Session by Code

**Operation**: `getSessionByCode`
**Mechanism**: Server Component data fetch (direct Supabase query via server client)
**File**: `src/infrastructure/supabase/queries/session.queries.ts`

---

## Input

| Field | Type | Validation |
|---|---|---|
| `code` | `string` | Uppercase-normalized before query; must be exactly 6 alphanumeric characters |

---

## Authorization

- Uses the Supabase **server client** (cookie-based, `@supabase/ssr`).
- RLS policy `sessions_select_by_code` permits `SELECT` on `sessions` for the `anon` role when `status != 'closed'`. Closed sessions return no row.
- Host's own sessions are readable via the `authenticated` role (same policy applies).

---

## Validations

| Check | Failure behavior |
|---|---|
| Code is exactly 6 uppercase alphanumeric chars | Return `SESSION_INVALID_FORMAT` before hitting DB |
| Session found in DB | If no row → return `SESSION_NOT_FOUND` |
| Session is not `closed` | If closed → return `SESSION_CLOSED` |

---

## Database Effect

Read-only `SELECT`. No writes.

---

## Success Response

```typescript
type GetSessionSuccess = {
  ok: true;
  session: {
    id: string;
    code: string;
    status: 'active' | 'paused';
    createdAt: string;
  };
};
```

## Error Response

```typescript
type GetSessionError = {
  ok: false;
  code: 'SESSION_NOT_FOUND' | 'SESSION_CLOSED' | 'SESSION_INVALID_FORMAT' | 'UNKNOWN';
  userMessage: string;
};
```

---

## User-Facing Messages

| Code | Inline / Toast message |
|---|---|
| `SESSION_NOT_FOUND` | *"Sala não encontrada. Verifique o código e tente novamente."* |
| `SESSION_CLOSED` | *"Esta sessão já foi encerrada."* |
| `SESSION_INVALID_FORMAT` | *"O código deve ter 6 letras ou números."* (inline form error) |
| `UNKNOWN` | *"Ocorreu um erro inesperado. Tente novamente."* |
