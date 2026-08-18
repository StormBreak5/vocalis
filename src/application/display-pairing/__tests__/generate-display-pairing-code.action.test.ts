import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { generateDisplayPairingCodeAction } from '@/src/application/display-pairing/generate-display-pairing-code.action';

vi.mock('@/src/infrastructure/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const sessionId = '11111111-1111-4111-8111-111111111111';

describe('generateDisplayPairingCodeAction', () => {
  const rpc = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
  });

  it('normaliza exatamente uma linha em sucesso', async () => {
    rpc.mockResolvedValue({ data: [{ code: 'ABCDEF', expires_at: '2026-08-17T12:05:00+00:00' }], error: null });
    await expect(generateDisplayPairingCodeAction(sessionId)).resolves.toMatchObject({
      ok: true,
      pairing: { code: 'ABCDEF', expiresAt: '2026-08-17T12:05:00+00:00' },
    });
    expect(rpc).toHaveBeenCalledWith('generate_display_pairing_code', { p_session_id: sessionId });
  });

  it.each<[unknown]>([[[]], [[{ code: 'ABCDEF', expires_at: 'x' }, { code: 'ZZZZZZ', expires_at: 'y' }]]])(
    'rejeita cardinalidade %j',
    async (data) => {
      rpc.mockResolvedValue({ data, error: null });
      await expect(generateDisplayPairingCodeAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'RPC_RESULT_CARDINALITY' });
    },
  );

  it('mapeia SESSION_NOT_FOUND_OR_FORBIDDEN quando não é Host', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'SESSION_NOT_FOUND_OR_FORBIDDEN' } });
    await expect(generateDisplayPairingCodeAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'SESSION_NOT_FOUND_OR_FORBIDDEN' });
  });

  it('mapeia SESSION_CLOSED', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'SESSION_CLOSED' } });
    await expect(generateDisplayPairingCodeAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'SESSION_CLOSED' });
  });

  it('mapeia CODE_GENERATION_FAILED', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'CODE_GENERATION_FAILED' } });
    await expect(generateDisplayPairingCodeAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'CODE_GENERATION_FAILED' });
  });

  it('rejeita id de sessão mal formado sem chamar a RPC', async () => {
    await expect(generateDisplayPairingCodeAction('not-a-uuid')).resolves.toMatchObject({ ok: false, code: 'SESSION_NOT_FOUND_OR_FORBIDDEN' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
