import { describe, expect, it } from 'vitest';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import {
  getDisplayQueueLimit,
  hasLargeDisplayText,
  limitDisplayQueue,
  selectDisplayQueue,
} from '../display-queue-presentation';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function entry(overrides: Partial<ActiveQueueEntry> = {}): ActiveQueueEntry {
  return {
    id: 'queue-1',
    sessionId: SESSION_ID,
    participantId: 'participant-1',
    participantName: 'Marina',
    songTitle: 'Evidências',
    artist: 'Chitãozinho & Xororó',
    status: 'pending',
    position: 1,
    createdAt: '2026-08-11T20:00:00.000Z',
    updatedAt: '2026-08-11T20:00:00.000Z',
    ...overrides,
  };
}

describe('display queue presentation', () => {
  it('escolhe o primeiro singing como cantor atual', () => {
    const result = selectDisplayQueue([
      entry({ id: 'singing-2', status: 'singing', position: 2 }),
      entry({ id: 'singing-1', status: 'singing', position: 1 }),
    ]);

    expect(result.current?.id).toBe('singing-1');
    expect(result.following.map(({ id }) => id)).toEqual(['singing-2']);
  });

  it('prioriza preparing como próximo e usa pending como fallback', () => {
    const preparing = selectDisplayQueue([
      entry({ id: 'pending', status: 'pending', position: 1 }),
      entry({ id: 'preparing', status: 'preparing', position: 4 }),
    ]);
    const pending = selectDisplayQueue([
      entry({ id: 'pending-2', status: 'pending', position: 2 }),
      entry({ id: 'pending-1', status: 'pending', position: 1 }),
    ]);

    expect(preparing.next?.id).toBe('preparing');
    expect(pending.next?.id).toBe('pending-1');
  });

  it('não duplica atual ou próximo e preserva estados anormais restantes', () => {
    const result = selectDisplayQueue([
      entry({ id: 'singing-2', status: 'singing', position: 3 }),
      entry({ id: 'preparing-2', status: 'preparing', position: 4 }),
      entry({ id: 'singing-1', status: 'singing', position: 1 }),
      entry({ id: 'preparing-1', status: 'preparing', position: 2 }),
    ]);

    expect(result.current?.id).toBe('singing-1');
    expect(result.next?.id).toBe('preparing-1');
    expect(result.following.map(({ id }) => id)).toEqual(['singing-2', 'preparing-2']);
  });

  it('ordena deterministicamente por posição, criação e id', () => {
    const result = selectDisplayQueue([
      entry({ id: 'c', position: 1, createdAt: '2026-08-11T20:01:00.000Z' }),
      entry({ id: 'b', position: 1, createdAt: '2026-08-11T20:00:00.000Z' }),
      entry({ id: 'a', position: 1, createdAt: '2026-08-11T20:00:00.000Z' }),
    ]);

    expect([result.next, ...result.following].map((item) => item?.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignora itens inativos e representa fila vazia', () => {
    const result = selectDisplayQueue([
      entry({ id: 'completed', status: 'completed' }),
      entry({ id: 'cancelled', status: 'cancelled' }),
    ]);

    expect(result).toEqual({ current: null, next: null, following: [] });
  });

  it('limita 720p, 1080p e ultrawide e reduz por banner ou texto grande', () => {
    expect(getDisplayQueueLimit({ viewportWidth: 1_280 })).toBe(3);
    expect(getDisplayQueueLimit({ viewportWidth: 1_920 })).toBe(4);
    expect(getDisplayQueueLimit({ viewportWidth: 3_440 })).toBe(5);
    expect(getDisplayQueueLimit({ viewportWidth: 1_280, hasBanner: true })).toBe(1);
    expect(getDisplayQueueLimit({ viewportWidth: 1_920, hasBanner: true })).toBe(3);
    expect(getDisplayQueueLimit({ viewportWidth: 3_440, hasBanner: true })).toBe(3);
    expect(getDisplayQueueLimit({ viewportWidth: 1_280, hasBanner: true, hasLargeText: true })).toBe(1);
    expect(getDisplayQueueLimit({ viewportWidth: 3_440, hasLargeText: true })).toBe(2);
  });

  it('calcula a quantidade restante sem alterar a ordem', () => {
    const entries = Array.from({ length: 5 }, (_, index) => entry({ id: `item-${index}` }));
    const result = limitDisplayQueue(entries, 3);

    expect(result.visible.map(({ id }) => id)).toEqual(['item-0', 'item-1', 'item-2']);
    expect(result.remaining).toBe(2);
  });

  it('detecta textos longos por pontos de código Unicode', () => {
    const presentation = selectDisplayQueue([
      entry({ participantName: `🎤${'Cantora'.repeat(9)}` }),
    ]);

    expect(hasLargeDisplayText(presentation)).toBe(true);
  });
});
