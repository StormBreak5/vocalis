/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionLifecycle } from '@/src/hooks/useSessionLifecycle';
import { getSessionStatus } from '@/src/application/session/get-session-status';
import { createClient } from '@/src/infrastructure/supabase/client';

vi.mock('@/src/application/session/get-session-status', () => ({
  getSessionStatus: vi.fn(),
}));

vi.mock('@/src/infrastructure/supabase/client', () => ({
  createClient: vi.fn(),
}));

describe('useSessionLifecycle (Fallback Resync)', () => {
  const MOCK_SESSION_ID = '12345678-1234-1234-1234-123456789012';
  const INITIAL_SNAPSHOT = { id: MOCK_SESSION_ID, code: 'TEST12', status: 'active', closedAt: null };

  let mockChannel: any;
  let mockSubscribe: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockSubscribe = vi.fn();
    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: mockSubscribe,
    };

    (createClient as any).mockReturnValue({
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn(),
    });

    (getSessionStatus as any).mockResolvedValue({
      ok: true,
      snapshot: { ...INITIAL_SNAPSHOT, status: 'closed', closedAt: '2026-07-29T10:00:00Z' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deve chamar getSessionStatus ao receber CHANNEL_ERROR ou TIMED_OUT no subscribe', async () => {
    const { result } = renderHook(() => useSessionLifecycle(MOCK_SESSION_ID, INITIAL_SNAPSHOT as any));
    
    // Simula disparo de erro pelo Supabase
    const subscribeCallback = mockSubscribe.mock.calls[0][0];
    
    await act(async () => {
      subscribeCallback('CHANNEL_ERROR');
    });

    expect(getSessionStatus).toHaveBeenCalledWith(MOCK_SESSION_ID);
    // Deve transitar state para "closed" porque o mock retorna closed
    expect(result.current.state.phase).toBe('closed');
  });

  it('deve chamar getSessionStatus quando a aba volta a ficar visível (visibilitychange)', async () => {
    renderHook(() => useSessionLifecycle(MOCK_SESSION_ID, INITIAL_SNAPSHOT as any));
    
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(getSessionStatus).toHaveBeenCalledWith(MOCK_SESSION_ID);
  });

  it('deve chamar getSessionStatus quando o navegador volta a ficar online', async () => {
    renderHook(() => useSessionLifecycle(MOCK_SESSION_ID, INITIAL_SNAPSHOT as any));
    
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(getSessionStatus).toHaveBeenCalledWith(MOCK_SESSION_ID);
  });
});
