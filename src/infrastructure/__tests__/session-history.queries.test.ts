import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listHostSessions } from '@/src/infrastructure/supabase/queries/session-history.queries';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';

vi.mock('@/src/infrastructure/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

function buildMockRpc(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

describe('listHostSessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mapeia snake_case para camelCase no caminho feliz', async () => {
    const rows = [
      {
        id: '11111111-1111-4111-8111-111111111111', code: 'ABC234', status: 'closed',
        created_at: '2026-08-01T10:00:00Z', closed_at: '2026-08-01T12:00:00Z',
        song_count: 2, participant_count: 3,
      },
      {
        id: '22222222-2222-4222-8222-222222222222', code: 'XYZ789', status: 'active',
        created_at: '2026-08-10T10:00:00Z', closed_at: null,
        song_count: 0, participant_count: 1,
      },
    ];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(buildMockRpc(rows) as never);
    await expect(listHostSessions()).resolves.toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111', code: 'ABC234', status: 'closed',
        createdAt: '2026-08-01T10:00:00Z', closedAt: '2026-08-01T12:00:00Z',
        songCount: 2, participantCount: 3,
      },
      {
        id: '22222222-2222-4222-8222-222222222222', code: 'XYZ789', status: 'active',
        createdAt: '2026-08-10T10:00:00Z', closedAt: null,
        songCount: 0, participantCount: 1,
      },
    ]);
  });

  it('retorna [] quando não há sessões', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(buildMockRpc([]) as never);
    await expect(listHostSessions()).resolves.toEqual([]);
  });

  it('retorna [] em erro de RPC (ex.: AUTH_REQUIRED) — falha fechada', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockRpc(null, { message: 'AUTH_REQUIRED', code: 'P0001' }) as never,
    );
    await expect(listHostSessions()).resolves.toEqual([]);
  });

  it('retorna [] quando o payload não bate com o schema', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockRpc([{ id: 'not-a-uuid', code: 'ABC234' }]) as never,
    );
    await expect(listHostSessions()).resolves.toEqual([]);
  });
});
