import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { redeemDisplayPairingCodeAction } from '@/src/application/display-pairing/redeem-display-pairing-code.action';

vi.mock('@/src/infrastructure/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

interface MockSupabase {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
    signInAnonymously: ReturnType<typeof vi.fn>;
  };
  rpc: ReturnType<typeof vi.fn>;
}

const sessionId = '11111111-1111-4111-8111-111111111111';

describe('redeemDisplayPairingCodeAction', () => {
  let mockSupabase: MockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        signInAnonymously: vi.fn().mockResolvedValue({ data: { user: { id: 'tv-anon-1' } }, error: null }),
      },
      rpc: vi.fn(),
    };
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });

  it('faz signInAnonymously quando não há usuário e então chama a RPC', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [{ session_id: sessionId, paired: true }], error: null });
    const result = await redeemDisplayPairingCodeAction('KARA89', 'ABCDEF');
    expect(mockSupabase.auth.signInAnonymously).toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith('redeem_display_pairing_code', { p_room_code: 'KARA89', p_pairing_code: 'ABCDEF' });
    expect(result).toMatchObject({ ok: true, result: { sessionId, paired: true } });
  });

  it('não chama signInAnonymously quando já existe identidade', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'existing-tv' } }, error: null });
    mockSupabase.rpc.mockResolvedValue({ data: [{ session_id: sessionId, paired: true }], error: null });
    await redeemDisplayPairingCodeAction('KARA89', 'ABCDEF');
    expect(mockSupabase.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('retorna AUTH_FAILED quando signInAnonymously falha', async () => {
    mockSupabase.auth.signInAnonymously.mockResolvedValue({ data: {}, error: new Error('boom') });
    const result = await redeemDisplayPairingCodeAction('KARA89', 'ABCDEF');
    expect(result).toMatchObject({ ok: false, code: 'AUTH_FAILED' });
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('mapeia PAIRING_CODE_INVALID para código errado, expirado, consumido ou sala inexistente igualmente', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'PAIRING_CODE_INVALID' } });
    await expect(redeemDisplayPairingCodeAction('ZZZZZZ', 'WRONG1')).resolves.toMatchObject({ ok: false, code: 'PAIRING_CODE_INVALID' });
  });

  it('mapeia SESSION_CLOSED', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'SESSION_CLOSED' } });
    await expect(redeemDisplayPairingCodeAction('KARA89', 'ABCDEF')).resolves.toMatchObject({ ok: false, code: 'SESSION_CLOSED' });
  });

  it.each<[unknown]>([[[]], [[{ session_id: sessionId, paired: true }, { session_id: sessionId, paired: true }]]])(
    'rejeita cardinalidade %j',
    async (data) => {
      mockSupabase.rpc.mockResolvedValue({ data, error: null });
      await expect(redeemDisplayPairingCodeAction('KARA89', 'ABCDEF')).resolves.toMatchObject({ ok: false, code: 'RPC_RESULT_CARDINALITY' });
    },
  );
});
