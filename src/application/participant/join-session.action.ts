'use server';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import type { AppError, AppSuccess } from '@/src/domain/errors.types';
import { joinSessionPayloadSchema, type Participant } from '@/src/domain/participant.types';
import { validateSessionCode } from '@/src/domain/validators/session-code.validator';
import { validateDisplayName } from '@/src/domain/validators/display-name.validator';
import { mapSessionError } from '@/src/application/session/session-error.mapper';

export async function joinSessionAction(code:string,displayName:string):Promise<AppSuccess<{participant:Participant;isRecovered:boolean}>|AppError>{
  let validCode:string; let validName:string;
  try{validCode=validateSessionCode(code)}catch{return mapSessionError('INVALID_CODE_FORMAT')}
  try{validName=validateDisplayName(displayName)}catch{return mapSessionError('INVALID_NAME')}
  try{
    const supabase=await createSupabaseServerClient();
    let {data:{user}}=await supabase.auth.getUser(); const isRecovered=Boolean(user);
    if(!user){const auth=await supabase.auth.signInAnonymously(); if(auth.error||!auth.data.user)return mapSessionError('AUTH_FAILED'); user=auth.data.user}
    const {data,error}=await supabase.rpc('join_session',{p_code:validCode,p_display_name:validName});
    if(error)return mapSessionError(error);
    const parsed=joinSessionPayloadSchema.safeParse(data);
    if(!parsed.success)return mapSessionError('RPC_RESULT_INVALID');
    const row=parsed.data.participant;
    return {ok:true,isRecovered,participant:{id:row.id,sessionId:row.session_id,displayName:row.display_name,disambiguationIndex:row.disambiguation_index,joinedAt:row.joined_at,lastSeen:row.last_seen,createdAt:row.created_at}};
  }catch(error){return mapSessionError(error)}
}
