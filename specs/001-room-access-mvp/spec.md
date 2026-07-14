# Feature Specification: Room Access MVP

**Feature Branch**: `001-room-access-mvp`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Quero especificar a primeira versão funcional (MVP) do Vocalis. Objetivo: Permitir que um Host crie uma sala de karaokê e convidados possam entrar utilizando um código..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Host Creates a Room (Priority: P1)

A user acting as a Host needs to create a new karaoke session so that they can invite guests to join and participate in the queue (in the future).

**Why this priority**: Without a room, guests have nowhere to join. This is the absolute foundation of the application.

**Independent Test**: Can be fully tested by clicking a "Create Room" action on the main screen and observing the generation of a 6-character code, landing on the Host Dashboard.

**Acceptance Scenarios**:

1. **Given** a user is on the landing page, **When** they choose to create a room, **Then** a new room is instantiated.
2. **Given** a room is being created, **When** the process completes, **Then** the Host is shown a unique 6-character alphanumeric code.
3. **Given** the network is slow, **When** creating a room, **Then** a clear loading state (spinner/skeleton) is shown.

---

### User Story 2 - Guest Joins a Room (Priority: P1)

A guest at the bar wants to enter the karaoke room they see on the screen or were told about, so they can be registered as a participant.

**Why this priority**: Essential for the core loop; without guests, the karaoke room has no singers.

**Independent Test**: Can be tested independently by taking a known valid room code, entering it along with a display name, and successfully landing on the Guest view as a registered participant.

**Acceptance Scenarios**:

1. **Given** a guest is on the landing page, **When** they enter a valid 6-character code and their name, **Then** they join the room as a registered participant.
2. **Given** a guest enters an invalid code, **When** they try to join, **Then** they receive a user-friendly error toast message.
3. **Given** a guest forgets to enter their name, **When** they try to join, **Then** the form prevents submission and highlights the missing field.
4. **Given** the network is disconnected, **When** they try to join, **Then** an offline state message is displayed.

---

### Edge Cases

- What happens when a user tries to enter a code that doesn't exist? (Handled: User-friendly error message).
- What happens if the network drops right after the guest clicks "Join"? (Handled: UI should handle timeout and show offline/retry state).
- What happens if the Host closes their browser after creating the room? (The room remains active in the database; the Host should ideally be able to rejoin, though Host rejoining flow might need clarification).
- Does the 6-character code expire? (Assuming it remains active as long as the session is active).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a user (Host) to initiate the creation of a new karaoke session.
- **FR-002**: System MUST generate a unique, 6-character alphanumeric code for each created session.
- **FR-003**: System MUST allow a user (Guest) to input a 6-character code and a display name to join a session.
- **FR-004**: System MUST validate that a non-empty display name is provided before allowing the guest to join. Duplicate names within the same session are permitted.
- **FR-010**: When a display name is already in use within a session, the system MUST automatically append a numeric suffix to distinguish participants in the UI (e.g., first `João` remains `João`; second becomes `João #2`; third `João #3`). The base name chosen by the user is stored unchanged; the suffix is a display-only computed value.
- **FR-011**: Each participant MUST see a personal `"Você"` tag next to their own name everywhere their name appears in the interface. This tag is visible only to the participant themselves and MUST NOT be transmitted to or rendered for other participants.
- **FR-005**: System MUST create a Participant record in the database when a guest successfully joins.
- **FR-006**: System MUST redirect the Host to a Host Dashboard view upon successful room creation.
- **FR-007**: System MUST redirect the Guest to a Guest Room view upon successful join.
- **FR-008**: System MUST display the room code clearly on the Host Dashboard so it can be shared.
- **FR-009**: Queue items MUST follow a strictly linear status flow: `pending → preparing → singing → completed`. Cancellation (`→ cancelled`) is permitted from any active state (`pending`, `preparing`, `singing`). No status reversal is allowed. The Host MAY cancel any item regardless of its status; a Participant (Singer) MAY cancel only items in `pending` status.
- **FR-012**: The Host MUST be able to **pause** new song entries: while paused, the existing queue continues to be processed normally, but the system MUST reject any new song submissions with a user-friendly message (e.g., *"A fila está pausada. Aguarde o DJ reabrir."*). The Host MUST be able to **resume** new entries at any time.
- **FR-013**: The Host MUST be able to **end the session** permanently. This action MUST require an explicit confirmation dialog before execution. Once ended, the session status transitions to `closed` and no further interactions are permitted.
- **FR-014**: The Host MUST be able to **reorder** the queue by dragging and dropping items. Reordering MUST only be possible for items in `pending` status. The updated order MUST be persisted immediately and reflected in real-time to all participants.
- **FR-015**: A session MUST support a maximum of **50 active participants**. When the limit is reached, any new join attempt MUST be rejected with a clear message (e.g., *"Sala cheia. Limite de 50 participantes atingido."*).
- **FR-016**: A session MUST support a maximum of **200 queue entries** (across all statuses). When the limit is reached, new song submissions MUST be rejected with a clear message.
- **FR-017**: Queue entries with status `completed` or `cancelled` MUST be **retained permanently** in the database, associated with their session. This history MUST be available for future reporting and Host session review features.

