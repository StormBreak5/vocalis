'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { AppError, AppSuccess, USER_MESSAGES } from '../../domain/errors.types';
import { ActiveQueueEntry, activeQueueRpcRowSchema } from '../../domain/queue.types';
import { mapSessionError } from '../session/session-error.mapper';

const rowsSchema = z.array(activeQueueRpcRowSchema);

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

    // list_active_queue is a SECURITY DEFINER RPC: it resolves each entry's
    // participant display_name internally so callers with queue access but
    // no participants access (a paired display, see specs/004-display-pairing)
    // still get the real name, instead of a PostgREST-embedded join silently
    // dropping it. See specs/004-display-pairing/research.md R15.
    const { data, error } = await supabase.rpc('list_active_queue', { p_session_id: sessionId });

    if (error) return mapSessionError(error);

    const parsed = rowsSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, code: 'RPC_RESULT_INVALID', userMessage: USER_MESSAGES.RPC_RESULT_INVALID };
    }

    const queue: ActiveQueueEntry[] = parsed.data.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      participantId: row.participant_id,
      songTitle: row.song_title,
      artist: row.artist,
      status: row.status,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      participantName: row.participant_name,
    }));

    return { ok: true, queue };
  } catch (error) {
    console.error('listActiveQueueAction unexpected error:', error);
    return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro inesperado.' };
  }
}
