'use server';

import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { AppError, AppSuccess } from '../../domain/errors.types';
import { Session } from '../../domain/session.types';

export async function updateSessionStatusAction(
  sessionId: string,
  newStatus: Session['status']
): Promise<AppSuccess<void> | AppError> {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, code: 'UNAUTHORIZED', userMessage: 'Você não tem permissão para realizar esta ação.' };
    }

    // Must be host check
    const { data: sessionData } = await supabase
      .from('sessions')
      .select('host_id')
      .eq('id', sessionId)
      .single();

    if (sessionData?.host_id !== user.id) {
      return { ok: false, code: 'UNAUTHORIZED', userMessage: 'Apenas o anfitrião pode alterar o status da sala.' };
    }

    const { error } = await supabase
      .from('sessions')
      .update({ status: newStatus })
      .eq('id', sessionId);

    if (error) {
      console.error('updateSessionStatusAction Supabase error:', error);
      return { ok: false, code: 'UNKNOWN', userMessage: 'Erro ao atualizar o status da sala.' };
    }

    return { ok: true };
  } catch (error) {
    console.error('updateSessionStatusAction unexpected error:', error);
    return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro inesperado.' };
  }
}
