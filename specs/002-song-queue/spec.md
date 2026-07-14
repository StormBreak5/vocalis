# Feature Specification: Song Queue

**Feature Branch**: `[002-song-queue]`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Pedido de música e visualização da fila em tempo real"

## Clarifications

### Session 2026-07-14
- Q: Criação e Cálculo de Posição → A: Usar RPC `SECURITY DEFINER` (`create_queue_entry`) para garantir atomicidade, cálculo de `position` e validação de credenciais.
- Q: Segurança do Supabase Realtime (Isolamento) → A: Usar Filtro de Canal atrelado a RLS (`channel('queue:session_id=eq.[ID]')`) para garantir que os dados não vazem para outras sessões.
- Q: Filtragem de Estados da Fila → A: Apenas itens ativos (`pending`, `preparing`, `singing`) são retornados para o frontend e exibidos na fila principal; itens `completed` e `cancelled` são omitidos da resposta.
- Q: Confirmação e Autorização de Cancelamento → A: Exigir confirmação na UI e permitir atualização via `UPDATE` direto no Supabase, protegido por RLS (restrito ao próprio usuário, de `pending`/`preparing` para `cancelled`).
- Q: Tratamento de Conexão Offline → A: A fila permanece visível usando os últimos dados em cache (somente leitura), com um alerta visual explícito. O envio de novas músicas é bloqueado até a reconexão.
- Q: Realtime RLS e Identidade do Participante (RD-008) → A: Adotar Supabase Anonymous Auth para convidados. A identidade e autorização passarão a derivar de `auth.uid()`, eliminando o cookie customizado `recovery_token`. A RLS garantirá o isolamento conectando a sessão do auth_user_id ao session_id.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add Song Request (Priority: P1)
As a participant in a karaoke session, I want to add a song by providing the title and artist, so that I can queue up to sing.

**Why this priority**: This is the core functionality that allows the karaoke queue to exist.

**Independent Test**: Can be tested by joining a session and successfully adding a song, verifying it appears in the queue.

**Acceptance Scenarios**:
1. **Given** I am an authenticated participant without an active song, **When** I submit a title and artist, **Then** my song is added to the queue in `pending` status.
2. **Given** I am submitting a song, **When** the operation is processing, **Then** the submit button is disabled and shows a loading state.

---

### User Story 2 - Real-time Queue Visualization (Priority: P1)
As a participant or host, I want to see the queue update in real-time without refreshing, so that I can track upcoming singers.

**Why this priority**: Essential for the live karaoke experience to know who is next without manual intervention.

**Independent Test**: Can be tested by having multiple browsers open (host and participant) and verifying updates propagate instantly.

**Acceptance Scenarios**:
1. **Given** I am viewing the queue, **When** another user adds a song, **Then** the new song appears in my queue instantly via Supabase Realtime.
2. **Given** I have lost internet connection, **When** the connection is restored, **Then** the queue synchronizes with the latest state without duplicating entries.
3. **Given** the queue is empty, **When** I view the list, **Then** I see an empty state illustration/message.

---

### User Story 3 - Enforce Anti-Spam Rule (Microfone Justo) (Priority: P1)
As the system, I must prevent a participant from having more than one active song in the queue to ensure fairness.

**Why this priority**: Ensures all participants get a fair chance to sing, adhering to the strict Constitution principle of database-enforced integrity.

**Independent Test**: Can be tested by attempting to submit a second song while the first one is still active (`pending`, `preparing`, or `singing`).

**Acceptance Scenarios**:
1. **Given** I already have an active song, **When** I attempt to add another song, **Then** the request is blocked and I receive a friendly error message: "Você já tem uma música na fila! Aguarde sua vez."
2. **Given** I spam the submit button rapidly, **When** multiple concurrent requests are sent, **Then** the database partial unique index blocks all but the first request.

---

### User Story 4 - Cancel Own Song Request (Priority: P2)
As a participant, I want to cancel my song request while it is still pending, so that I can change my mind if I no longer want to sing it.

**Why this priority**: Gives users control over their requests before the DJ locks them in.

**Independent Test**: Can be tested by adding a song and then clicking cancel on my own request.

**Acceptance Scenarios**:
1. **Given** my song is in `pending` status, **When** I click cancel, **Then** the song status is updated to `cancelled` and it is removed from the active queue.
2. **Given** I am viewing the queue, **When** I attempt to cancel a song requested by someone else, **Then** the action is blocked/not available.

