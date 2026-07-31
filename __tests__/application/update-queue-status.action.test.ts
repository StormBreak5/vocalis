import { describe,it,expect,vi,beforeEach } from 'vitest';
import { updateQueueStatusAction } from '../../src/application/queue/update-queue-status.action';
import { createSupabaseServerClient } from '../../src/infrastructure/supabase/server';
vi.mock('../../src/infrastructure/supabase/server',()=>({createSupabaseServerClient:vi.fn()}));
const queueId='22222222-2222-4222-8222-222222222222';
describe('updateQueueStatusAction',()=>{
 const rpc=vi.fn(); const getUser=vi.fn();
 beforeEach(()=>{vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:'host'}}});rpc.mockResolvedValue({data:[{id:queueId,status:'singing',updated_at:'now',changed:true}],error:null});vi.mocked(createSupabaseServerClient).mockResolvedValue({auth:{getUser},rpc} as never)});
 it('atualiza por RPC tipada',async()=>{await expect(updateQueueStatusAction(queueId,'singing')).resolves.toMatchObject({ok:true,result:{status:'singing'}});expect(rpc).toHaveBeenCalledWith('update_queue_status',{p_queue_id:queueId,p_new_status:'singing'})});
 it('exige autenticação',async()=>{getUser.mockResolvedValue({data:{user:null}});await expect(updateQueueStatusAction(queueId,'singing')).resolves.toMatchObject({ok:false,code:'AUTH_REQUIRED'})});
 it('traduz falha do banco',async()=>{rpc.mockResolvedValue({data:null,error:{message:'Database error'}});await expect(updateQueueStatusAction(queueId,'singing')).resolves.toMatchObject({ok:false,code:'UNKNOWN'})});
});