### Non-Functional Requirements

- **NFR-001** (UX): System MUST display clear visual feedback (loading spinners, disabled buttons) during asynchronous operations like room creation and joining.
- **NFR-002** (UX): System MUST handle errors gracefully using Toast notifications (e.g., "Sala não encontrada").
- **NFR-003** (Resilience): System MUST detect offline states and display a persistent banner informing the user of the lost connection. While offline, all write actions (adding songs, cancelling, reordering) MUST be visually disabled with a tooltip/label explaining why.
- **NFR-004** (Resilience): System MUST automatically reconnect without requiring a manual page reload. Upon reconnection, the UI MUST silently sync to the latest server state and dismiss the offline banner.
- **NFR-005** (Security): System MUST ensure that Guests can only join rooms with a valid code.
- **NFR-006** (Resilience): While offline, the system MUST display the last known state of the queue and participant list from cache (read-only). The cached view MUST be visually distinguished (e.g., a muted overlay or label: *"Visualizando dados salvos"*) so users understand they may be seeing stale data.

### Key Entities *(include if feature involves data)*

- **Session**: The karaoke room. Contains attributes like `code` (6 characters), `host_id`, `status` (`active` | `paused` | `closed`), and `created_at`. When `paused`, new song submissions are rejected. When `closed`, all interactions are disabled.
- **Participant**: A guest in the room. Contains `session_id`, `display_name`, `disambiguation_index` (integer, auto-assigned when name already exists in session; 1 = first occurrence rendered without suffix, 2+ rendered as `name #N`), `joined_at`, and `last_seen`. *(Note: Advanced online presence tracking is deferred and does not belong to the Room Access MVP scope).*
- **QueueEntry** *(future entity, defined here for data-model completeness)*: Represents a song request. Status values: `pending` (waiting), `preparing` (singer called up), `singing` (actively singing), `completed` (finished), `cancelled` (removed). Valid transitions: `pending → preparing → singing → completed`; any active status `→ cancelled`. Reversal is not permitted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Hosts can complete the room creation process and receive a code in under 2 seconds (measured via performance task in a controlled test environment).
- **SC-002**: 100% of generated room codes are exactly 6 characters and unique among active sessions.
- **SC-003**: Guests entering a valid code and name successfully land in the room 99% of the time (Operational metric measured post-deploy; not verifiable via a single E2E test).
- **SC-004**: Guests entering an invalid code receive an immediate (sub-1 second) error message preventing entry.
- **SC-005**: The application passes basic offline simulation (e.g., Chrome DevTools Offline mode) by displaying an offline indicator and read-only cached state rather than crashing.
- **SC-006**: A session MUST NOT exceed 50 active participants; the 51st join attempt is rejected with a user-facing error.
- **SC-007**: A session MUST NOT exceed 200 total queue entries; the 201st submission is rejected with a user-facing error.

## Assumptions

- **Host Authentication**: For this MVP, the system supports a hybrid authentication model for Hosts. A Host can create a room frictionlessly using anonymous authentication (temporary session). However, they also have the option to create a permanent account (e.g., via OAuth or email) to gain persistence, multi-device access, and access to session history in the future.
- **Code Format**: The 6-character code consists of uppercase letters and numbers (e.g., `KARA89`) to avoid ambiguity (excluding similar characters like 0/O, 1/I if possible, though standard alphanumeric is assumed).
- **Session Lifecycle**: A session remains active indefinitely for the scope of this MVP, as closing/ending a session is not explicitly requested in the flow.

## Clarifications

### Session 2026-07-14

- Q: What queue status transitions and cancellation rules apply? → A: Linear flow `pending → preparing → singing → completed`. Cancellation (`→ cancelled`) is allowed from any active state. No status reversal. Host can cancel any item; Singer can only cancel their own `pending` items.
- Q: How does the system handle participants with duplicate display names? → A: Duplicates are allowed. System auto-appends a numeric suffix in the UI (`João #2`, `João #3`). Base name is stored unchanged; suffix is display-only. Additionally, each user sees a personal `"Você"` tag next to their own name, invisible to all other participants.
- Q: What session management controls does the Host have? → A: Host can (1) pause new entries — existing queue continues, new submissions rejected with friendly message; (2) resume new entries; (3) end session permanently with a confirmation dialog (status → `closed`). Additionally, Host can reorder `pending` items in the queue via drag-and-drop; changes persist immediately and broadcast in real-time.
- Q: What can users do while offline? → A: Read-only mode. The last known state of the queue and participant list is displayed from cache with a visual indicator (*"Visualizando dados salvos"*). All write actions are disabled with explanatory feedback. A persistent offline banner is shown. Upon reconnection, the UI syncs silently to the latest state with no manual reload required.
- Q: What are the session scale limits and history retention policy? → A: Maximum 50 active participants and 200 total queue entries per session (hard limits enforced by the system with user-facing error messages). Queue entries with status `completed` or `cancelled` are retained permanently in the database for future session history and reporting features.
