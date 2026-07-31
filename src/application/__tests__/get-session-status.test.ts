import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionStatus } from '@/src/application/session/get-session-status';
import { getSessionStatusRowById } from '@/src/infrastructure/supabase/queries/session.queries';

vi.mock('@/src/infrastructure/supabase/queries/session.queries',()=>({getSessionStatusRowById:vi.fn()}));
const id='11111111-1111-4111-8111-111111111111';

describe('getSessionStatus',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('retorna snapshot mínimo tipado',async()=>{
    vi.mocked(getSessionStatusRowById).mockResolvedValue({id,code:'ABC234',status:'active',closed_at:null});
    await expect(getSessionStatus(id)).resolves.toEqual({ok:true,snapshot:{id,code:'ABC234',status:'active',closedAt:null}});
    expect(getSessionStatusRowById).toHaveBeenCalledOnce();
  });
  it('falha fechado para id ou linha inválida',async()=>{
    await expect(getSessionStatus('invalid')).resolves.toMatchObject({ok:false});
    vi.mocked(getSessionStatusRowById).mockResolvedValue(null);
    await expect(getSessionStatus(id)).resolves.toMatchObject({ok:false,code:'SESSION_NOT_FOUND_OR_FORBIDDEN'});
  });
});
