'use server';

import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { AppError, AppSuccess } from '../../domain/errors.types';
import { Participant } from '../../domain/participant.types';
import { validateSessionCode } from '../../domain/validators/session-code.validator';
import { validateDisplayName } from '../../domain/validators/display-name.validator';
import { cookies } from 'next/headers';

export async function joinSessionAction(
  code: string,
  displayName: string
): Promise<AppSuccess<{ participant: Participant; isRecovered: boolean }> | AppError> {
  try {
    let validCode: string;
    let validName: string;

    try {
      validCode = validateSessionCode(code);
    } catch (err: any) {
      return { ok: false, code: 'INVALID_CODE_FORMAT', userMessage: err.userMessage || 'Código inválido.' };
    }

    try {
      validName = validateDisplayName(displayName);
    } catch (err: any) {
      return { ok: false, code: 'INVALID_NAME', userMessage: err.userMessage || 'Nome inválido.' };
    }

    const supabase = await createSupabaseServerClient();
    const cookieStore = await cookies();
    const pidCookie = cookieStore.get('vocalis_pid')?.value;

    let participantId: string | null = null;
    let recoveryToken: string | null = null;

    if (pidCookie) {
      try {
        const parsed = JSON.parse(pidCookie);
        if (parsed.code === validCode && parsed.participantId && parsed.recoveryToken) {
          participantId = parsed.participantId;
          recoveryToken = parsed.recoveryToken;
        }
      } catch (err) {
        // invalid cookie, ignore
      }
    }

    // Try recovery first
    if (participantId && recoveryToken) {
      const { data: recoveredRow, error: recoverError } = await supabase.rpc('recover_participant', {
        p_participant_id: participantId,
        p_recovery_token: recoveryToken,
        p_code: validCode,
      });

      if (!recoverError && recoveredRow) {
        const participant: Participant = {
          id: recoveredRow.id,
          sessionId: recoveredRow.session_id,
          displayName: recoveredRow.display_name,
          disambiguationIndex: recoveredRow.disambiguation_index,
          joinedAt: recoveredRow.joined_at,
          lastSeen: recoveredRow.last_seen,
          createdAt: recoveredRow.created_at,
        };

        return { ok: true, participant, isRecovered: true };
      }
      // If recovery fails, we just proceed to join as new
    }

    // New join
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

    const row = data.participant as any;
    const newRecoveryToken = data.recovery_token as string;

    const participant: Participant = {
      id: row.id,
      sessionId: row.session_id,
      displayName: row.display_name,
      disambiguationIndex: row.disambiguation_index,
      joinedAt: row.joined_at,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
    };

    // Set cookie
    const cookieData = JSON.stringify({
      code: validCode,
      participantId: participant.id,
      recoveryToken: newRecoveryToken,
    });

    cookieStore.set('vocalis_pid', cookieData, {
      path: `/sala/${validCode}`,
      maxAge: 86400, // 24 hours
      sameSite: 'strict',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });

    return { ok: true, participant, isRecovered: false };
  } catch (error) {
    console.error('joinSessionAction error:', error);
    return { ok: false, code: 'UNKNOWN', userMessage: 'Ocorreu um erro inesperado.' };
  }
}
