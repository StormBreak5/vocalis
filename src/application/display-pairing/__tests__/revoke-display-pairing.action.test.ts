import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { revokeDisplayPairingAction } from '@/src/application/display-pairing/revoke-display-pairing.action';

vi.mock('@/src/infrastructure/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const pairingId = '11111111-1111-4111-8111-111111111111';

describe('revokeDisplayPairingAction', () => {
  const rpc = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
  });

  it('normaliza exatamente uma linha em sucesso (revogação ativa)', async () => {
    rpc.mockResolvedValue({ data: [{ id: pairingId, revoked: true }], error: null });
    await expect(revokeDisplayPairingAction(pairingId)).resolves.toMatchObject({
      ok: true,
      revocation: { id: pairingId, revoked: true },
    });
    expect(rpc).toHaveBeenCalledWith('revoke_display_pairing', { p_display_pairing_id: pairingId });
  });

  it('revogação repetida é idempotente: sucesso com revoked=false', async () => {
    rpc.mockResolvedValue({ data: [{ id: pairingId, revoked: false }], error: null });
    await expect(revokeDisplayPairingAction(pairingId)).resolves.toMatchObject({
      ok: true,
      revocation: { id: pairingId, revoked: false },
    });
  });

  it.each<[unknown]>([[[]], [[{ id: pairingId, revoked: true }, { id: pairingId, revoked: true }]]])(
    'rejeita cardinalidade %j',
    async (data) => {
      rpc.mockResolvedValue({ data, error: null });
      await expect(revokeDisplayPairingAction(pairingId)).resolves.toMatchObject({ ok: false, code: 'RPC_RESULT_CARDINALITY' });
    },
  );

  it('mapeia PAIRING_NOT_FOUND_OR_FORBIDDEN quando o pareamento não existe ou não é do Host chamador', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'PAIRING_NOT_FOUND_OR_FORBIDDEN' } });
    await expect(revokeDisplayPairingAction(pairingId)).resolves.toMatchObject({ ok: false, code: 'PAIRING_NOT_FOUND_OR_FORBIDDEN' });
  });

  it('mapeia AUTH_REQUIRED', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'AUTH_REQUIRED' } });
    await expect(revokeDisplayPairingAction(pairingId)).resolves.toMatchObject({ ok: false, code: 'AUTH_REQUIRED' });
  });

  it('rejeita id de pareamento mal formado sem chamar a RPC', async () => {
    await expect(revokeDisplayPairingAction('not-a-uuid')).resolves.toMatchObject({ ok: false, code: 'PAIRING_NOT_FOUND_OR_FORBIDDEN' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
