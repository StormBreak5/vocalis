# Data Model: Song Queue

**Feature**: `002-song-queue`
**Date**: 2026-07-14

---

## Entity: `queue`

Represents a song request in a karaoke session.

### Fields

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, DEFAULT `gen_random_uuid()` | Internal identifier |
| `session_id` | `uuid` | NOT NULL, FK → `sessions(id)` ON DELETE CASCADE | The session this queue entry belongs to |
| `participant_id` | `uuid` | NOT NULL, FK → `participants(id)` ON DELETE CASCADE | The guest who requested the song |
| `song_title` | `varchar(60)` | NOT NULL | Trimmed, max 60 chars |
| `artist` | `varchar(60)` | NOT NULL | Trimmed, max 60 chars |
| `status` | `varchar(20)` | NOT NULL, DEFAULT `'pending'` | Must be one of the allowed states |
| `position` | `integer` | NOT NULL | Deterministic order within the session |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Request creation time |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Used for Realtime event ordering |

### Constraints & Indexes

```sql
-- Enforce valid status values
ALTER TABLE queue ADD CONSTRAINT queue_status_check
  CHECK (status IN ('pending', 'preparing', 'singing', 'completed', 'cancelled'));

-- Microfone Justo (Anti-Spam) Rule: 
-- A participant can only have ONE active song per session.
CREATE UNIQUE INDEX queue_active_participant_idx
  ON queue (session_id, participant_id)
  WHERE status IN ('pending', 'preparing', 'singing');

-- Index for querying the active queue ordered by position
CREATE INDEX queue_active_session_idx 
  ON queue (session_id, position) 
  WHERE status IN ('pending', 'preparing', 'singing');
```

---

## Row Level Security (RLS) Policies

Table: `public.queue`

### SELECT

- **Name**: `Select active queue for sessions`
- **Role**: `anon`, `authenticated`
- **Condition (`USING`)**:
  `(status IN ('pending', 'preparing', 'singing')) AND (`
  `  EXISTS (SELECT 1 FROM participants p WHERE p.session_id = queue.session_id AND p.auth_user_id = auth.uid())`
  `  OR`
  `  EXISTS (SELECT 1 FROM sessions s WHERE s.id = queue.session_id AND s.host_id = auth.uid())`
  `)`
- **Notes**: Strict isolation. A queue record is only visible if the user is a verified participant of that session or the host of that session, using `auth.uid()` mapped via Supabase Anonymous Auth or standard Auth.

### INSERT, UPDATE, DELETE

- **INSERT**: Blocked for all roles. Only allowed via `SECURITY DEFINER` RPC.
- **UPDATE**: 
  - **Name**: `Participants can cancel own pending/preparing songs`
  - **Role**: `anon`
  - **Condition (`USING`)**: `participant_id = (SELECT id FROM participants WHERE id = queue.participant_id AND session_id = queue.session_id)` (Note: This is insecure without the recovery token, but RLS cannot read the HttpOnly cookie. Therefore, UPDATE must ALSO be handled by RPC, deviating from clarify Q4 due to technical incompatibility).
  *Wait, Clarify Q4 stated "UPDATE direto no Supabase protegido por RLS". As discovered in R3, `anon` RLS cannot validate the `recovery_token` cookie. We MUST use a `SECURITY DEFINER` RPC for cancellation as well.* 
  - **Correction**: Blocked for all roles. Only allowed via `SECURITY DEFINER` RPC (`cancel_queue_entry`).
- **DELETE**: Blocked for all roles.

---

## Postgres RPC: `create_queue_entry`

Runs as `SECURITY DEFINER`.

**Parameters**:
- `p_session_id` (uuid)
- `p_song_title` (text)
- `p_artist` (text)

**Logic**:
1. Validate input lengths (`song_title`, `artist`).
2. Verify participant identity by looking up `auth.uid()` in `participants` for the given `p_session_id`. Retrieve `participant_id`.
3. Lock the session row: `SELECT status FROM sessions WHERE id = p_session_id FOR UPDATE`.
4. Check if session is `active`.
5. Check Microfone Justo: handled automatically by `queue_active_participant_idx`, but can be explicitly checked to return a friendly error code (`ACTIVE_SONG_EXISTS`).
6. Calculate position: `SELECT COALESCE(MAX(position), 0) + 1 FROM queue WHERE session_id = v_session_id`.
7. `INSERT INTO queue (session_id, participant_id, song_title, artist, status, position) ...`
8. Return the inserted row.

## Postgres RPC: `cancel_queue_entry`

Runs as `SECURITY DEFINER`.

**Parameters**:
- `p_queue_id` (uuid)

**Logic**:
1. Retrieve the queue entry and lock it `FOR UPDATE`.
2. Verify the participant identity by looking up `auth.uid()` in `participants` for the entry's `session_id`.
3. Verify the entry's `participant_id` matches the authenticated user's `participant_id`.
4. Verify the status is `pending` or `preparing`. If not, raise exception.
5. `UPDATE queue SET status = 'cancelled', updated_at = now() WHERE id = p_queue_id`.
6. Return the updated row.
