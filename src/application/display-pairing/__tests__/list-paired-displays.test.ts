import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { listPairedDisplays } from '@/src/application/display-pairing/list-paired-displays';

vi.mock('@/src/infrastructure/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const sessionId = '11111111-1111-4111-8111-111111111111';

describe('listPairedDisplays', () => {
  const rpc = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
  });

  it('retorna lista vazia', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(listPairedDisplays(sessionId)).resolves.toEqual([]);
  });

  const pairing1 = '22222222-2222-4222-8222-222222222222';
  const pairing2 = '33333333-3333-4333-8333-333333333333';

  it('mapeia as linhas para o domínio', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: pairing1, paired_at: '2026-08-17T12:00:00+00:00' },
        { id: pairing2, paired_at: '2026-08-17T12:05:00+00:00' },
      ],
      error: null,
    });
    await expect(listPairedDisplays(sessionId)).resolves.toEqual([
      { id: pairing1, pairedAt: '2026-08-17T12:00:00+00:00' },
      { id: pairing2, pairedAt: '2026-08-17T12:05:00+00:00' },
    ]);
  });

  it('retorna [] em erro de RPC (não-Host)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'SESSION_NOT_FOUND_OR_FORBIDDEN' } });
    await expect(listPairedDisplays(sessionId)).resolves.toEqual([]);
  });

  it('retorna [] fail-closed quando alguma linha não bate com o schema (nunca vaza auth_user_id)', async () => {
    rpc.mockResolvedValue({
      data: [{ id: pairing1, paired_at: '2026-08-17T12:00:00+00:00', auth_user_id: 'leak' }],
      error: null,
    });
    await expect(listPairedDisplays(sessionId)).resolves.toEqual([]);
  });
});
