import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDisplayPairings } from '@/src/hooks/useDisplayPairings';
import { createClient } from '@/src/infrastructure/supabase/client';

vi.mock('@/src/infrastructure/supabase/client', () => ({ createClient: vi.fn() }));

const sessionId = '11111111-1111-4111-8111-111111111111';

function buildMockSupabase() {
  let capturedCallback: ((payload: unknown) => void) | undefined;
  const channel = {
    on: vi.fn(function (this: unknown, _event: string, _filter: unknown, callback: (payload: unknown) => void) {
      capturedCallback = callback;
      return channel;
    }),
    subscribe: vi.fn(function (this: unknown) {
      return channel;
    }),
  };
  const supabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token-123' } } }),
    },
    realtime: {
      setAuth: vi.fn().mockResolvedValue(undefined),
    },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
  return { supabase, emit: (payload: unknown) => capturedCallback?.(payload) };
}

describe('useDisplayPairings', () => {
  it('inicia com o snapshot recebido', () => {
    const { supabase } = buildMockSupabase();
    vi.mocked(createClient).mockReturnValue(supabase as never);
    const initial = [{ id: '22222222-2222-4222-8222-222222222222', pairedAt: '2026-08-17T12:00:00+00:00' }];
    const { result } = renderHook(() => useDisplayPairings(sessionId, initial));
    expect(result.current).toEqual(initial);
  });

  it('adiciona um telão pareado ao receber INSERT', async () => {
    const { supabase, emit } = buildMockSupabase();
    vi.mocked(createClient).mockReturnValue(supabase as never);
    const { result } = renderHook(() => useDisplayPairings(sessionId, []));
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled());

    act(() => {
      emit({
        eventType: 'INSERT',
        new: { id: '33333333-3333-4333-8333-333333333333', session_id: sessionId, paired_at: '2026-08-17T12:05:00+00:00', revoked_at: null },
        old: {},
      });
    });

    expect(result.current).toEqual([{ id: '33333333-3333-4333-8333-333333333333', pairedAt: '2026-08-17T12:05:00+00:00' }]);
  });

  it('remove um telão da lista quando UPDATE traz revoked_at preenchido', async () => {
    const { supabase, emit } = buildMockSupabase();
    vi.mocked(createClient).mockReturnValue(supabase as never);
    const initial = [{ id: '33333333-3333-4333-8333-333333333333', pairedAt: '2026-08-17T12:05:00+00:00' }];
    const { result } = renderHook(() => useDisplayPairings(sessionId, initial));
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled());

    act(() => {
      emit({
        eventType: 'UPDATE',
        new: { id: '33333333-3333-4333-8333-333333333333', session_id: sessionId, paired_at: '2026-08-17T12:05:00+00:00', revoked_at: '2026-08-17T12:10:00+00:00' },
        old: {},
      });
    });

    expect(result.current).toEqual([]);
  });

  it('reintroduz um telão quando UPDATE traz revoked_at voltando a NULL (re-pareamento)', async () => {
    const { supabase, emit } = buildMockSupabase();
    vi.mocked(createClient).mockReturnValue(supabase as never);
    const { result } = renderHook(() => useDisplayPairings(sessionId, []));
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled());

    act(() => {
      emit({
        eventType: 'UPDATE',
        new: { id: '33333333-3333-4333-8333-333333333333', session_id: sessionId, paired_at: '2026-08-17T12:15:00+00:00', revoked_at: null },
        old: {},
      });
    });

    expect(result.current).toEqual([{ id: '33333333-3333-4333-8333-333333333333', pairedAt: '2026-08-17T12:15:00+00:00' }]);
  });

  it('assina o canal filtrado por session_id na tabela display_pairings', async () => {
    const { supabase } = buildMockSupabase();
    vi.mocked(createClient).mockReturnValue(supabase as never);
    renderHook(() => useDisplayPairings(sessionId, []));
    await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith(expect.stringContaining(`display_pairings:${sessionId}`)));
    const channel = supabase.channel.mock.results[0].value;
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: '*', schema: 'public', table: 'display_pairings', filter: `session_id=eq.${sessionId}` }),
      expect.any(Function),
    );
  });

  it('remove o canal ao desmontar', async () => {
    const { supabase } = buildMockSupabase();
    vi.mocked(createClient).mockReturnValue(supabase as never);
    const { unmount } = renderHook(() => useDisplayPairings(sessionId, []));
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(supabase.removeChannel).toHaveBeenCalled());
  });
});
