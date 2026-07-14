# Contract: Create Session

**Operation**: `createSession`
**Mechanism**: Next.js Server Action
**File**: `src/application/session/create-session.action.ts`

---

## Input

No user-supplied input for this operation. The `host_id` is derived server-side from the authenticated session (`supabase.auth.getUser()`).

If the Host has no active auth session, anonymous sign-in is triggered automatically before session creation.

---

## Authorization

- Caller must be authenticated (anonymous or permanent Supabase Auth user).
- If `auth.getUser()` returns no user, the Server Action calls `signInAnonymously()` first.
- The `host_id` in the inserted row is always `auth.uid()` — never a client-provided value.

---

## Validations

| Check | Failure behavior |
|---|---|
| Auth user exists (after sign-in attempt) | Return error: `"Não foi possível autenticar. Tente novamente."` |
| Code generation succeeds (≤ 5 retries in RPC) | Return error: `"Não foi possível criar a sala. Tente novamente."` |

---

## Database Effect

Calls `create_session(auth.uid())` RPC:
- Generates a unique 6-char code.
- Inserts row in `sessions` with `status = 'active'`.

---

## Success Response

```typescript
type CreateSessionSuccess = {
  ok: true;
  session: {
    id: string;       // UUID
    code: string;     // e.g. "KARA89"
    status: 'active';
    createdAt: string; // ISO timestamp
  };
};
```

## Error Response

```typescript
type CreateSessionError = {
  ok: false;
  code: 'AUTH_FAILED' | 'CODE_GENERATION_FAILED' | 'UNKNOWN';
  userMessage: string; // PT-BR, safe to display directly in toast
};
```

---

## User-Facing Messages

| Code | Toast message |
|---|---|
| `AUTH_FAILED` | *"Não foi possível autenticar. Tente novamente."* |
| `CODE_GENERATION_FAILED` | *"Não foi possível criar a sala. Tente novamente mais tarde."* |
| `UNKNOWN` | *"Ocorreu um erro inesperado. Tente novamente."* |

---

## Idempotency

Not idempotent by design — each call creates a new session. The UI must disable the create button after the first successful response to prevent duplicate sessions.
