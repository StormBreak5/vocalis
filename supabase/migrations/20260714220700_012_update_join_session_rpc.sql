-- Update join_session to use auth.uid() instead of generating a recovery token

-- Drop the old function because we are changing the return type from join_session_result to JSONB
DROP FUNCTION IF EXISTS public.join_session(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.join_session(VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.join_session(
    p_code TEXT,
    p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id UUID;
    v_session_status VARCHAR;
    v_participant_count INTEGER;
    v_disambiguation INTEGER := 1;
    v_participant_row public.participants;
    v_auth_user_id UUID := auth.uid();
BEGIN
    -- Check if authenticated
    IF v_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Must be authenticated to join a session';
    END IF;

    -- 1. Find session
    SELECT id, status INTO v_session_id, v_session_status
    FROM public.sessions
    WHERE code = p_code
    FOR UPDATE;

    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'SESSION_NOT_FOUND';
    END IF;

    IF v_session_status = 'ended' THEN
        RAISE EXCEPTION 'SESSION_CLOSED';
    END IF;

    IF v_session_status = 'paused' THEN
        RAISE EXCEPTION 'SESSION_PAUSED';
    END IF;

    -- 2. Check room capacity
    SELECT COUNT(*) INTO v_participant_count
    FROM public.participants
    WHERE session_id = v_session_id;

    IF v_participant_count >= 100 THEN
        RAISE EXCEPTION 'SESSION_FULL';
    END IF;

    -- 3. Check if participant already exists for this auth_user_id
    SELECT * INTO v_participant_row
    FROM public.participants
    WHERE session_id = v_session_id AND auth_user_id = v_auth_user_id
    LIMIT 1;

    IF v_participant_row IS NOT NULL THEN
        -- Just return existing
        UPDATE public.participants
        SET last_seen = NOW()
        WHERE id = v_participant_row.id;
        
        RETURN jsonb_build_object(
            'participant', to_jsonb(v_participant_row)
        );
    END IF;

    -- 4. Calculate disambiguation
    SELECT COALESCE(MAX(disambiguation_index), 0) + 1 INTO v_disambiguation
    FROM public.participants
    WHERE session_id = v_session_id
      AND lower(display_name) = lower(trim(p_display_name));

    -- 5. Insert new participant
    INSERT INTO public.participants (
        session_id,
        display_name,
        disambiguation_index,
        auth_user_id
    ) VALUES (
        v_session_id,
        trim(p_display_name),
        v_disambiguation,
        v_auth_user_id
    ) RETURNING * INTO v_participant_row;

    -- Return JSON format matching the expected schema for the client
    RETURN jsonb_build_object(
        'participant', to_jsonb(v_participant_row)
    );
END;
$$;
