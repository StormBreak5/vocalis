import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { createQueueEntryAction } from '@/src/application/queue/create-queue-entry.action';
import { cancelQueueEntryAction } from '@/src/application/queue/cancel-queue-entry.action';
vi.mock('@/src/infrastructure/supabase/server',()=>({createSupabaseServerClient:vi.fn()}));
const sessionId='11111111-1111-4111-8111-111111111111'; const queueId='22222222-2222-4222-8222-222222222222';

describe('closed session writer actions',()=>{
  const rpc=vi.fn(); const auth={getUser:vi.fn().mockResolvedValue({data:{user:{id:'user'}}})};
  beforeEach(()=>{vi.clearAllMocks();vi.mocked(createSupabaseServerClient).mockResolvedValue({rpc,auth} as never)});
  it('normaliza uma linha de create_queue_entry',async()=>{
    rpc.mockResolvedValue({data:[{id:queueId,session_id:sessionId,participant_id:'33333333-3333-4333-8333-333333333333',song_title:'Song',artist:'Artist',status:'pending',position:1,created_at:'now',updated_at:'now'}],error:null});
    await expect(createQueueEntryAction(sessionId,{songTitle:'Song',artist:'Artist'})).resolves.toMatchObject({ok:true,queueEntry:{id:queueId}});
  });
  it.each<[unknown]>([[[]],[[{id:queueId},{id:queueId}]]])('rejeita cardinalidade inválida de create',async(data)=>{rpc.mockResolvedValue({data,error:null});await expect(createQueueEntryAction(sessionId,{songTitle:'Song',artist:'Artist'})).resolves.toMatchObject({ok:false,code:'RPC_RESULT_CARDINALITY'})});
  it('traduz closed em create e cancel',async()=>{
    rpc.mockResolvedValue({data:null,error:{message:'SESSION_CLOSED'}});
    await expect(createQueueEntryAction(sessionId,{songTitle:'Song',artist:'Artist'})).resolves.toMatchObject({ok:false,code:'SESSION_CLOSED'});
    await expect(cancelQueueEntryAction(queueId)).resolves.toMatchObject({ok:false,code:'SESSION_CLOSED'});
  });
  it('cancel mantém DTO de sucesso void',async()=>{rpc.mockResolvedValue({data:null,error:null});await expect(cancelQueueEntryAction(queueId)).resolves.toEqual({ok:true})});
});
