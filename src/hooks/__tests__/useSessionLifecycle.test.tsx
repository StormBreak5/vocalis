import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useSessionLifecycle,
  type SessionLifecycleDependencies,
} from '@/src/hooks/useSessionLifecycle';
import type { SessionStatusSnapshot } from '@/src/domain/session.types';

const SESSION_ID = '12345678-1234-4234-8234-123456789012';
const INITIAL_SNAPSHOT: SessionStatusSnapshot = {
  id: SESSION_ID,
  code: 'TEST23',
  status: 'active',
  closedAt: null,
};
const CLOSED_SNAPSHOT: SessionStatusSnapshot = {
  ...INITIAL_SNAPSHOT,
  status: 'closed',
  closedAt: '2026-07-29T10:00:00.000Z',
};

describe('useSessionLifecycle', () => {
  let payloadHandler: ((payload: unknown) => void) | null;
  let statusHandler: ((status: string) => void) | null;
  let unsubscribeMock: () => void;
  let unsubscribeCallCount: number;
  let getStatusMock: ReturnType<
    typeof vi.fn<SessionLifecycleDependencies['getSessionStatus']>
  >;
  let subscribeMock: ReturnType<
    typeof vi.fn<SessionLifecycleDependencies['subscribeToSession']>
  >;
  let dependencies: SessionLifecycleDependencies;

  beforeEach(() => {
    payloadHandler = null;
    statusHandler = null;
    unsubscribeCallCount = 0;
    unsubscribeMock = () => {
      unsubscribeCallCount += 1;
    };
    getStatusMock = vi.fn<SessionLifecycleDependencies['getSessionStatus']>();
    getStatusMock.mockResolvedValue({ ok: true, snapshot: CLOSED_SNAPSHOT });

    subscribeMock = vi.fn<SessionLifecycleDependencies['subscribeToSession']>(
      (_sessionId, onPayload, onStatus) => {
        payloadHandler = onPayload;
        statusHandler = onStatus;
        return unsubscribeMock;
      },
    );

    dependencies = {
      getSessionStatus: getStatusMock,
      subscribeToSession: subscribeMock,
    };
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
    'faz resync fail-closed ao receber %s',
    async (status) => {
      const { result } = renderHook(() =>
        useSessionLifecycle(SESSION_ID, INITIAL_SNAPSHOT, dependencies),
      );

      await act(async () => {
        statusHandler?.(status);
        await Promise.resolve();
      });

      expect(getStatusMock).toHaveBeenCalledWith(SESSION_ID);
      expect(result.current.state.phase).toBe('closed');
    },
  );

  it.each(['SUBSCRIBED', 'TOKEN_REFRESHED'])(
    'ressincroniza ao receber %s',
    async (status) => {
      renderHook(() =>
        useSessionLifecycle(SESSION_ID, INITIAL_SNAPSHOT, dependencies),
      );

      await act(async () => {
        statusHandler?.(status);
        await Promise.resolve();
      });

      expect(getStatusMock).toHaveBeenCalledWith(SESSION_ID);
    },
  );

  it('aceita somente envelope Realtime validado', () => {
    const { result } = renderHook(() =>
      useSessionLifecycle(SESSION_ID, INITIAL_SNAPSHOT, dependencies),
    );

    act(() => {
      payloadHandler?.({
        eventType: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        commit_timestamp: '2026-07-29T10:00:00.000Z',
        new: {
          id: SESSION_ID,
          code: 'TEST23',
          status: 'closed',
          closed_at: '2026-07-29T10:00:00.000Z',
        },
        old: { status: 'active' },
        errors: [],
      });
    });

    expect(result.current.state.phase).toBe('closed');
    expect(getStatusMock).not.toHaveBeenCalled();
  });

  it('rejeita payload inesperado e confirma o estado por point-read', async () => {
    const { result } = renderHook(() =>
      useSessionLifecycle(SESSION_ID, INITIAL_SNAPSHOT, dependencies),
    );

    await act(async () => {
      payloadHandler?.({
        eventType: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        commit_timestamp: '2026-07-29T10:00:00.000Z',
        new: {
          id: SESSION_ID,
          code: 'TEST23',
          status: 'closed',
          closed_at: '2026-07-29T10:00:00.000Z',
          host_id: 'não deve chegar ao cliente',
        },
        old: { status: 'active' },
        errors: [],
      });
      await Promise.resolve();
    });

    expect(getStatusMock).toHaveBeenCalledWith(SESSION_ID);
    expect(result.current.state.phase).toBe('closed');
  });

  it.each(['visibilitychange', 'online', 'pageshow'])(
    'faz resync orientado ao evento %s',
    async (eventName) => {
      renderHook(() =>
        useSessionLifecycle(SESSION_ID, INITIAL_SNAPSHOT, dependencies),
      );

      await act(async () => {
        if (eventName === 'visibilitychange') {
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
          });
          document.dispatchEvent(new Event(eventName));
        } else {
          window.dispatchEvent(new Event(eventName));
        }
        await Promise.resolve();
      });

      expect(getStatusMock).toHaveBeenCalledWith(SESSION_ID);
    },
  );

  it('remove a assinatura apenas uma vez ao desmontar', () => {
    const { unmount } = renderHook(() =>
      useSessionLifecycle(SESSION_ID, INITIAL_SNAPSHOT, dependencies),
    );

    unmount();
    expect(unsubscribeCallCount).toBe(1);
  });
});