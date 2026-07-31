import { describe,it,expect,vi,beforeEach } from 'vitest';
import { cancelQueueEntryAction } from '../../src/application/queue/cancel-queue-entry.action';
import { createSupabaseServerClient } from '../../src/infrastructure/supabase/server';
vi.mock('../../src/infrastructure/supabase/server',()=>({createSupabaseServerClient:vi.fn()}));
const queueId='22222222-2222-4222-8222-222222222222';
describe('cancelQueueEntryAction',()=>{
 const rpc=vi.fn(); const getUser=vi.fn();
 beforeEach(()=>{vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:'user'}}});rpc.mockResolvedValue({data:null,error:null});vi.mocked(createSupabaseServerClient).mockResolvedValue({auth:{getUser},rpc} as never)});
 it('cancela por RPC e retorna void',async()=>{await expect(cancelQueueEntryAction(queueId)).resolves.toEqual({ok:true});expect(rpc).toHaveBeenCalledWith('cancel_queue_entry',{p_queue_id:queueId})});
 it('exige autenticação',async()=>{getUser.mockResolvedValue({data:{user:null}});await expect(cancelQueueEntryAction(queueId)).resolves.toMatchObject({ok:false,code:'AUTH_REQUIRED'})});
 it('sanitiza not found/forbidden',async()=>{rpc.mockResolvedValue({data:null,error:{message:'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'}});await expect(cancelQueueEntryAction(queueId)).resolves.toMatchObject({ok:false,code:'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'})});
 it('traduz transição inválida',async()=>{rpc.mockResolvedValue({data:null,error:{message:'INVALID_STATUS_TRANSITION'}});await expect(cancelQueueEntryAction(queueId)).resolves.toMatchObject({ok:false,code:'INVALID_STATUS_TRANSITION'})});
});
