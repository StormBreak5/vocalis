-- Add auth_user_id to participants
ALTER TABLE participants ADD COLUMN auth_user_id UUID REFERENCES auth.users(id);

-- Add unique constraint to prevent duplicate participants in the same session
ALTER TABLE participants ADD CONSTRAINT participants_session_auth_user_unique UNIQUE (session_id, auth_user_id);

-- Drop the deprecated recovery_token_hash column
ALTER TABLE participants DROP COLUMN recovery_token_hash;
