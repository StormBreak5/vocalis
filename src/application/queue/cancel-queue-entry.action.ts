'use server';

import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { AppError, AppSuccess } from '../../domain/errors.types';

export async function cancelQueueEntryAction(
  queueId: string
): Promise<AppSuccess<void> | AppError> {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, code: 'UNAUTHORIZED', userMessage: 'Você não está autenticado.' };
    }

    const { error } = await supabase.rpc('cancel_queue_entry', {
      p_queue_id: queueId,
    });

    if (error) {
      console.error('cancelQueueEntryAction Supabase error:', error);
      
      if (error.message.includes('NOT_FOUND_OR_UNAUTHORIZED')) {
        return { ok: false, code: 'UNAUTHORIZED', userMessage: 'Você não tem permissão para cancelar esta música.' };
      }
      if (error.message.includes('INVALID_STATUS_TRANSITION')) {
        return { ok: false, code: 'INVALID_STATUS_TRANSITION', userMessage: 'A música não pode ser cancelada neste estágio.' };
      }
      
      return { ok: false, code: 'UNKNOWN', userMessage: 'Erro ao cancelar a música.' };
    }

    return { ok: true };
  } catch (error) {
    console.error('cancelQueueEntryAction unexpected error:', error);
    return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro inesperado.' };
  }
}
