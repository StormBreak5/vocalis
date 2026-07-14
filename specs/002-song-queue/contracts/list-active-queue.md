# Contract: `list-active-queue`

**Type**: Server Action & Supabase Realtime Subscription
**Path**: `src/application/queue/list-active-queue.action.ts` & `src/hooks/useActiveQueue.ts`

## Input (Server Action - Initial Load)
- `sessionId` (string)

## Output (Success)
Array of `ActiveQueueEntry`:
```typescript
type ActiveQueueEntry = {
  id: string;
  sessionId: string;
  participantId: string;
  participantName: string; // Joined from participants table
  songTitle: string;
  artist: string;
  status: 'pending' | 'preparing' | 'singing';
  position: number;
  updatedAt: string;
}
```

## Realtime Subscription
- **Channel**: `queue:session_id=eq.${sessionId}`
- **Authentication**: The client must establish a Supabase Auth session (Anonymous or Authenticated) *before* subscribing. The access token is automatically passed in the WebSocket connection.
- **Events**: `INSERT`, `UPDATE`
- **Filter**: Only items with status `pending`, `preparing`, or `singing`.
- **Deduplication**: Handled in React state using `id`.
- **Ordering**: Sorted by `position` ASC.
- **Token Refresh**: The `@supabase/supabase-js` client manages the JWT lifecycle. When the token refreshes, it automatically pushes the new token over the active WebSocket, ensuring the RLS subscription remains valid without dropping the channel.

## Error States
- `SESSION_NOT_FOUND`
- `NETWORK_ERROR` (Handled via offline cache display)
