-- RLS Policies for public.queue

ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT ON public.queue TO authenticated, anon;
GRANT UPDATE ON public.queue TO authenticated;

-- SELECT: Participants can read the queue of the session they are in, and Hosts can read the queue of their sessions.
CREATE POLICY "Users can read active queue of their session"
ON public.queue
FOR SELECT
TO authenticated, anon
USING (
    session_id IN (
        SELECT session_id FROM public.participants WHERE auth_user_id = auth.uid()
    )
    OR
    session_id IN (
        SELECT id FROM public.sessions WHERE host_id = auth.uid()
    )
);

-- INSERT: Block direct inserts. Creation must go through the create_queue_entry RPC.
CREATE POLICY "Block direct inserts on queue"
ON public.queue
FOR INSERT
WITH CHECK (false);

-- UPDATE: Only Hosts can update queue status. Cancellation by participants goes through cancel_queue_entry RPC.
CREATE POLICY "Host can update queue"
ON public.queue
FOR UPDATE
TO authenticated
USING (
    session_id IN (
        SELECT id FROM public.sessions WHERE host_id = auth.uid()
    )
);

-- DELETE: Block direct deletes. Soft delete (status='cancelled') is used.
CREATE POLICY "Block direct deletes on queue"
ON public.queue
FOR DELETE
USING (false);
