'use server';

import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { redeemDisplayPairingCodeRpcRowSchema, type DisplayPairingRedeemResult } from '@/src/domain/display-pairing.types';
import { expectSingleRpcRow, RpcResultContractError } from '@/src/application/shared/expect-single-rpc-row';
import { mapSessionError } from '@/src/application/session/session-error.mapper';

export async function redeemDisplayPairingCodeAction(
  roomCode: string,
  pairingCode: string,
): Promise<AppSuccess<{ result: DisplayPairingRedeemResult }> | AppError> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) return mapSessionError('AUTH_FAILED');
    }

    const { data, error } = await supabase.rpc('redeem_display_pairing_code', {
      p_room_code: roomCode,
      p_pairing_code: pairingCode,
    });
    if (error) return mapSessionError(error);
    const row = expectSingleRpcRow(data, redeemDisplayPairingCodeRpcRowSchema);
    return { ok: true, result: { sessionId: row.session_id, paired: row.paired } };
  } catch (error) {
    if (error instanceof RpcResultContractError) return error.appError;
    return mapSessionError(error);
  }
}
