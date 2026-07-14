-- cancel_queue_entry.sql

CREATE OR REPLACE FUNCTION public.cancel_queue_entry(
    p_queue_id UUID
)
RETURNS public.queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_queue_entry public.queue;
    v_participant_id UUID;
    v_host_id UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- 1. Fetch the queue entry and lock it
    SELECT * INTO v_queue_entry
    FROM public.queue
    WHERE id = p_queue_id
    FOR UPDATE;

    IF v_queue_entry IS NULL THEN
        RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND: Entry does not exist';
    END IF;

    -- 2. Verify authorization
    -- The user must either be the participant who requested the song, or the host of the session
    SELECT p.id INTO v_participant_id
    FROM public.participants p
    WHERE p.id = v_queue_entry.participant_id
      AND p.auth_user_id = auth.uid()
    LIMIT 1;

    IF v_participant_id IS NOT NULL THEN
        v_is_authorized := TRUE;
    ELSE
        -- Check if it's the host
        SELECT s.host_id INTO v_host_id
        FROM public.sessions s
        WHERE s.id = v_queue_entry.session_id
        LIMIT 1;

        IF v_host_id = auth.uid() THEN
            v_is_authorized := TRUE;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Cannot cancel a song that does not belong to you';
    END IF;

    -- 3. Verify valid state transition
    IF v_queue_entry.status NOT IN ('pending', 'preparing') THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Cannot cancel a song that is already singing or completed';
    END IF;

    -- 4. Update the status
    UPDATE public.queue
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_queue_id
    RETURNING * INTO v_queue_entry;

    RETURN v_queue_entry;
END;
$$;

-- Revoke public access and grant only to authenticated roles
REVOKE EXECUTE ON FUNCTION public.cancel_queue_entry(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_queue_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_queue_entry(UUID) TO anon;
