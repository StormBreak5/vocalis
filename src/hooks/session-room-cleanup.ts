export type RoomCleanupCallback = () => void | Promise<void>;

const roomCleanupCallbacks = new Map<string, Set<RoomCleanupCallback>>();

function roomStoragePrefix(sessionId: string) {
  return 'vocalis:room:' + sessionId;
}

function removeRoomStorage(storage: Storage, sessionId: string) {
  const prefix = roomStoragePrefix(sessionId);

  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key === prefix || key?.startsWith(prefix + ':')) {
      storage.removeItem(key);
    }
  }
}

export function registerRoomCleanup(
  sessionId: string,
  callback: RoomCleanupCallback,
) {
  const callbacks = roomCleanupCallbacks.get(sessionId) ?? new Set();
  callbacks.add(callback);
  roomCleanupCallbacks.set(sessionId, callbacks);

  return () => {
    const currentCallbacks = roomCleanupCallbacks.get(sessionId);
    currentCallbacks?.delete(callback);
    if (currentCallbacks?.size === 0) {
      roomCleanupCallbacks.delete(sessionId);
    }
  };
}

export async function performRoomCleanup(sessionId: string): Promise<void> {
  const callbacks = Array.from(roomCleanupCallbacks.get(sessionId) ?? []);
  roomCleanupCallbacks.delete(sessionId);

  await Promise.allSettled(
    callbacks.map((callback) => Promise.resolve().then(callback)),
  );

  if (typeof window !== 'undefined') {
    removeRoomStorage(window.localStorage, sessionId);
    removeRoomStorage(window.sessionStorage, sessionId);
  }

  if (typeof caches !== 'undefined') {
    const roomCachePrefix = 'vocalis-room-' + sessionId;
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(roomCachePrefix))
        .map((cacheName) => caches.delete(cacheName)),
    );
  }
}