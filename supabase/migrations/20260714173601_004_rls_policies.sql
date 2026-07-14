ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.sessions TO anon, authenticated;
GRANT SELECT ON public.participants TO anon, authenticated;

CREATE POLICY sessions_select_public ON sessions
  FOR SELECT TO anon, authenticated USING (status != 'closed');

-- sessions_insert_blocked: implicit since no insert policy
-- sessions_delete_blocked: implicit since no delete policy

CREATE POLICY sessions_update_own ON sessions
  FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());


ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY participants_select_session ON participants
  FOR SELECT TO anon, authenticated USING (
    session_id IN (
      SELECT id FROM sessions WHERE status != 'closed'
    )
  );

-- participants_insert_blocked: implicit
-- participants_update_blocked: implicit
-- participants_delete_blocked: implicit
