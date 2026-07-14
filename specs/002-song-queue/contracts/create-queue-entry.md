# Contract: `create-queue-entry`

**Type**: Server Action wrapping PostgreSQL RPC
**Path**: `src/application/queue/create-queue-entry.action.ts`

## Input (Server Action)
- `songTitle` (string, 1-60 chars)
- `artist` (string, 1-60 chars)

## Dependencies
- Requires an active Supabase Auth session (Anonymous or Authenticated).
- Identifies the participant via `auth.uid()`.

## Execution
Calls RPC `create_queue_entry` via `@supabase/ssr` server client.

## Output (Success)
```typescript
type CreateQueueResponse = {
  success: true;
  data: {
    id: string;
    position: number;
    status: 'pending';
  }
}
```

## Error States (Domain Errors)
- `UNAUTHORIZED`: Missing Supabase Auth session or participant not found for this `auth.uid()`.
- `SESSION_NOT_FOUND`: Session no longer exists.
- `SESSION_CLOSED`: Session is closed.
- `SESSION_PAUSED`: Session is paused, no new requests allowed.
- `ACTIVE_SONG_EXISTS`: Participant already has a song in pending, preparing, or singing state (Microfone Justo rule).
- `VALIDATION_ERROR`: Title or artist length exceeded.

## Side Effects
- Database `INSERT` into `public.queue`.
- Triggers Supabase Realtime `INSERT` event to all subscribed clients.
