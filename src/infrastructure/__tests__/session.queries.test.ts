import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionStatusRowById, getHostSessionDetails } from '@/src/infrastructure/supabase/queries/session.queries';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';

vi.mock('@/src/infrastructure/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------------------
// getSessionStatusRowById
// ---------------------------------------------------------------------------
describe('getSessionStatusRowById', () => {
  let mockSupabase: ReturnType<typeof buildMockSelect>;

  function buildMockSelect(data: unknown, error: unknown = null) {
    const chain = { eq: vi.fn(), maybeSingle: vi.fn() };
    chain.eq.mockReturnValue(chain);
    chain.maybeSingle.mockResolvedValue({ data, error });
    return { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chain) }) };
  }

  beforeEach(() => vi.clearAllMocks());

  it('retorna projeção mínima (id, code, status, closed_at) para sessão ativa', async () => {
    const row = { id: SESSION_ID, code: 'ABC234', status: 'active', closed_at: null };
    mockSupabase = buildMockSelect(row);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockSupabase as never);
    await expect(getSessionStatusRowById(SESSION_ID)).resolves.toEqual(row);
  });

  it('retorna projeção mínima com closed_at preenchido para sessão closed', async () => {
    const row = { id: SESSION_ID, code: 'ABC234', status: 'closed', closed_at: '2026-07-29T10:00:00Z' };
    mockSupabase = buildMockSelect(row);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockSupabase as never);
    await expect(getSessionStatusRowById(SESSION_ID)).resolves.toEqual(row);
  });

  it('retorna null quando sesão não encontrada ou RLS bloqueia', async () => {
    mockSupabase = buildMockSelect(null);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockSupabase as never);
    await expect(getSessionStatusRowById(SESSION_ID)).resolves.toBeNull();
  });

  it('lança erro quando Supabase retorna error', async () => {
    mockSupabase = buildMockSelect(null, { message: 'DB error' });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockSupabase as never);
    await expect(getSessionStatusRowById(SESSION_ID)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getHostSessionDetails — query tipada de get_host_session_details (pós-016)
// ---------------------------------------------------------------------------
describe('getHostSessionDetails', () => {
  beforeEach(() => vi.clearAllMocks());

  function buildMockRpc(data: unknown, error: unknown = null) {
    return { rpc: vi.fn().mockResolvedValue({ data, error }) };
  }

  it('retorna HostSessionDetails para host proprietário (cardinalidade 1)', async () => {
    const row = [{
      id: SESSION_ID, code: 'ABC234', status: 'active', closed_at: null,
      created_at: '2026-07-01T00:00:00Z', max_participants: 30, max_queue_entries: 50,
    }];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(buildMockRpc(row) as never);
    const result = await getHostSessionDetails(SESSION_ID);
    expect(result).toMatchObject({
      id: SESSION_ID, code: 'ABC234', status: 'active', closedAt: null,
      maxParticipants: 30, maxQueueEntries: 50,
    });
  });

  it('retorna null quando RLS bloqueia (externo / non-owner)', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockRpc(null, { message: 'SESSION_NOT_FOUND_OR_FORBIDDEN', code: 'P0001' }) as never,
    );
    await expect(getHostSessionDetails(SESSION_ID)).resolves.toBeNull();
  });

  it('retorna null quando RPC retorna array vazio', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(buildMockRpc([]) as never);
    await expect(getHostSessionDetails(SESSION_ID)).resolves.toBeNull();
  });

  it('lança erro para cardinalidade > 1', async () => {
    const row = [
      { id: SESSION_ID, code: 'ABC234', status: 'active', closed_at: null, created_at: 'now', max_participants: 30, max_queue_entries: 50 },
      { id: SESSION_ID, code: 'ABC234', status: 'active', closed_at: null, created_at: 'now', max_participants: 30, max_queue_entries: 50 },
    ];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(buildMockRpc(row) as never);
    await expect(getHostSessionDetails(SESSION_ID)).rejects.toThrow('RPC_RESULT_CARDINALITY');
  });
});
