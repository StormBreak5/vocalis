'use server';

import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { AppError, AppSuccess } from '../../domain/errors.types';
import { Participant } from '../../domain/participant.types';
import { validateSessionCode } from '../../domain/validators/session-code.validator';
import { validateDisplayName } from '../../domain/validators/display-name.validator';

export async function joinSessionAction(
  code: string,
  displayName: string
): Promise<AppSuccess<{ participant: Participant; isRecovered: boolean }> | AppError> {
  try {
    let validCode: string;
    let validName: string;

    try {
      validCode = validateSessionCode(code);
    } catch (err: unknown) {
      const userMessage = err && typeof err === 'object' && 'userMessage' in err 
        ? String(err.userMessage) 
        : 'Código inválido.';
      return { ok: false, code: 'INVALID_CODE_FORMAT', userMessage };
    }

    try {
      validName = validateDisplayName(displayName);
    } catch (err: unknown) {
      const userMessage = err && typeof err === 'object' && 'userMessage' in err 
        ? String(err.userMessage) 
        : 'Nome inválido.';
      return { ok: false, code: 'INVALID_NAME', userMessage };
    }

    const supabase = await createSupabaseServerClient();
    
    // Check if the user already has a session (Host or previously signed in Anonymous user)
    let { data: { user } } = await supabase.auth.getUser();

    let isRecovered = false;

    if (!user) {
      // Create a new anonymous session
      const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
      if (authError) {
        return { ok: false, code: 'AUTH_FAILED', userMessage: 'Falha na autenticação.' };
      }
      user = authData.user;
    } else {
      isRecovered = true; // They already had a session (either anon from before, or they are the host)
    }

    // Call the updated join_session RPC which uses auth.uid()
    const { data, error } = await supabase.rpc('join_session', {
      p_code: validCode,
      p_display_name: validName,
    });

    if (error || !data) {
      const msg = error?.message || '';
      if (msg.includes('SESSION_NOT_FOUND')) {
        return { ok: false, code: 'SESSION_NOT_FOUND', userMessage: 'Sala não encontrada.' };
      }
      if (msg.includes('SESSION_CLOSED')) {
        return { ok: false, code: 'SESSION_CLOSED', userMessage: 'Esta sala já foi encerrada.' };
      }
      if (msg.includes('SESSION_PAUSED')) {
        return { ok: false, code: 'SESSION_PAUSED', userMessage: 'A sala está pausada e não aceita novos participantes.' };
      }
      if (msg.includes('SESSION_FULL')) {
        return { ok: false, code: 'SESSION_FULL', userMessage: 'A sala está cheia.' };
      }
      return { ok: false, code: 'UNKNOWN', userMessage: 'Erro ao entrar na sala.' };
    }

    const row = data.participant;
    if (!row) {
      return { ok: false, code: 'UNKNOWN', userMessage: 'Erro inesperado.' };
    }

    const participant: Participant = {
      id: row.id,
      sessionId: row.session_id,
      displayName: row.display_name,
      disambiguationIndex: row.disambiguation_index,
      joinedAt: row.joined_at,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
    };

    // The old vocalis_pid cookie is completely deprecated. Auth is handled natively by Supabase.

    return { ok: true, participant, isRecovered };
  } catch (error) {
    console.error('joinSessionAction error:', error);
    return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro inesperado.' };
  }
}
