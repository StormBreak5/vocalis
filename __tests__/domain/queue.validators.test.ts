import { describe, it, expect } from 'vitest';
import { requestSongSchema } from '../../src/domain/queue.types';

describe('Queue Validators', () => {
  describe('requestSongSchema', () => {
    it('validates a correct payload', () => {
      const result = requestSongSchema.safeParse({ songTitle: 'Evidências', artist: 'Chitãozinho & Xororó' });
      expect(result.success).toBe(true);
    });

    it('rejects empty title', () => {
      const result = requestSongSchema.safeParse({ songTitle: '   ', artist: 'Chitãozinho' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('O título da música é obrigatório');
      }
    });

    it('rejects empty artist', () => {
      const result = requestSongSchema.safeParse({ songTitle: 'Evidências', artist: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('O artista é obrigatório');
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
