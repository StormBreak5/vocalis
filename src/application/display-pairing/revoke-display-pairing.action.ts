'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { revokeDisplayPairingRpcRowSchema, type DisplayPairingRevokeResult } from '@/src/domain/display-pairing.types';
import { expectSingleRpcRow, RpcResultContractError } from '@/src/application/shared/expect-single-rpc-row';
import { mapSessionError } from '@/src/application/session/session-error.mapper';

export async function revokeDisplayPairingAction(
  displayPairingId: string,
): Promise<AppSuccess<{ revocation: DisplayPairingRevokeResult }> | AppError> {
  if (!z.string().uuid().safeParse(displayPairingId).success) return mapSessionError('PAIRING_NOT_FOUND_OR_FORBIDDEN');
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('revoke_display_pairing', { p_display_pairing_id: displayPairingId });
    if (error) return mapSessionError(error);
    const row = expectSingleRpcRow(data, revokeDisplayPairingRpcRowSchema);
    return { ok: true, revocation: { id: row.id, revoked: row.revoked } };
  } catch (error) {
    if (error instanceof RpcResultContractError) return error.appError;
    return mapSessionError(error);
  }
}
