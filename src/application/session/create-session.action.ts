'use server';

import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { AppError, AppSuccess } from '../../domain/errors.types';
import { Session } from '../../domain/session.types';
import { revalidatePath } from 'next/cache';

export async function createSessionAction(): Promise<AppSuccess<{ session: Session }> | AppError> {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Check current auth
    const { data: { session: authSession } } = await supabase.auth.getSession();
    
    let userId: string;
    
    if (!authSession) {
      // Sign in anonymously
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        return { ok: false, code: 'AUTH_FAILED', userMessage: 'Falha na autenticação.' };
      }
      userId = data.user.id;
    } else {
      userId = authSession.user.id;
    }

    // Call RPC
    const { data: newSession, error: rpcError } = await supabase.rpc('create_session', { p_host_id: userId });
    
    if (rpcError || !newSession) {
      if (rpcError?.message?.includes('CODE_GENERATION_FAILED')) {
        return { ok: false, code: 'CODE_GENERATION_FAILED', userMessage: 'Falha ao gerar código da sala.' };
      }
      return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro desconhecido.' };
    }

    const sessionDomain: Session = {
      id: newSession.id,
      code: newSession.code,
      status: newSession.status as Session['status'],
      hostId: newSession.host_id,
      createdAt: newSession.created_at,
      closedAt: newSession.closed_at,
      maxParticipants: newSession.max_participants,
      maxQueueEntries: newSession.max_queue_entries,
    };

    revalidatePath('/');
    
    return { ok: true, session: sessionDomain };
  } catch (error) {
    console.error('createSessionAction error:', error);
    return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro desconhecido.' };
  }
}
