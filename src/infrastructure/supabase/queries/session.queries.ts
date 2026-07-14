import { createSupabaseServerClient } from '../server';
import { Session } from '@/src/domain/session.types';

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
