import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  performRoomCleanup,
  registerRoomCleanup,
} from '../session-room-cleanup';

describe('Room Cleanup (US5)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('encerra callbacks da sala e remove somente seu estado local', async () => {
    const cleanup = vi.fn();
    registerRoomCleanup('room-a', cleanup);

    window.localStorage.setItem('vocalis:room:room-a:queue', '[]');
    window.localStorage.setItem('vocalis:room:room-b:queue', '[1]');
    window.localStorage.setItem('sb-auth-token', 'preservar');
    window.sessionStorage.setItem('vocalis:room:room-a:participant', 'p1');

    await performRoomCleanup('room-a');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('vocalis:room:room-a:queue')).toBeNull();
    expect(window.sessionStorage.getItem('vocalis:room:room-a:participant')).toBeNull();
    expect(window.localStorage.getItem('vocalis:room:room-b:queue')).toBe('[1]');
    expect(window.localStorage.getItem('sb-auth-token')).toBe('preservar');
  });

  it('permite cancelar um callback sem executar cleanup', async () => {
    const cleanup = vi.fn();
    const unregister = registerRoomCleanup('room-a', cleanup);

    unregister();
    await performRoomCleanup('room-a');

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('continua limpando storage quando um callback falha', async () => {
    registerRoomCleanup('room-a', () => {
      throw new Error('falha simulada');
    });
    window.localStorage.setItem('vocalis:room:room-a:snapshot', '{}');

    await expect(performRoomCleanup('room-a')).resolves.toBeUndefined();
    expect(window.localStorage.getItem('vocalis:room:room-a:snapshot')).toBeNull();
  });
});