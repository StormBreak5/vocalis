import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useSessionLifecycle,
  type SessionLifecycleDependencies,
  type SessionRealtimeAdapter,
  type SessionRealtimeSubscription,
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

type ControlledSubscription = SessionRealtimeSubscription & {
  payload: (payload: unknown) => void;
  status: (status: string) => void;
  unsubscribeMock: ReturnType<typeof vi.fn>;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function flush() {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

function realtimePayload(status: 'active' | 'paused' | 'closed') {
  return {
    eventType: 'UPDATE',
    schema: 'public',
    table: 'sessions',
    commit_timestamp: '2026-08-12T10:00:00.000Z',
    new: {
      id: SESSION_ID,
      code: 'TEST23',
      status,
      closed_at: status === 'closed' ? CLOSED_SNAPSHOT.closedAt : null,
    },
    old: {},
    errors: [],
  };
}

describe('useSessionLifecycle', () => {
  let subscriptions: ControlledSubscription[];
  let tokenHandler: ((accessToken?: string) => void) | null;
  let unsubscribeAuth: ReturnType<typeof vi.fn<() => void>>;
  let getAccessToken: ReturnType<typeof vi.fn<SessionRealtimeAdapter['getAccessToken']>>;
  let setAuth: ReturnType<typeof vi.fn<SessionRealtimeAdapter['setAuth']>>;
  let getStatus: ReturnType<typeof vi.fn<SessionLifecycleDependencies['getSessionStatus']>>;
  let subscribeFailureCount: number;
  let operationOrder: string[];
  let dependencies: SessionLifecycleDependencies;

  beforeEach(() => {
    subscriptions = [];
    tokenHandler = null;
    unsubscribeAuth = vi.fn<() => void>();
    getAccessToken = vi.fn(async () => 'token-inicial');
    setAuth = vi.fn(async () => undefined);
    getStatus = vi.fn(async () => ({ ok: true, snapshot: INITIAL_SNAPSHOT }));
    subscribeFailureCount = 0;
    operationOrder = [];

    dependencies = {
      getSessionStatus: getStatus,
      createRealtimeAdapter: () => ({
        getAccessToken,
        setAuth,
        subscribe(_sessionId, onPayload, onStatus) {
          if (subscribeFailureCount > 0) {
            subscribeFailureCount -= 1;
            throw new Error('SUBSCRIBE_FAILED');
          }
          operationOrder.push('subscribe');
          const unsubscribeMock = vi.fn(async () => undefined);
          const subscription: ControlledSubscription = {
            payload: onPayload,
            status: onStatus,
            unsubscribeMock,
            unsubscribe: unsubscribeMock,
          };
          subscriptions.push(subscription);
          return subscription;
        },
        onTokenRefreshed(onToken) {
          tokenHandler = onToken;
          return unsubscribeAuth;
        },
      }),
    };
  });

  afterEach(() => vi.useRealTimers());

  async function mountSubscribed() {
    const hook = renderHook(() => (
      useSessionLifecycle(SESSION_ID, INITIAL_SNAPSHOT, dependencies)
    ));
    await flush();
    expect(subscriptions).toHaveLength(1);
    await act(async () => {
      subscriptions[0].status('SUBSCRIBED');
      await Promise.resolve();
    });
    await flush();
    return hook;
  }

  it('CLOSED inesperado preserva a fotografia e cria exatamente uma nova assinatura', async () => {
    const { result } = await mountSubscribed();
    getStatus.mockClear();

    await act(async () => {
      subscriptions[0].status('CLOSED');
      await Promise.resolve();
    });
    await flush();

    expect(result.current.state.phase).toBe('reconnecting');
    expect(result.current.state.snapshot).toEqual(INITIAL_SNAPSHOT);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0].unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('leitura bem-sucedida não declara saúde antes do novo SUBSCRIBED', async () => {
    const { result } = await mountSubscribed();
    await act(async () => {
      subscriptions[0].status('CLOSED');
      await Promise.resolve();
    });
    await flush();

    expect(getStatus).toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      phase: 'reconnecting',
      writesAllowed: false,
      snapshot: INITIAL_SNAPSHOT,
    });
  });

  it('novo SUBSCRIBED provoca resync e restaura connected', async () => {
    const { result } = await mountSubscribed();
    getStatus.mockClear();
    subscriptions[0].status('CLOSED');
    await flush();
    const readsBeforeSubscribe = getStatus.mock.calls.length;

    await act(async () => {
      subscriptions[1].status('SUBSCRIBED');
      await Promise.resolve();
    });
    await flush();

    expect(getStatus.mock.calls.length).toBeGreaterThan(readsBeforeSubscribe);
    expect(result.current.state.phase).toBe('connected');
  });

  it('vários sinais simultâneos não criam canais paralelos', async () => {
    await mountSubscribed();
    subscriptions[0].status('CLOSED');
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('pageshow'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0].unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('token renovado durante substituição é aplicado antes da nova assinatura', async () => {
    const removal = deferred<void>();
    await mountSubscribed();
    subscriptions[0].unsubscribeMock.mockReturnValueOnce(removal.promise);
    const order: string[] = [];
    operationOrder = order;
    setAuth.mockImplementation(async (token) => { order.push(`auth:${token}`); });

    subscriptions[0].status('CLOSED');
    await flush();
    act(() => tokenHandler?.('token-mais-recente'));
    await flush();
    removal.resolve();
    await flush();

    expect(setAuth).toHaveBeenCalledWith('token-mais-recente');
    expect(subscriptions).toHaveLength(2);
    const latestAuthIndex = order.lastIndexOf('auth:token-mais-recente');
    expect(latestAuthIndex).toBeGreaterThanOrEqual(0);
    expect(latestAuthIndex).toBeLessThan(order.lastIndexOf('subscribe'));
  });

  it('retorno online recupera canal encerrado', async () => {
    vi.useFakeTimers();
    await mountSubscribed();
    subscribeFailureCount = 1;
    subscriptions[0].status('CLOSED');
    await flush();
    expect(subscriptions).toHaveLength(1);

    window.dispatchEvent(new Event('online'));
    await flush();
    expect(subscriptions).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleanup não recria canal e remove listeners e autenticação', async () => {
    const { unmount } = await mountSubscribed();
    const removeListener = vi.spyOn(window, 'removeEventListener');
    unmount();
    subscriptions[0].status('CLOSED');
    window.dispatchEvent(new Event('online'));
    await flush();

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeAuth).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith('online', expect.any(Function));
  });

  it('timers e callbacks tardios são ignorados depois do unmount', async () => {
    vi.useFakeTimers();
    const { result, unmount } = await mountSubscribed();
    subscriptions[0].status('CHANNEL_ERROR');
    unmount();
    subscriptions[0].payload(realtimePayload('paused'));
    tokenHandler?.('token-tardio');
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(subscriptions).toHaveLength(1);
    expect(result.current.state.snapshot).toEqual(INITIAL_SNAPSHOT);
  });

  it('sessão encerrada por Realtime permanece terminal e não reconecta', async () => {
    const { result } = await mountSubscribed();
    act(() => subscriptions[0].payload(realtimePayload('closed')));
    subscriptions[0].status('CLOSED');
    window.dispatchEvent(new Event('online'));
    await flush();

    expect(result.current.state.phase).toBe('closed');
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('sessão inicialmente encerrada é terminal e nem cria adapter', () => {
    const createRealtimeAdapter = vi.fn(dependencies.createRealtimeAdapter);
    const closedDependencies = { ...dependencies, createRealtimeAdapter };
    const { result } = renderHook(() => (
      useSessionLifecycle(SESSION_ID, CLOSED_SNAPSHOT, closedDependencies)
    ));

    expect(result.current.state.phase).toBe('closed');
    expect(createRealtimeAdapter).not.toHaveBeenCalled();
  });

  it('aplica pause e resume recebidos por Realtime sem refresh', async () => {
    const { result } = await mountSubscribed();
    act(() => subscriptions[0].payload(realtimePayload('paused')));
    expect(result.current.state).toMatchObject({
      snapshot: expect.objectContaining({ status: 'paused' }),
      newQueueEntriesAllowed: false,
    });

    act(() => subscriptions[0].payload(realtimePayload('active')));
    expect(result.current.state).toMatchObject({
      snapshot: expect.objectContaining({ status: 'active' }),
      newQueueEntriesAllowed: true,
    });
  });

  it('recupera paused por resync quando o evento foi perdido', async () => {
    getStatus.mockResolvedValue({
      ok: true,
      snapshot: { ...INITIAL_SNAPSHOT, status: 'paused' },
    });
    const { result } = renderHook(() => (
      useSessionLifecycle(SESSION_ID, INITIAL_SNAPSHOT, dependencies)
    ));
    await flush();
    subscriptions[0].status('SUBSCRIBED');
    await flush();

    expect(result.current.state).toMatchObject({
      phase: 'connected',
      snapshot: expect.objectContaining({ status: 'paused' }),
      newQueueEntriesAllowed: false,
    });
  });
});
