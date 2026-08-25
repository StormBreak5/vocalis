'use server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { USER_MESSAGES, type AppError, type AppSuccess } from '@/src/domain/errors.types';
import { reorderQueueRpcRowSchema, type ReorderQueueResult } from '@/src/domain/queue.types';
import { mapSessionError } from '@/src/application/session/session-error.mapper';

export async function reorderQueueAction(sessionId:string,orderedQueueIds:string[]):Promise<AppSuccess<{result:ReorderQueueResult}>|AppError>{
  if(!z.string().uuid().safeParse(sessionId).success) return mapSessionError('SESSION_NOT_FOUND_OR_FORBIDDEN');
  const idsCheck=z.array(z.string().uuid());
  if(!idsCheck.safeParse(orderedQueueIds).success) return mapSessionError('INVALID_QUEUE_ORDER');
  try{
    const supabase=await createSupabaseServerClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return mapSessionError('AUTH_REQUIRED');
    const {data,error}=await supabase.rpc('reorder_queue',{p_session_id:sessionId,p_queue_ids:orderedQueueIds});
    if(error) return mapSessionError(error);
    const parsed=z.array(reorderQueueRpcRowSchema).safeParse(data);
    if(!parsed.success) return {ok:false,code:'RPC_RESULT_INVALID',userMessage:USER_MESSAGES.RPC_RESULT_INVALID};
    return {ok:true,result:parsed.data.map((row)=>({id:row.id,position:row.position}))};
  }catch(error){return mapSessionError(error)}
}
