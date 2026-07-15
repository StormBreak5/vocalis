import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveQueue } from '../../src/hooks/useActiveQueue';

// Mock the server action
vi.mock('@/src/application/queue/list-active-queue.action', () => ({
  listActiveQueueAction: vi.fn(),
}));

// Mock Supabase browser client
const mockSubscribe = vi.fn().mockImplementation((cb) => {
  if (cb) cb('SUBSCRIBED');
  return { unsubscribe: vi.fn() };
});
const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe });
const mockRemoveChannel = vi.fn();
const mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: 'participant-token' } },
});
const mockSetRealtimeAuth = vi.fn().mockResolvedValue(undefined);
const mockChannel = vi.fn().mockReturnValue({ on: mockOn });

vi.mock('@/src/infrastructure/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    auth: { getSession: mockGetSession },
    realtime: { setAuth: mockSetRealtimeAuth },
  })),
}));

import { listActiveQueueAction } from '@/src/application/queue/list-active-queue.action';

describe('useActiveQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listActiveQueueAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      queue: [
        { id: '1', position: 1, songTitle: 'Song 1', status: 'pending' },
        { id: '2', position: 2, songTitle: 'Song 2', status: 'pending' },
      ],
    });
  });

  it('fetches initial queue on mount', async () => {
    const { result } = renderHook(() => useActiveQueue('session-123'));

    expect(result.current.isLoading).toBe(true);
    
    // Wait for the async effect to resolve
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(listActiveQueueAction).toHaveBeenCalledWith('session-123');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.queue.length).toBe(2);
    expect(result.current.queue[0].songTitle).toBe('Song 1');
  });

  it('authenticates Realtime with the participant session before subscribing', async () => {
    renderHook(() => useActiveQueue('session-123'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetSession).toHaveBeenCalled();
    expect(mockSetRealtimeAuth).toHaveBeenCalledWith('participant-token');
    expect(mockSetRealtimeAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mockChannel.mock.invocationCallOrder[0],
    );
  });

  it('subscribes to realtime updates', async () => {
    renderHook(() => useActiveQueue('session-123'));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockChannel).toHaveBeenCalledWith('queue:session-123');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: '*', schema: 'public', table: 'queue' }),
      expect.any(Function)
    );
  });
});
