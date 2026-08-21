import { z } from 'zod';
import { createSupabaseServerClient } from '../server';
import { listHostSessionsRpcRowSchema, type HostSessionHistoryEntry } from '@/src/domain/session-history.types';

const rowsSchema = z.array(listHostSessionsRpcRowSchema);

/**
 * Host-only. Returns [] on any RPC error (including AUTH_REQUIRED when there
 * is no auth session at all) or schema mismatch — fail-closed, never
 * partial, mirrors listPairedDisplays. Callers that need to distinguish "no
 * auth session" from "authenticated host with zero sessions" must check
 * auth.getUser() separately before calling this — see app/historico/page.tsx.
 */
export async function listHostSessions(): Promise<HostSessionHistoryEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('list_host_sessions');
  if (error) return [];
  const parsed = rowsSchema.safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    songCount: row.song_count,
    participantCount: row.participant_count,
  }));
}
