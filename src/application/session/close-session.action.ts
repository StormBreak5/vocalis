'use server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { closeSessionRpcRowSchema, type CloseSessionResult } from '@/src/domain/session.types';
import { expectSingleRpcRow, RpcResultContractError } from '@/src/application/shared/expect-single-rpc-row';
import { getSessionStatus } from './get-session-status';
import { mapSessionError } from './session-error.mapper';

export async function closeSessionAction(sessionId:string):Promise<AppSuccess<{result:CloseSessionResult}>|AppError>{
  if(!z.string().uuid().safeParse(sessionId).success)return mapSessionError('SESSION_NOT_FOUND_OR_FORBIDDEN');
  try{
    const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser();
    if(!user)return mapSessionError('AUTH_REQUIRED');
    const {data,error}=await supabase.rpc('close_session',{p_session_id:sessionId});
    if(error){
      const mapped=mapSessionError(error);
      if(mapped.code!=='UNKNOWN')return mapped;
      const recovered=await getSessionStatus(sessionId);
      if(recovered.ok&&recovered.snapshot.status==='closed'&&recovered.snapshot.closedAt){
        return {ok:true,result:{sessionId:recovered.snapshot.id,status:'closed',closedAt:recovered.snapshot.closedAt,changed:false}};
      }
      return mapSessionError('RESPONSE_UNCERTAIN');
    }
    const row=expectSingleRpcRow(data,closeSessionRpcRowSchema);
    return {ok:true,result:{sessionId:row.session_id,status:'closed',closedAt:row.closed_at,changed:row.changed}};
  }catch(error){
    if(error instanceof RpcResultContractError)return error.appError;
    const recovered=await getSessionStatus(sessionId);
    if(recovered.ok&&recovered.snapshot.status==='closed'&&recovered.snapshot.closedAt)return {ok:true,result:{sessionId:recovered.snapshot.id,status:'closed',closedAt:recovered.snapshot.closedAt,changed:false}};
    return mapSessionError('RESPONSE_UNCERTAIN');
  }
}
