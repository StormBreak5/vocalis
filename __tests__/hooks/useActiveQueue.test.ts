import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import { useActiveQueue } from '@/src/hooks/useActiveQueue';

vi.mock('@/src/application/queue/list-active-queue.action', () => ({
  listActiveQueueAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

type MockRealtimeChannel = {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  emitPayload(payload: unknown): void;
  emitStatus(status: string): void;
};

let channels: MockRealtimeChannel[] = [];
let authStateHandler:
  | ((event: string, session: { access_token?: string } | null) => void)
  | undefined;

const unsubscribeAuth = vi.fn();
const removeChannel = vi.fn().mockResolvedValue(undefined);
const getSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: 'initial-token' } },
});
const setRealtimeAuth = vi.fn().mockResolvedValue(undefined);
const channel = vi.fn(() => {
  let payloadHandler: ((payload: unknown) => void) | undefined;
  let statusHandler: ((status: string) => void) | undefined;
  const instance: MockRealtimeChannel = {
    on: vi.fn((_: string, __: unknown, handler: (payload: unknown) => void) => {
      payloadHandler = handler;
      return instance;
    }),
    subscribe: vi.fn((handler: (status: string) => void) => {
      statusHandler = handler;
      return instance;
    }),
    emitPayload(payload: unknown) {
      payloadHandler?.(payload);
    },
    emitStatus(status: string) {
      statusHandler?.(status);
    },
  };
  channels.push(instance);
  return instance;
});
const onAuthStateChange = vi.fn((handler) => {
  authStateHandler = handler;
  return { data: { subscription: { unsubscribe: unsubscribeAuth } } };
});

vi.mock('@/src/infrastructure/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel,
    removeChannel,
    auth: { getSession, onAuthStateChange },
    realtime: { setAuth: setRealtimeAuth },
  })),
}));

import { listActiveQueueAction } from '@/src/application/queue/list-active-queue.action';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function entry(overrides: Partial<ActiveQueueEntry> = {}): ActiveQueueEntry {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionId: SESSION_ID,
    participantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    songTitle: 'Evidências',
    artist: 'Chitãozinho & Xororó',
    status: 'pending',
    position: 1,
    createdAt: '2026-08-11T20:00:00.000Z',
    updatedAt: '2026-08-11T20:00:00.000Z',
    participantName: 'Marina',
    ...overrides,
  };
}

