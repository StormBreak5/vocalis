import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { displaySessionDetailsRpcRowSchema, type DisplaySessionDetails } from '@/src/domain/display-pairing.types';
import { expectSingleRpcRow } from '@/src/application/shared/expect-single-rpc-row';

/**
 * Host or non-revoked paired display only. Returns null for any other
 * identity (participant, unrelated visitor, revoked display) — the RPC
 * collapses "session not found" and "not authorized" into the same
 * SESSION_NOT_FOUND_OR_FORBIDDEN, so this never leaks which case it was.
 */
export async function getDisplaySessionDetails(sessionId: string): Promise<DisplaySessionDetails | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_display_session_details', { p_session_id: sessionId });
  if (error) return null;
  const row = expectSingleRpcRow(data, displaySessionDetailsRpcRowSchema);
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    closedAt: row.closed_at,
  };
}
