-- create_queue_entry.sql

CREATE OR REPLACE FUNCTION public.create_queue_entry(
    p_session_id UUID,
    p_song_title VARCHAR(100),
    p_artist VARCHAR(100)
)
RETURNS public.queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant_id UUID;
    v_session_status VARCHAR;
    v_next_position INTEGER;
    v_inserted_row public.queue;
BEGIN
    -- 1. Identify the participant securely via auth.uid()
    SELECT p.id INTO v_participant_id
    FROM public.participants p
    WHERE p.session_id = p_session_id
      AND p.auth_user_id = auth.uid()
    LIMIT 1;

    IF v_participant_id IS NULL THEN
        -- Check if it's the host trying to add a song (hosts can also sing)
        SELECT s.id INTO v_participant_id
        FROM public.sessions s
        WHERE s.id = p_session_id AND s.host_id = auth.uid()
        LIMIT 1;

        IF v_participant_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED: User is not a participant of this session';
        END IF;
    END IF;

    -- 2. Lock the session row to prevent race conditions during position assignment
    SELECT status INTO v_session_status
    FROM public.sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF v_session_status IS NULL THEN
        RAISE EXCEPTION 'SESSION_NOT_FOUND: Session does not exist';
    END IF;

    IF v_session_status = 'ended' THEN
        RAISE EXCEPTION 'SESSION_CLOSED: Cannot add songs to an ended session';
    END IF;

    -- 3. Check for active song (Microfone Justo rule).
    -- (The DB unique index also catches this, but checking explicitly gives a clearer error early)
    IF EXISTS (
        SELECT 1 FROM public.queue
        WHERE session_id = p_session_id
          AND participant_id = v_participant_id
          AND status IN ('pending', 'preparing', 'singing')
    ) THEN
        RAISE EXCEPTION 'ACTIVE_SONG_EXISTS: Participant already has an active song';
    END IF;

    -- 4. Calculate deterministic position safely
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_position
    FROM public.queue
    WHERE session_id = p_session_id;

    -- 5. Insert the new request
    INSERT INTO public.queue (
        session_id,
        participant_id,
        song_title,
        artist,
        status,
        position
    ) VALUES (
        p_session_id,
        v_participant_id,
        trim(p_song_title),
        trim(p_artist),
        'pending',
        v_next_position
    )
    RETURNING * INTO v_inserted_row;

    RETURN v_inserted_row;
END;
$$;

-- Revoke public access and grant only to authenticated roles
REVOKE EXECUTE ON FUNCTION public.create_queue_entry(UUID, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_queue_entry(UUID, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_queue_entry(UUID, VARCHAR, VARCHAR) TO anon;
