import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { getSessionStatus } from '@/src/application/session/get-session-status';
import { closeSessionAction } from '@/src/application/session/close-session.action';
vi.mock('@/src/infrastructure/supabase/server',()=>({createSupabaseServerClient:vi.fn()}));
vi.mock('@/src/application/session/get-session-status',()=>({getSessionStatus:vi.fn()}));
const sessionId='11111111-1111-4111-8111-111111111111'; const closedAt='2026-07-31T12:00:00.000Z';

describe('closeSessionAction',()=>{
  const rpc=vi.fn(); const auth={getUser:vi.fn().mockResolvedValue({data:{user:{id:'host'}}})};
  beforeEach(()=>{vi.clearAllMocks();vi.mocked(createSupabaseServerClient).mockResolvedValue({rpc,auth} as never)});
  it('normaliza exatamente uma linha',async()=>{rpc.mockResolvedValue({data:[{session_id:sessionId,status:'closed',closed_at:closedAt,changed:true}],error:null});await expect(closeSessionAction(sessionId)).resolves.toMatchObject({ok:true,result:{changed:true,closedAt}})});
  it.each<[unknown]>([[[]],[[{session_id:sessionId},{session_id:sessionId}]]])('rejeita cardinalidade %j',async(data)=>{rpc.mockResolvedValue({data,error:null});await expect(closeSessionAction(sessionId)).resolves.toMatchObject({ok:false,code:'RPC_RESULT_CARDINALITY'})});
  it('não inventa sucesso quando resposta é incerta e resync falha',async()=>{rpc.mockRejectedValue(new Error('network'));vi.mocked(getSessionStatus).mockResolvedValue({ok:false,code:'UNKNOWN',userMessage:'x'});await expect(closeSessionAction(sessionId)).resolves.toMatchObject({ok:false,code:'RESPONSE_UNCERTAIN'});expect(getSessionStatus).toHaveBeenCalledWith(sessionId)});
  it('recupera sucesso somente após resync confirmar closed',async()=>{rpc.mockRejectedValue(new Error('network'));vi.mocked(getSessionStatus).mockResolvedValue({ok:true,snapshot:{id:sessionId,code:'ABC234',status:'closed',closedAt}});await expect(closeSessionAction(sessionId)).resolves.toMatchObject({ok:true,result:{changed:false,closedAt}})});
  it('não faz RPC sem autenticação',async()=>{auth.getUser.mockResolvedValueOnce({data:{user:null}});await expect(closeSessionAction(sessionId)).resolves.toMatchObject({ok:false,code:'AUTH_REQUIRED'});expect(rpc).not.toHaveBeenCalled()});
});
