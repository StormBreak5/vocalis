import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { updateQueueStatusAction } from '@/src/application/queue/update-queue-status.action';
import { updateSessionStatusAction } from '@/src/application/session/update-session-status.action';
vi.mock('@/src/infrastructure/supabase/server',()=>({createSupabaseServerClient:vi.fn()}));
const sessionId='11111111-1111-4111-8111-111111111111'; const queueId='22222222-2222-4222-8222-222222222222';

describe('status RPC consumers',()=>{
  const rpc=vi.fn(); const auth={getUser:vi.fn().mockResolvedValue({data:{user:{id:'host'}}})};
  beforeEach(()=>{vi.clearAllMocks();vi.mocked(createSupabaseServerClient).mockResolvedValue({rpc,auth} as never)});
  it('normaliza update_session_status idempotente',async()=>{rpc.mockResolvedValue({data:[{id:sessionId,status:'paused',changed:false}],error:null});await expect(updateSessionStatusAction(sessionId,'paused')).resolves.toMatchObject({ok:true,result:{changed:false}})});
  it('normaliza update_queue_status',async()=>{rpc.mockResolvedValue({data:[{id:queueId,status:'preparing',updated_at:'now',changed:true}],error:null});await expect(updateQueueStatusAction(queueId,'preparing')).resolves.toMatchObject({ok:true,result:{status:'preparing',changed:true}})});
  it('rejeita closed em ambos',async()=>{rpc.mockResolvedValue({data:null,error:{message:'SESSION_CLOSED'}});await expect(updateSessionStatusAction(sessionId,'active')).resolves.toMatchObject({ok:false,code:'SESSION_CLOSED'});await expect(updateQueueStatusAction(queueId,'completed')).resolves.toMatchObject({ok:false,code:'SESSION_CLOSED'})});
  it('rejeita cardinalidade zero',async()=>{rpc.mockResolvedValue({data:[],error:null});await expect(updateSessionStatusAction(sessionId,'active')).resolves.toMatchObject({ok:false,code:'RPC_RESULT_CARDINALITY'})});
});
