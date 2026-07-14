# Contract: `cancel-queue-entry`

**Type**: Server Action wrapping PostgreSQL RPC
**Path**: `src/application/queue/cancel-queue-entry.action.ts`

## Input (Server Action)
- `queueId` (string, UUID)

## Dependencies
- Requires an active Supabase Auth session (Anonymous or Authenticated).
- Identifies the participant via `auth.uid()`.

## Execution
Calls RPC `cancel_queue_entry` via `@supabase/ssr` server client.

## Output (Success)
```typescript
type CancelQueueResponse = {
  success: true;
  data: {
    id: string;
    status: 'cancelled';
  }
}
```

## Error States (Domain Errors)
- `UNAUTHORIZED`: Missing Supabase Auth session, participant not found for this `auth.uid()`, or trying to cancel a song that belongs to another participant.
- `INVALID_STATUS_TRANSITION`: Song is no longer in `pending` or `preparing` state (e.g., already `singing` or `completed`).
- `QUEUE_ENTRY_NOT_FOUND`: Entry does not exist.

## Side Effects
- Database `UPDATE` on `public.queue` changing status to `cancelled`.
- Triggers Supabase Realtime `UPDATE` event. The frontend will intercept this event and remove the entry from the active queue UI.
