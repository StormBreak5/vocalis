'use server';

import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { AppError, AppSuccess } from '../../domain/errors.types';
import { ActiveQueueEntry, QueueEntry } from '../../domain/queue.types';

export async function listActiveQueueAction(
  sessionId: string
): Promise<AppSuccess<{ queue: ActiveQueueEntry[] }> | AppError> {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Check if the user is authenticated (they must be to read the queue via RLS)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, code: 'UNAUTHORIZED', userMessage: 'Você não tem permissão para visualizar a fila.' };
    }

    // Fetch queue entries with status pending, preparing, singing
    // We also join with participants to get the participantName
    const { data, error } = await supabase
      .from('queue')
      .select('*, participants(display_name)')
      .eq('session_id', sessionId)
      .in('status', ['pending', 'preparing', 'singing'])
      .order('position', { ascending: true });

    if (error) {
      console.error('listActiveQueueAction Supabase error:', error);
      return { ok: false, code: 'UNKNOWN', userMessage: 'Erro ao carregar a fila atual.' };
    }

    const queue: ActiveQueueEntry[] = (data || []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      participantId: row.participant_id,
      songTitle: row.song_title,
      artist: row.artist,
      status: row.status as QueueEntry['status'],
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      participantName: (row.participants as unknown as { display_name: string })?.display_name || 'Cantor',
    }));

    return { ok: true, queue };
  } catch (error) {
    console.error('listActiveQueueAction unexpected error:', error);
    return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro inesperado.' };
  }
}
