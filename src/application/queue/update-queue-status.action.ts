'use server';

import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { AppError, AppSuccess } from '../../domain/errors.types';
import { QueueEntry } from '../../domain/queue.types';

export async function updateQueueStatusAction(
  queueId: string,
  newStatus: QueueEntry['status']
): Promise<AppSuccess<void> | AppError> {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Check if the user is authenticated (they must be the Host to update the queue via RLS)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, code: 'UNAUTHORIZED', userMessage: 'Você não tem permissão para realizar esta ação.' };
    }

    const { error } = await supabase
      .from('queue')
      .update({ status: newStatus })
      .eq('id', queueId);

    if (error) {
      console.error('updateQueueStatusAction Supabase error:', error);
      return { ok: false, code: 'UNKNOWN', userMessage: 'Erro ao atualizar o status da música.' };
    }

    return { ok: true };
  } catch (error) {
    console.error('updateQueueStatusAction unexpected error:', error);
    return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro inesperado.' };
  }
}
