'use server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { updateQueueStatusRpcRowSchema, type QueueStatus, type UpdateQueueStatusResult } from '@/src/domain/queue.types';
import { expectSingleRpcRow, RpcResultContractError } from '@/src/application/shared/expect-single-rpc-row';
import { mapSessionError } from '@/src/application/session/session-error.mapper';

export async function updateQueueStatusAction(queueId:string,newStatus:QueueStatus):Promise<AppSuccess<{result:UpdateQueueStatusResult}>|AppError>{
  if(!z.string().uuid().safeParse(queueId).success) return mapSessionError('QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN');
  try{
    const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser();
    if(!user) return mapSessionError('AUTH_REQUIRED');
    const {data,error}=await supabase.rpc('update_queue_status',{p_queue_id:queueId,p_new_status:newStatus});
    if(error) return mapSessionError(error);
    const row=expectSingleRpcRow(data,updateQueueStatusRpcRowSchema);
    return {ok:true,result:{id:row.id,status:row.status,updatedAt:row.updated_at,changed:row.changed}};
  }catch(error){return error instanceof RpcResultContractError?error.appError:mapSessionError(error)}
}
