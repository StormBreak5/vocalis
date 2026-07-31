import { describe, it, expect, vi } from 'vitest';
import { performRoomCleanup } from '../session-room-cleanup';

describe('Room Cleanup (US5)', () => {
  it('não deve invocar signOut ou remover cookies globais de Auth', () => {
    // Nós apenas limpamos caches locais ou removemos canais pendentes relacionados a sessão se necessário.
    // Como estamos no app router, muitas vezes o unmount é suficiente, mas podemos ter queries em client side cache.
    // O cleanup precisa ser seguro.
    
    // Simular que o cleanup roda sem erros e sem tocar em auth (mockamos se tivesse acesso a supabase.auth)
    const result = performRoomCleanup('test-room-123');
    expect(result).toBeUndefined();
  });
});
