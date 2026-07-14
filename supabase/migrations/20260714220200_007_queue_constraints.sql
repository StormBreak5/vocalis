-- Enforce valid status values
ALTER TABLE public.queue ADD CONSTRAINT queue_status_check CHECK (status IN ('pending', 'preparing', 'singing', 'completed', 'cancelled'));

-- Microfone Justo Rule: A participant can only have one active song at a time per session
CREATE UNIQUE INDEX queue_active_participant_idx ON public.queue (session_id, participant_id) WHERE status IN ('pending', 'preparing', 'singing');

-- Index for ordering queue within a session
CREATE INDEX queue_session_position_idx ON public.queue (session_id, position);
