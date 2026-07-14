import { createSupabaseServerClient } from '../server';
import { Participant } from '@/src/domain/participant.types';

export async function getParticipantFromCookie(code: string, cookieValue: string): Promise<Participant | null> {
  try {
    const parsed = JSON.parse(cookieValue);
    if (!parsed.participantId || !parsed.recoveryToken || parsed.code !== code) {
      return null;
    }

    const supabase = await createSupabaseServerClient();
    const { data: recoveredRow, error } = await supabase.rpc('recover_participant', {
      p_participant_id: parsed.participantId,
      p_recovery_token: parsed.recoveryToken,
      p_code: code,
    });

    if (error || !recoveredRow) {
      return null;
    }

    return {
      id: recoveredRow.id,
      sessionId: recoveredRow.session_id,
      displayName: recoveredRow.display_name,
      disambiguationIndex: recoveredRow.disambiguation_index,
      joinedAt: recoveredRow.joined_at,
      lastSeen: recoveredRow.last_seen,
      createdAt: recoveredRow.created_at,
    };
  } catch (err) {
    return null;
  }
}
