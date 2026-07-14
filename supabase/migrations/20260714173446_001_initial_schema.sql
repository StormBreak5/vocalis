CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code char(6) NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  max_participants smallint NOT NULL DEFAULT 50,
  max_queue_entries smallint NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

CREATE INDEX sessions_host_id_idx ON sessions (host_id);
CREATE INDEX sessions_status_idx ON sessions (status) WHERE status != 'closed';

CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  disambiguation_index smallint NOT NULL DEFAULT 1,
  recovery_token_hash text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX participants_session_name_idx ON participants (session_id, display_name, disambiguation_index);
CREATE INDEX participants_id_idx ON participants (id);
CREATE INDEX participants_session_id_idx ON participants (session_id);
