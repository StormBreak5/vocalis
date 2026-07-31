'use server';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { queueEntryRpcRowSchema, requestSongSchema, type QueueEntry, type RequestSongInput } from '@/src/domain/queue.types';
import { expectSingleRpcRow, RpcResultContractError } from '@/src/application/shared/expect-single-rpc-row';
import { mapSessionError } from '@/src/application/session/session-error.mapper';

export async function createQueueEntryAction(sessionId:string,input:RequestSongInput):Promise<AppSuccess<{queueEntry:QueueEntry}>|AppError>{
  const validated=requestSongSchema.safeParse(input);
  if(!validated.success) return mapSessionError('INVALID_SONG');
  try{
    const supabase=await createSupabaseServerClient();
    const {data,error}=await supabase.rpc('create_queue_entry',{p_session_id:sessionId,p_song_title:validated.data.songTitle,p_artist:validated.data.artist});
    if(error) return mapSessionError(error);
    const row=expectSingleRpcRow(data,queueEntryRpcRowSchema);
    return {ok:true,queueEntry:{id:row.id,sessionId:row.session_id,participantId:row.participant_id,songTitle:row.song_title,artist:row.artist,status:row.status,position:row.position,createdAt:row.created_at,updatedAt:row.updated_at}};
  }catch(error){return error instanceof RpcResultContractError?error.appError:mapSessionError(error)}
}
