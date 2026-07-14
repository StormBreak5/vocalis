'use server';

import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { AppError, AppSuccess } from '../../domain/errors.types';
import { QueueEntry, RequestSongInput, requestSongSchema } from '../../domain/queue.types';

export async function createQueueEntryAction(
  sessionId: string,
  input: RequestSongInput
): Promise<AppSuccess<{ queueEntry: QueueEntry }> | AppError> {
  try {
    const validatedInput = requestSongSchema.parse(input);

    const supabase = await createSupabaseServerClient();

    // Call the RPC
    const { data, error } = await supabase.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: validatedInput.songTitle,
      p_artist: validatedInput.artist,
    });

    if (error || !data) {
      const msg = error?.message || '';
      
      if (msg.includes('UNAUTHORIZED')) {
        return { ok: false, code: 'UNAUTHORIZED', userMessage: 'Você não tem permissão para adicionar músicas nesta sala.' };
      }
      if (msg.includes('SESSION_NOT_FOUND')) {
        return { ok: false, code: 'SESSION_NOT_FOUND', userMessage: 'Sala não encontrada.' };
      }
      if (msg.includes('SESSION_CLOSED')) {
        return { ok: false, code: 'SESSION_CLOSED', userMessage: 'Esta sala já foi encerrada.' };
      }
      if (msg.includes('ACTIVE_SONG_EXISTS')) {
        return { ok: false, code: 'ACTIVE_SONG_EXISTS', userMessage: 'Você já tem uma música na fila! Aguarde sua vez.' };
      }

      console.error('createQueueEntryAction RPC error:', error);
      return { ok: false, code: 'UNKNOWN', userMessage: 'Erro ao adicionar música na fila.' };
    }

    const row = data;

    const queueEntry: QueueEntry = {
      id: row.id,
      sessionId: row.session_id,
      participantId: row.participant_id,
      songTitle: row.song_title,
      artist: row.artist,
      status: row.status as QueueEntry['status'],
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { ok: true, queueEntry };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
      const zodError = error as unknown as { errors: { message: string }[] };
      const firstError = zodError.errors[0]?.message || 'Dados inválidos.';
      // Zod validation error maps to generic or we could add a specific error code
      return { ok: false, code: 'UNKNOWN', userMessage: firstError };
    }
    console.error('createQueueEntryAction unexpected error:', error);
    return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro inesperado.' };
  }
}