### Edge Cases

- What happens when a user attempts to add a song to a non-existent or ended session?
- How does the system handle concurrent song requests from the same user across multiple tabs?
- What happens if the network fails immediately after pressing submit, but before the response is received?
- How does the system handle temporary disconnection from Supabase Realtime?
- What happens if a user's recovery credential is invalid when submitting a request?
- How does the system prevent exposing queue data to users outside the specific session?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authenticated participants to submit a song request providing a title and artist.
- **FR-002**: System MUST display the session's queue to the Host and its Participants, highlighting the current participant's request.
- **FR-003**: System MUST update the queue in real-time across all active clients using Supabase Realtime (no polling), using channel filters (`channel('queue:session_id=eq.[ID]')`) enforced by RLS to guarantee strict session isolation.
- **FR-004**: System MUST enforce the "Microfone Justo" rule via a PostgreSQL partial unique index on `(session_id, participant_id) WHERE status IN ('pending', 'preparing', 'singing')`.
- **FR-005**: System MUST present a user-friendly toast message ("Você já tem uma música na fila! Aguarde sua vez.") when the Anti-Spam constraint is triggered.
- **FR-006**: System MUST authenticate operations strictly via `auth.uid()` (Supabase Auth, Anonymous or Authenticated) and NEVER trust client-provided `participant_id` blindly. The legacy `recovery_token` is completely deprecated.
- **FR-007**: System MUST restrict participants to only view the queue of their current session, securely enforced by Realtime RLS policies tied to `auth.uid()`.
- **FR-008**: System MUST order the queue deterministically based on an integer `position` column.
- **FR-009**: System MUST allow participants to cancel their own song request while it is in `pending` or `preparing` status. This MUST require explicit user confirmation in the UI to prevent accidental cancellations.
- **FR-010**: Interface MUST be mobile-first and dark mode by default.
- **FR-011**: Interface MUST ensure all interactive elements have a minimum touch target of 48px and utilize shadcn/ui components.
- **FR-012**: System MUST handle network errors gracefully. If offline, the queue MUST display cached data in read-only mode with a visual 'offline' indicator, and the song request form MUST be temporarily disabled until the connection is restored.
- **FR-013**: System MUST NOT expose `service_role` keys on the client.
- **FR-014**: System MUST process song creations exclusively via a `SECURITY DEFINER` RPC (`create_queue_entry`) that automatically derives the participant's identity from `auth.uid()`, calculates the next `position`, and handles the anti-spam database constraint.
- **FR-015**: System MUST strictly filter queue queries and Realtime events to only return active entries (`pending`, `preparing`, `singing`). Entries transitioning to `completed` or `cancelled` MUST be immediately removed from the active queue UI.
- **FR-016**: System MUST enforce song cancellations via a direct `UPDATE` operation protected by an RLS policy, guaranteeing a participant can only update their own record, only change the `status` column, and only transition it to `cancelled`.

### Key Entities

- **QueueEntry (public.queue)**:
  - `id`: UUID (Primary Key)
  - `session_id`: UUID (Foreign Key to sessions)
  - `participant_id`: UUID (Foreign Key to participants)
  - `song_title`: VARCHAR
  - `artist`: VARCHAR
  - `status`: VARCHAR (pending, preparing, singing, completed, cancelled)
  - `position`: INTEGER
  - `created_at`: TIMESTAMPTZ
  - `updated_at`: TIMESTAMPTZ

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A valid participant can successfully add a song, with the UI reflecting the loading state and subsequent success in under 2 seconds on a stable connection.
- **SC-002**: Real-time updates (new songs, cancellations, status changes) appear on all connected devices for the session within 1 second.
- **SC-003**: 100% of concurrent request attempts by the same participant are blocked by the database constraint without crashing the client.
- **SC-004**: System successfully isolates data, guaranteeing participants cannot view or modify queues from other sessions.
- **SC-005**: All UI touch targets meet the 48px minimum requirement (verifiable via browser dev tools).
- **SC-006**: Queue is displayed in a consistently identical order across all connected clients.

## Assumptions

- Participants have a connection stable enough to initially load the app and connect to Supabase Realtime.
- The Host does not need controls to start, skip, or reorder the queue in this feature release; this will be handled in a future feature.
- Participant recovery credentials are securely managed and verified via RLS policies.
- Song titles and artists have reasonable maximum length limits to prevent UI breakage.
