'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { generateDisplayPairingCodeRpcRowSchema, type DisplayPairingCode } from '@/src/domain/display-pairing.types';
import { expectSingleRpcRow, RpcResultContractError } from '@/src/application/shared/expect-single-rpc-row';
import { mapSessionError } from '@/src/application/session/session-error.mapper';

export async function generateDisplayPairingCodeAction(
  sessionId: string,
): Promise<AppSuccess<{ pairing: DisplayPairingCode }> | AppError> {
  if (!z.string().uuid().safeParse(sessionId).success) return mapSessionError('SESSION_NOT_FOUND_OR_FORBIDDEN');
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('generate_display_pairing_code', { p_session_id: sessionId });
    if (error) return mapSessionError(error);
    const row = expectSingleRpcRow(data, generateDisplayPairingCodeRpcRowSchema);
    return { ok: true, pairing: { code: row.code, expiresAt: row.expires_at } };
  } catch (error) {
    if (error instanceof RpcResultContractError) return error.appError;
    return mapSessionError(error);
  }
}
