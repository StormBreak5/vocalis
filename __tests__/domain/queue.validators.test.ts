import { describe, it, expect } from 'vitest';
import { requestSongSchema } from '../../src/domain/queue.types';

describe('Queue Validators', () => {
  describe('requestSongSchema', () => {
    it('validates a correct payload', () => {
      const result = requestSongSchema.safeParse({ songTitle: 'Evidências', artist: 'Chitãozinho & Xororó' });
      expect(result.success).toBe(true);
    });

    it('normalizes a blank title to undefined instead of rejecting it', () => {
      const result = requestSongSchema.safeParse({ songTitle: '   ', artist: 'Chitãozinho' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.songTitle).toBeUndefined();
        expect(result.data.artist).toBe('Chitãozinho');
      }
    });

    it('normalizes a blank artist to undefined instead of rejecting it', () => {
      const result = requestSongSchema.safeParse({ songTitle: 'Evidências', artist: '' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.songTitle).toBe('Evidências');
        expect(result.data.artist).toBeUndefined();
      }
    });

    it('accepts entering the queue with neither title nor artist informed', () => {
      const result = requestSongSchema.safeParse({ songTitle: '', artist: '' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.songTitle).toBeUndefined();
        expect(result.data.artist).toBeUndefined();
      }
    });

    it('rejects a title longer than 100 characters', () => {
      const result = requestSongSchema.safeParse({ songTitle: 'a'.repeat(101), artist: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('O título da música deve ter no máximo 100 caracteres');
      }
    });

    it('trims inputs', () => {
      const result = requestSongSchema.safeParse({ songTitle: '  Evidências  ', artist: '  Chitãozinho  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.songTitle).toBe('Evidências');
        expect(result.data.artist).toBe('Chitãozinho');
      }
    });
  });
});
