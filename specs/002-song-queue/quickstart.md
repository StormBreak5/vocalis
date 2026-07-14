# Quickstart: Song Queue Validation

## Prerequisites
1. Ensure the Supabase local stack is running: `npx supabase start`
2. Apply the new migrations: `npx supabase db push`
3. Generate updated TypeScript types: `npm run generate-types` (assuming script exists)
4. Start the Next.js dev server: `npm run dev`

## Validation Scenarios

### Scenario 1: Add a Song Request (Microfone Justo)
1. Open Browser A (Host): Create a session. Note the code.
2. Open Browser B (Participant 1): Join the session using the code.
3. In Browser B, fill the "Música" and "Artista" fields and submit.
4. **Expected**: Button shows loading state. Song appears in the queue with a "Você" badge.
5. In Browser B, try to add another song immediately.
6. **Expected**: The form is disabled or blocked. A toast message appears: *"Você já tem uma música na fila! Aguarde sua vez."* (Anti-Spam rule).

### Scenario 2: Realtime Synchronization
1. Keep Browser A (Host) open to the DJ dashboard.
2. Keep Browser B (Participant 1) open.
3. Open Browser C (Participant 2): Join the session.
4. In Browser C, add a song request.
5. **Expected**: The song appears almost instantly in Browser A and Browser B without any manual refresh.

### Scenario 3: Cancel Own Song
1. In Browser C, click the "Cancelar" button next to the song just added.
2. **Expected**: A confirmation modal appears.
3. Confirm the cancellation.
4. **Expected**: The song disappears from the queue in Browser C, Browser B, and Browser A instantly via Realtime. The form in Browser C is re-enabled to allow a new request.

### Scenario 4: Offline Resilience
1. In Browser B, disconnect the network (use DevTools > Network > Offline).
2. **Expected**: A visual indicator "Sem conexão" appears. The song request form is disabled. The queue remains visible (read-only cache).
3. Reconnect the network.
4. **Expected**: The indicator disappears, the form is re-enabled, and any queue updates that happened while offline are synchronized.

### Scenario 5: Security Isolation
1. Open Browser D: Create a *second* session (Host 2).
2. Open Browser E: Join the *second* session (Participant 3).
3. In Browser E, add a song.
4. **Expected**: The song appears in Browser D, but does **NOT** appear in Browser A, B, or C (Session 1). Realtime and DB isolation confirmed.
5. In Browser E, attempt to subscribe to Session 1's channel manually via browser console.
6. **Expected**: Subscription fails or yields no events due to `auth.uid()` failing the RLS `SELECT` policy for Session 1.

### Scenario 6: Auth Session & Expiration
1. In Browser B, manually delete the Supabase Auth tokens from LocalStorage/Cookies.
2. Refresh the page.
3. **Expected**: User is kicked back to the Join Session form.
4. Join again. A new anonymous identity is generated.

### Scenario 7: Abuse Mitigation (Admin Check & Configuration)
1. **Configuring Rate Limits**: In the Supabase Dashboard, navigate to **Authentication -> Rate Limits**.
2. Locate the "Anonymous Sign-ins" section.
3. Configure the rate limit to a reasonable threshold for a bar environment (e.g., 30 requests per hour per IP address) to prevent spam while accommodating multiple users on the same WiFi.
4. **Validation**: Attempt to create anonymous sessions rapidly via a script exceeding the configured limit.
5. **Expected**: Supabase blocks the IP with a `429 Too Many Requests` error.
