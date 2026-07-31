'use server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { mapSessionError } from '@/src/application/session/session-error.mapper';

export async function cancelQueueEntryAction(queueId:string):Promise<AppSuccess<void>|AppError>{
  if(!z.string().uuid().safeParse(queueId).success) return mapSessionError('QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN');
  try{
    const supabase=await createSupabaseServerClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return mapSessionError('AUTH_REQUIRED');
    const {error}=await supabase.rpc('cancel_queue_entry',{p_queue_id:queueId});
    return error?mapSessionError(error):{ok:true};
  }catch(error){return mapSessionError(error)}
}
