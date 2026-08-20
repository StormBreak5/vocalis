import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { listActiveQueueAction } from '@/src/application/queue/list-active-queue.action';

vi.mock('@/src/infrastructure/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const sessionId = '11111111-1111-4111-8111-111111111111';
const row = {
  id: '22222222-2222-4222-8222-222222222222',
  session_id: sessionId,
  participant_id: '33333333-3333-4333-8333-333333333333',
  song_title: 'Evidências',
  artist: 'Chitãozinho & Xororó',
  status: 'pending',
  position: 1,
  created_at: '2026-08-18T12:00:00+00:00',
  updated_at: '2026-08-18T12:00:00+00:00',
  participant_name: 'Marina Costa',
};

describe('listActiveQueueAction', () => {
  const rpc = vi.fn();
  const getUser = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'host-1' } } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { getUser }, rpc } as never);
  });

  it('retorna UNAUTHORIZED sem chamar a RPC quando não autenticado', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(listActiveQueueAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('mapeia as linhas da RPC para ActiveQueueEntry, incluindo o nome do participante', async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect(listActiveQueueAction(sessionId)).resolves.toMatchObject({
      ok: true,
      queue: [{
        id: row.id,
        sessionId: row.session_id,
        participantId: row.participant_id,
        songTitle: row.song_title,
        artist: row.artist,
        status: row.status,
        position: row.position,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        participantName: row.participant_name,
      }],
    });
    expect(rpc).toHaveBeenCalledWith('list_active_queue', { p_session_id: sessionId });
  });

  it('fila vazia é sucesso com array vazio', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(listActiveQueueAction(sessionId)).resolves.toMatchObject({ ok: true, queue: [] });
  });

  it('mapeia SESSION_NOT_FOUND_OR_FORBIDDEN quando a RPC recusa', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'SESSION_NOT_FOUND_OR_FORBIDDEN' } });
    await expect(listActiveQueueAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'SESSION_NOT_FOUND_OR_FORBIDDEN' });
  });

  it('mapeia AUTH_REQUIRED quando a RPC recusa', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'AUTH_REQUIRED' } });
    await expect(listActiveQueueAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'AUTH_REQUIRED' });
  });

  it('trata nome de participante ausente como contrato quebrado, não como dado substituível', async () => {
    rpc.mockResolvedValue({ data: [{ ...row, participant_name: '' }], error: null });
    await expect(listActiveQueueAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'RPC_RESULT_INVALID' });
  });

  it('rejeita linha com status fora de pending/preparing/singing', async () => {
    rpc.mockResolvedValue({ data: [{ ...row, status: 'completed' }], error: null });
    await expect(listActiveQueueAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'RPC_RESULT_INVALID' });
  });

  it('mapeia erro inesperado para UNKNOWN', async () => {
    rpc.mockRejectedValue(new Error('boom'));
    await expect(listActiveQueueAction(sessionId)).resolves.toMatchObject({ ok: false, code: 'UNKNOWN' });
  });
});
