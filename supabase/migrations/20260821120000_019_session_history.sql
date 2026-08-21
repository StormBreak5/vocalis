-- Session history: read-only aggregate list of a Host's own sessions
-- (host_id = auth.uid()), with per-session song/participant counts. See
-- CONTEXTO.md / feature "Histórico das sessões" for context.

BEGIN;

-- list_host_sessions is the first RPC in this codebase shaped as "list MY
-- resources" rather than "list resources of session X": it takes no
-- p_session_id and scopes exclusively via s.host_id = auth.uid() inside the
-- function body, so private.is_session_host(uuid) — which requires a target
-- session id to check against — does not apply here.
--
-- This must still be SECURITY DEFINER rather than a plain PostgREST select:
-- public.sessions only grants `SELECT (id, code, status, closed_at)` to
-- authenticated (see migration 016), a column-restricted grant that excludes
-- created_at/host_id/max_participants/max_queue_entries from any direct
-- client select. Aggregating song_count/participant_count per session across
-- an entire list, in one round trip, also needs a set-returning function —
-- doing it via N+1 client queries per session would not scale.
CREATE FUNCTION public.list_host_sessions()
RETURNS TABLE(
  id uuid,
  code text,
  status text,
  created_at timestamptz,
  closed_at timestamptz,
  song_count integer,
  participant_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  -- Correlated subqueries, not a double JOIN + COUNT(DISTINCT): joining
  -- sessions directly to both queue and participants would fan out rows
  -- (N completed songs * M participants per session) before aggregation,
  -- which COUNT(DISTINCT ...) would then have to undo. Two independent
  -- correlated subqueries avoid the fan-out entirely.
  --
  -- song_count counts status = 'completed' only — the performance actually
  -- happened and was marked done. 'cancelled' entries were withdrawn before
  -- singing, and any 'pending'/'preparing'/'singing' left over when a
  -- session closes was never completed, so neither counts as a sung song.
  RETURN QUERY
  SELECT
    s.id,
    s.code::text,
    s.status,
    s.created_at,
    s.closed_at,
    COALESCE((
      SELECT count(*)::int FROM public.queue AS q
      WHERE q.session_id = s.id AND q.status = 'completed'
    ), 0) AS song_count,
    COALESCE((
      SELECT count(*)::int FROM public.participants AS p
      WHERE p.session_id = s.id
    ), 0) AS participant_count
  FROM public.sessions AS s
  WHERE s.host_id = v_auth_user_id
  ORDER BY s.created_at DESC;
END
$$;

ALTER FUNCTION public.list_host_sessions() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_host_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_host_sessions() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
