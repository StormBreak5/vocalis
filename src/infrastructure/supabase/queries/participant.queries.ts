import { createSupabaseServerClient } from '../server';
import { Participant } from '@/src/domain/participant.types';

export async function getParticipantForSessionCode(code: string): Promise<Participant | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    // We join with sessions to get the participant for the given session code
    const { data, error } = await supabase
      .from('participants')
      .select('*, sessions!inner(code)')
      .eq('auth_user_id', user.id)
      .eq('sessions.code', code)
      .limit(1)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      sessionId: data.session_id,
      displayName: data.display_name,
      disambiguationIndex: data.disambiguation_index,
      joinedAt: data.joined_at,
      lastSeen: data.last_seen,
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}

export async function getParticipantsBySessionId(sessionId: string): Promise<Participant[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    displayName: row.display_name,
    disambiguationIndex: row.disambiguation_index,
    joinedAt: row.joined_at,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
  }));
}
