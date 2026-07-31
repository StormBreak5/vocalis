import { createSupabaseServerClient } from '../server';
import { Session, HostSessionDetails, hostSessionDetailsRpcRowSchema } from '@/src/domain/session.types';
import type { Database } from '../database.types';

export async function getSessionByCode(code: string): Promise<Session | null> {
  const supabase = await createSupabaseServerClient();
  const normalizedCode = code.trim().toUpperCase();

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('code', normalizedCode)
    .single();

  if (error || !data) {
    return null;
  }

  // The database RLS or query itself might filter out 'closed' depending on the policy,
  // but let's double check here just in case.
  if (data.status === 'closed') {
    return null;
  }

  return {
    id: data.id,
    code: data.code,
    status: data.status as Session['status'],
    hostId: data.host_id,
    createdAt: data.created_at,
    closedAt: data.closed_at,
    maxParticipants: data.max_participants,
    maxQueueEntries: data.max_queue_entries,
  };
}

export type SessionStatusRow = Pick<Database['public']['Tables']['sessions']['Row'], 'id' | 'code' | 'status' | 'closed_at'>;

export async function getSessionStatusRowById(sessionId: string): Promise<SessionStatusRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('sessions').select('id,code,status,closed_at').eq('id', sessionId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Consulta tipada de get_host_session_details — exclusiva para Host proprietário.
 * Normaliza a coleção RETURNS TABLE para cardinalidade exatamente 1.
 * Retorna null em caso de RLS/error esperado (SESSION_NOT_FOUND_OR_FORBIDDEN, array vazio).
 * Lança RPC_RESULT_CARDINALITY se o banco retornar mais de 1 linha (invariante quebrado).
 */
export async function getHostSessionDetails(sessionId: string): Promise<HostSessionDetails | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_host_session_details', { p_session_id: sessionId });
  if (error) return null;
  if (!Array.isArray(data)) return null;
  if (data.length === 0) return null;
  if (data.length > 1) throw new Error('RPC_RESULT_CARDINALITY');
  const parsed = hostSessionDetailsRpcRowSchema.safeParse(data[0]);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    closedAt: r.closed_at,
    createdAt: r.created_at,
    maxParticipants: r.max_participants,
    maxQueueEntries: r.max_queue_entries,
  };
}