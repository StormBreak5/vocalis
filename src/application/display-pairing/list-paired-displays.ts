import { z } from 'zod';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { pairedDisplayRpcRowSchema, type PairedDisplaySummary } from '@/src/domain/display-pairing.types';

const rowsSchema = z.array(pairedDisplayRpcRowSchema);

/** Host-only. Returns [] on any error or schema mismatch — fail-closed, never partial. */
export async function listPairedDisplays(sessionId: string): Promise<PairedDisplaySummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('list_paired_displays', { p_session_id: sessionId });
  if (error) return [];
  const parsed = rowsSchema.safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.map((row) => ({ id: row.id, pairedAt: row.paired_at }));
}
