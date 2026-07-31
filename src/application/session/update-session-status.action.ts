'use server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { updateSessionStatusRpcRowSchema, type UpdateSessionStatusResult } from '@/src/domain/session.types';
import { expectSingleRpcRow, RpcResultContractError } from '@/src/application/shared/expect-single-rpc-row';
import { mapSessionError } from './session-error.mapper';

export async function updateSessionStatusAction(sessionId:string,newStatus:'active'|'paused'):Promise<AppSuccess<{result:UpdateSessionStatusResult}>|AppError>{
  if(!z.string().uuid().safeParse(sessionId).success) return mapSessionError('SESSION_NOT_FOUND_OR_FORBIDDEN');
  try{
    const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser();
    if(!user) return mapSessionError('AUTH_REQUIRED');
    const {data,error}=await supabase.rpc('update_session_status',{p_session_id:sessionId,p_new_status:newStatus});
    if(error) return mapSessionError(error);
    const row=expectSingleRpcRow(data,updateSessionStatusRpcRowSchema);
    return {ok:true,result:row};
  }catch(error){return error instanceof RpcResultContractError?error.appError:mapSessionError(error)}
}
