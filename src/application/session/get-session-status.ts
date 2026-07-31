'use server';

import { z } from 'zod';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import type { SessionStatusSnapshot } from '@/src/domain/session.types';
import { toSessionStatusSnapshot } from '@/src/domain/session-lifecycle';
import { getSessionStatusRowById } from '@/src/infrastructure/supabase/queries/session.queries';
import { mapSessionError } from './session-error.mapper';

const sessionIdSchema = z.string().uuid();

export async function getSessionStatus(sessionId: string): Promise<AppSuccess<{ snapshot:SessionStatusSnapshot }> | AppError> {
  const parsedId=sessionIdSchema.safeParse(sessionId);
  if(!parsedId.success) return mapSessionError('SESSION_NOT_FOUND_OR_FORBIDDEN');
  try {
    const row=await getSessionStatusRowById(parsedId.data);
    if(!row) return mapSessionError('SESSION_NOT_FOUND_OR_FORBIDDEN');
    return { ok:true, snapshot:toSessionStatusSnapshot(row) };
  } catch(error) {
    return mapSessionError(error);
  }
}