function row(item: ActiveQueueEntry) {
  return {
    id: item.id,
    session_id: item.sessionId,
    participant_id: item.participantId,
    song_title: item.songTitle,
    artist: item.artist,
    status: item.status,
    position: item.position,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function currentChannel(): MockRealtimeChannel {
  const current = channels.at(-1);
  if (!current) throw new Error('Canal Realtime de teste ainda não criado.');
  return current;
}

async function renderLoaded(initialQueue: ActiveQueueEntry[] = [entry()]) {
  vi.mocked(listActiveQueueAction).mockResolvedValue({ ok: true, queue: initialQueue });
  const hook = renderHook(() => useActiveQueue(SESSION_ID));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  await waitFor(() => expect(channels).toHaveLength(1));
  return hook;
}

async function subscribeCurrentChannel() {
  await act(async () => currentChannel().emitStatus('SUBSCRIBED'));
  await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
  vi.mocked(listActiveQueueAction).mockClear();
}

describe('useActiveQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channels = [];
    authStateHandler = undefined;
    getSession.mockResolvedValue({
      data: { session: { access_token: 'initial-token' } },
    });
    setRealtimeAuth.mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('carrega inicialmente, autentica o Realtime e mantém ordenação determinística', async () => {
    const later = entry({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      participantId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      position: 2,
      createdAt: '2026-08-11T20:02:00.000Z',
    });
    const hook = await renderLoaded([later, entry()]);

    expect(listActiveQueueAction).toHaveBeenCalledWith(SESSION_ID);
    expect(hook.result.current.queue.map(({ position }) => position)).toEqual([1, 2]);
    expect(getSession).toHaveBeenCalledOnce();
    expect(setRealtimeAuth).toHaveBeenCalledWith('initial-token');
    expect(setRealtimeAuth.mock.invocationCallOrder[0]).toBeLessThan(
      channel.mock.invocationCallOrder[0],
    );
  });

  it('ressincroniza quando o canal atinge SUBSCRIBED', async () => {
    await renderLoaded();
    await act(async () => currentChannel().emitStatus('SUBSCRIBED'));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT'])(
    'ressincroniza após %s e preserva a última fila quando a leitura falha',
    async (status) => {
      const known = entry();
      const hook = await renderLoaded([known]);
      vi.mocked(listActiveQueueAction).mockResolvedValueOnce({
        ok: false,
        code: 'UNKNOWN',
        userMessage: 'Falha temporária.',
      });

      await act(async () => currentChannel().emitStatus(status));

      await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
      expect(hook.result.current.isOffline).toBe(true);
      expect(hook.result.current.queue).toEqual([known]);
      expect(channels).toHaveLength(1);
    },
  );

  it('renova a autenticação do Realtime e ressincroniza após TOKEN_REFRESHED', async () => {
    await renderLoaded();

    await act(async () => {
      authStateHandler?.('TOKEN_REFRESHED', { access_token: 'renewed-token' });
      await Promise.resolve();
    });

    await waitFor(() => expect(setRealtimeAuth).toHaveBeenCalledWith('renewed-token'));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
  });

  it('preserva a fila e ressincroniza quando a renovação do canal falha', async () => {
    const known = entry();
    const hook = await renderLoaded([known]);
    setRealtimeAuth.mockRejectedValueOnce(new Error('falha local simulada'));

    await act(async () => {
      authStateHandler?.('TOKEN_REFRESHED', { access_token: 'renewed-token' });
      await Promise.resolve();
    });

    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
    expect(hook.result.current.queue).toEqual([known]);
    expect(hook.result.current.isOffline).toBe(true);
  });

  it('drena TOKEN_REFRESHED recebido na janela final do authRunner antes de assinar', async () => {
    await renderLoaded();
    await subscribeCurrentChannel();
    const closedChannel = currentChannel();
    const firstAuth = deferred<void>();
    const latestAuth = deferred<void>();
    let markNextFinallyAsAuth = false;
    let injectAtAuthFinalizer = false;
    let injected = false;

    setRealtimeAuth.mockClear();
    setRealtimeAuth
      .mockImplementationOnce(() => {
        markNextFinallyAsAuth = true;
        return firstAuth.promise;
      })
      .mockImplementationOnce(() => {
        markNextFinallyAsAuth = true;
        return latestAuth.promise;
      })
      .mockImplementation(() => Promise.resolve());
    removeChannel.mockClear();

    const originalFinally = Promise.prototype.finally;
    const finallySpy = vi.spyOn(Promise.prototype, 'finally').mockImplementation(function (
      this: Promise<unknown>,
      onFinally?: (() => void | Promise<void>) | null,
    ) {
      const authFinalizer = markNextFinallyAsAuth;
      if (authFinalizer) markNextFinallyAsAuth = false;

      return originalFinally.call(this, () => {
        if (authFinalizer && injectAtAuthFinalizer && !injected) {
          injected = true;
          authStateHandler?.('TOKEN_REFRESHED', { access_token: 'window-token' });
        }
        return onFinally?.();
      });
    });

    try {
      act(() => closedChannel.emitStatus('CLOSED'));
      await waitFor(() => expect(setRealtimeAuth).toHaveBeenCalledTimes(1));
      expect(setRealtimeAuth).toHaveBeenLastCalledWith('initial-token');
      expect(channels).toHaveLength(1);
      expect(removeChannel).not.toHaveBeenCalled();

      injectAtAuthFinalizer = true;
      await act(async () => firstAuth.resolve());

      await waitFor(() => expect(setRealtimeAuth).toHaveBeenCalledTimes(2));
      expect(setRealtimeAuth).toHaveBeenLastCalledWith('window-token');
      expect(channels).toHaveLength(1);
      expect(removeChannel).not.toHaveBeenCalled();

      await act(async () => latestAuth.resolve());
      await waitFor(() => expect(channels).toHaveLength(2));

      expect(injected).toBe(true);
      expect(removeChannel).toHaveBeenCalledTimes(1);
      expect(removeChannel).toHaveBeenCalledWith(closedChannel);
      expect(channels[1].subscribe).toHaveBeenCalledOnce();
    } finally {
      finallySpy.mockRestore();
    }
  });

  it.each(['online', 'pageshow'])(
    'ressincroniza no evento de navegador %s',
    async (eventName) => {
      await renderLoaded();
      await act(async () => window.dispatchEvent(new Event(eventName)));
      await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
    },
  );

  it('ressincroniza quando a aba volta a ficar visível', async () => {
    await renderLoaded();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
  });

  it('preserva o último estado conhecido ao ficar offline', async () => {
    const known = entry();
    const hook = await renderLoaded([known]);

    await act(async () => window.dispatchEvent(new Event('offline')));

    expect(hook.result.current.isOffline).toBe(true);
    expect(hook.result.current.queue).toEqual([known]);
    expect(listActiveQueueAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['UPDATE', { new: row(entry({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' })) }],
    ['DELETE', { old: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } }],
  ])('ressincroniza ao receber %s de item desconhecido', async (eventType, payload) => {
    await renderLoaded();
    await act(async () => currentChannel().emitPayload({ eventType, ...payload }));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
  });

  it('usa leitura autoritativa para INSERT e payload incompatível', async () => {
    await renderLoaded();
    await act(async () => currentChannel().emitPayload({ eventType: 'INSERT', new: row(entry()) }));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));

    await act(async () => currentChannel().emitPayload({ eventType: 'UPDATE', new: { id: 'inválido' } }));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(3));
  });

  it('ressincroniza quando um UPDATE contradiz a identidade local do item', async () => {
    await renderLoaded();
    const incompatible = row(entry());
    incompatible.participant_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    await act(async () => currentChannel().emitPayload({ eventType: 'UPDATE', new: incompatible }));

    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
  });

  it('aplica UPDATE conhecido sem estado otimista e mantém a ordenação', async () => {
    const first = entry();
    const second = entry({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      participantId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      participantName: 'Diego',
      position: 2,
      createdAt: '2026-08-11T20:02:00.000Z',
    });
    const hook = await renderLoaded([first, second]);

    await act(async () => currentChannel().emitPayload({
      eventType: 'UPDATE',
      new: row({ ...second, status: 'preparing', position: 0 }),
    }));

    expect(hook.result.current.queue.map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(hook.result.current.queue[0]).toMatchObject({
      status: 'preparing',
      participantName: 'Diego',
    });
    expect(listActiveQueueAction).toHaveBeenCalledTimes(1);
  });

  it('recria exatamente uma assinatura após CLOSED inesperado e preserva a fila', async () => {
    const known = entry();
    const hook = await renderLoaded([known]);
    await subscribeCurrentChannel();
    const closedChannel = currentChannel();
    const removal = deferred<void>();
    removeChannel.mockReturnValueOnce(removal.promise);

    act(() => closedChannel.emitStatus('CLOSED'));

    await waitFor(() => expect(removeChannel).toHaveBeenCalledWith(closedChannel));
    expect(listActiveQueueAction).toHaveBeenCalledTimes(1);
    expect(hook.result.current.queue).toEqual([known]);
    expect(channels).toHaveLength(1);

    await act(async () => removal.resolve());
    await waitFor(() => expect(channels).toHaveLength(2));
    expect(channels[1].subscribe).toHaveBeenCalledOnce();
  });

  it('ressincroniza novamente quando o canal recriado atinge SUBSCRIBED', async () => {
    await renderLoaded();
    await subscribeCurrentChannel();
    const closedChannel = currentChannel();

    act(() => closedChannel.emitStatus('CLOSED'));
    await waitFor(() => expect(channels).toHaveLength(2));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(1));

    await act(async () => channels[1].emitStatus('SUBSCRIBED'));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
  });

  it('usa token renovado depois de CLOSED antes da nova assinatura', async () => {
    await renderLoaded();
    await subscribeCurrentChannel();
    const closedChannel = currentChannel();
    const removal = deferred<void>();
    removeChannel.mockReturnValueOnce(removal.promise);

    act(() => closedChannel.emitStatus('CLOSED'));
    await waitFor(() => expect(removeChannel).toHaveBeenCalledWith(closedChannel));

    await act(async () => {
      authStateHandler?.('TOKEN_REFRESHED', { access_token: 'post-close-token' });
      await Promise.resolve();
    });
    await waitFor(() => expect(setRealtimeAuth).toHaveBeenCalledWith('post-close-token'));

    await act(async () => removal.resolve());
    await waitFor(() => expect(channels).toHaveLength(2));
    const renewedAuthCall = setRealtimeAuth.mock.invocationCallOrder.findLast(
      (_, index) => setRealtimeAuth.mock.calls[index][0] === 'post-close-token',
    );
    expect(renewedAuthCall).toBeDefined();
    expect(renewedAuthCall!).toBeLessThan(channel.mock.invocationCallOrder[1]);
  });

  it('consolida vários gatilhos de recuperação sem canais paralelos', async () => {
    await renderLoaded();
    await subscribeCurrentChannel();
    const closedChannel = currentChannel();
    const removal = deferred<void>();
    removeChannel.mockReturnValueOnce(removal.promise);

    act(() => {
      closedChannel.emitStatus('CLOSED');
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      authStateHandler?.('TOKEN_REFRESHED', { access_token: 'coalesced-token' });
    });

    await waitFor(() => expect(removeChannel).toHaveBeenCalledTimes(1));
    expect(channels).toHaveLength(1);

    await act(async () => removal.resolve());
    await waitFor(() => expect(channels).toHaveLength(2));
    expect(channels[1].subscribe).toHaveBeenCalledOnce();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it('aplica backoff limitado e evita toasts duplicados na mesma recuperação', async () => {
    await renderLoaded();
    await subscribeCurrentChannel();
    removeChannel
      .mockRejectedValueOnce(new Error('falha 1'))
      .mockRejectedValueOnce(new Error('falha 2'));
    vi.useFakeTimers();

    try {
      await act(async () => {
        currentChannel().emitStatus('CLOSED');
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(vi.getTimerCount()).toBe(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
      expect(vi.getTimerCount()).toBe(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(750); });
      expect(channels).toHaveLength(2);
      expect(removeChannel).toHaveBeenCalledTimes(3);
      expect(toast.error).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('não recria quando CLOSED decorre do cleanup', async () => {
    const hook = await renderLoaded();
    const closingChannel = currentChannel();

    hook.unmount();
    act(() => closingChannel.emitStatus('CLOSED'));
    await Promise.resolve();

    expect(removeChannel).toHaveBeenCalledOnce();
    expect(channels).toHaveLength(1);
  });

  it('cancela backoff, leitura e recriação pendentes no unmount', async () => {
    const hook = await renderLoaded();
    await subscribeCurrentChannel();
    const pendingRead = deferred<Awaited<ReturnType<typeof listActiveQueueAction>>>();
    vi.mocked(listActiveQueueAction).mockReturnValueOnce(pendingRead.promise);
    removeChannel.mockRejectedValueOnce(new Error('falha local simulada'));
    vi.useFakeTimers();

    try {
      act(() => currentChannel().emitStatus('CLOSED'));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(vi.getTimerCount()).toBe(1);
      expect(listActiveQueueAction).toHaveBeenCalledTimes(1);

      hook.unmount();
      expect(vi.getTimerCount()).toBe(0);
      act(() => vi.runAllTimers());
      pendingRead.resolve({ ok: true, queue: [entry({ songTitle: 'Tardia' })] });
      await Promise.resolve();

      expect(channels).toHaveLength(1);
      expect(listActiveQueueAction).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retorno online antecipa a recuperação de um canal encerrado', async () => {
    await renderLoaded();
    const closedChannel = currentChannel();

    act(() => {
      closedChannel.emitStatus('CLOSED');
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(channels).toHaveLength(2));
    expect(removeChannel).toHaveBeenCalledWith(closedChannel);
    expect(channels[1].subscribe).toHaveBeenCalledOnce();
  });

  it('deduplica gatilhos concorrentes e impede leitura antiga de sobrescrever a nova', async () => {
    const oldRead = deferred<Awaited<ReturnType<typeof listActiveQueueAction>>>();
    const freshRead = deferred<Awaited<ReturnType<typeof listActiveQueueAction>>>();
    vi.mocked(listActiveQueueAction)
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(freshRead.promise);

    const hook = renderHook(() => useActiveQueue(SESSION_ID));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(1));

    act(() => {
      currentChannel().emitStatus('SUBSCRIBED');
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(listActiveQueueAction).toHaveBeenCalledTimes(1);

    const obsolete = entry({ songTitle: 'Leitura antiga' });
    await act(async () => oldRead.resolve({ ok: true, queue: [obsolete] }));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
    expect(hook.result.current.queue).toEqual([]);

    const fresh = entry({ songTitle: 'Leitura atual' });
    await act(async () => freshRead.resolve({ ok: true, queue: [fresh] }));
    await waitFor(() => expect(hook.result.current.queue).toEqual([fresh]));
    expect(listActiveQueueAction).toHaveBeenCalledTimes(2);
  });

  it('drena resync solicitado na janela final antes de liberar o runner', async () => {
    const hook = await renderLoaded();
    vi.mocked(listActiveQueueAction).mockClear();
    const originalFinally = Promise.prototype.finally;
    let injectAtFinalizer = true;

    const finallySpy = vi.spyOn(Promise.prototype, 'finally').mockImplementation(function (
      this: Promise<unknown>,
      onFinally?: (() => void) | null,
    ) {
      return originalFinally.call(this, () => {
        if (injectAtFinalizer) {
          injectAtFinalizer = false;
          void hook.result.current.resync();
        }
        return onFinally?.();
      });
    });

    try {
      await act(async () => { await hook.result.current.resync(); });
      await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));
    } finally {
      finallySpy.mockRestore();
    }
  });

  it('não deixa point-read em voo sobrescrever evento Realtime mais novo', async () => {
    const known = entry();
    const hook = await renderLoaded([known]);
    const obsoleteRead = deferred<Awaited<ReturnType<typeof listActiveQueueAction>>>();
    const finalRead = deferred<Awaited<ReturnType<typeof listActiveQueueAction>>>();
    vi.mocked(listActiveQueueAction)
      .mockReturnValueOnce(obsoleteRead.promise)
      .mockReturnValueOnce(finalRead.promise);

    act(() => { void hook.result.current.resync(); });
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(2));

    const realtimeVersion = { ...known, songTitle: 'Evento Realtime', status: 'preparing' as const };
    act(() => currentChannel().emitPayload({ eventType: 'UPDATE', new: row(realtimeVersion) }));
    expect(hook.result.current.queue[0].songTitle).toBe('Evento Realtime');

    await act(async () => obsoleteRead.resolve({
      ok: true,
      queue: [{ ...known, songTitle: 'Resposta obsoleta' }],
    }));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(3));
    expect(hook.result.current.queue[0].songTitle).toBe('Evento Realtime');

    await act(async () => finalRead.resolve({ ok: true, queue: [realtimeVersion] }));
    await waitFor(() => expect(hook.result.current.queue).toEqual([realtimeVersion]));
  });

  it('ignora respostas e callbacks depois do unmount', async () => {
    const pending = deferred<Awaited<ReturnType<typeof listActiveQueueAction>>>();
    vi.mocked(listActiveQueueAction).mockReturnValueOnce(pending.promise);
    const hook = renderHook(() => useActiveQueue(SESSION_ID));
    await waitFor(() => expect(listActiveQueueAction).toHaveBeenCalledTimes(1));

    hook.unmount();
    act(() => {
      currentChannel().emitStatus('SUBSCRIBED');
      authStateHandler?.('TOKEN_REFRESHED', { access_token: 'late-token' });
      window.dispatchEvent(new Event('online'));
    });
    pending.resolve({ ok: true, queue: [entry()] });
    await Promise.resolve();

    expect(listActiveQueueAction).toHaveBeenCalledTimes(1);
    expect(unsubscribeAuth).toHaveBeenCalledOnce();
    expect(removeChannel).toHaveBeenCalledOnce();
  });
});
