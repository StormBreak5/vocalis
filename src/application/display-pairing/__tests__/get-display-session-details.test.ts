import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { getDisplaySessionDetails } from '@/src/application/display-pairing/get-display-session-details';
import { RpcResultContractError } from '@/src/application/shared/expect-single-rpc-row';

vi.mock('@/src/infrastructure/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const sessionId = '11111111-1111-4111-8111-111111111111';

describe('getDisplaySessionDetails', () => {
  const rpc = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
  });

  it('retorna os detalhes quando autorizado (Host ou telão pareado)', async () => {
    rpc.mockResolvedValue({ data: [{ id: sessionId, code: 'ABCDEF', status: 'active', closed_at: null }], error: null });
    await expect(getDisplaySessionDetails(sessionId)).resolves.toEqual({
      id: sessionId, code: 'ABCDEF', status: 'active', closedAt: null,
    });
  });

  it('retorna os detalhes de uma sessão fechada (para renderizar DisplayClosedState)', async () => {
    rpc.mockResolvedValue({ data: [{ id: sessionId, code: 'ABCDEF', status: 'closed', closed_at: '2026-08-17T12:00:00+00:00' }], error: null });
    const result = await getDisplaySessionDetails(sessionId);
    expect(result?.status).toBe('closed');
    expect(result?.closedAt).toBe('2026-08-17T12:00:00+00:00');
  });

  it('retorna null quando a RPC recusa (SESSION_NOT_FOUND_OR_FORBIDDEN)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'SESSION_NOT_FOUND_OR_FORBIDDEN' } });
    await expect(getDisplaySessionDetails(sessionId)).resolves.toBeNull();
  });

  it('lança RpcResultContractError em cardinalidade zero', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(getDisplaySessionDetails(sessionId)).rejects.toBeInstanceOf(RpcResultContractError);
  });

  it('lança RpcResultContractError em múltiplas linhas', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: sessionId, code: 'ABCDEF', status: 'active', closed_at: null },
        { id: sessionId, code: 'ABCDEF', status: 'active', closed_at: null },
      ],
      error: null,
    });
    await expect(getDisplaySessionDetails(sessionId)).rejects.toBeInstanceOf(RpcResultContractError);
  });
});
