'use server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { updateSessionStatusRpcRowSchema, type UpdateSessionStatusResult } from '@/src/domain/session.types';
import { expectSingleRpcRow, RpcResultContractError } from '@/src/application/shared/expect-single-rpc-row';
import { mapSessionError } from './session-error.mapper';
import { getSessionStatus } from './get-session-status';

const newStatusSchema = z.enum(['active', 'paused']);

async function recoverRequestedStatus(sessionId: string, newStatus: 'active' | 'paused') {
  const recovered = await getSessionStatus(sessionId);
  if (recovered.ok && recovered.snapshot.status === newStatus) {
    return {
      ok: true as const,
      result: { id: recovered.snapshot.id, status: newStatus, changed: false },
    };
  }
  return null;
}

export async function updateSessionStatusAction(sessionId:string,newStatus:'active'|'paused'):Promise<AppSuccess<{result:UpdateSessionStatusResult}>|AppError>{
  if(!z.string().uuid().safeParse(sessionId).success) return mapSessionError('SESSION_NOT_FOUND_OR_FORBIDDEN');
  const parsedStatus = newStatusSchema.safeParse(newStatus);
  if(!parsedStatus.success) return mapSessionError('INVALID_STATUS_TRANSITION');
  try{
    const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser();
    if(!user) return mapSessionError('AUTH_REQUIRED');
    const {data,error}=await supabase.rpc('update_session_status',{p_session_id:sessionId,p_new_status:parsedStatus.data});
    if(error) {
      const mapped = mapSessionError(error);
      if(mapped.code !== 'UNKNOWN') return mapped;
      const recovered = await recoverRequestedStatus(sessionId, parsedStatus.data);
      return recovered ?? mapSessionError('RESPONSE_UNCERTAIN');
    }
    const row=expectSingleRpcRow(data,updateSessionStatusRpcRowSchema);
    return {ok:true,result:row};
  }catch(error){
    if(error instanceof RpcResultContractError) return error.appError;
    const recovered = await recoverRequestedStatus(sessionId, parsedStatus.data);
    return recovered ?? mapSessionError('RESPONSE_UNCERTAIN');
  }
}
