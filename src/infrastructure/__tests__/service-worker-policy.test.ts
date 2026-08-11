import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Service Worker Policy', () => {
  it('deve excluir rotas sensíveis e de sala do cache no SW', () => {
    const swPath = path.resolve(process.cwd(), 'public', 'sw.js');
    const swContent = fs.readFileSync(swPath, 'utf8');

    // SW deve conter as palavras-chave que impedem que Server Actions e rotas de sala entrem no event.respondWith de cache
    expect(swContent).toContain("url.pathname.startsWith('/sala/')");
    expect(swContent).toContain("request.headers.has('Next-Action')");
    expect(swContent).toContain("url.pathname.startsWith('/api/')");
    expect(swContent).toContain("url.origin.includes('supabase.co')");
  });

  it('deve ter estratégia Network First com verificação de cache-control', () => {
    const swPath = path.resolve(process.cwd(), 'public', 'sw.js');
    const swContent = fs.readFileSync(swPath, 'utf8');

    // A resposta não deve ser cacheada se tiver Cache-Control "private"
    expect(swContent).toMatch(/networkResponse\.headers\.get\('Cache-Control'\).*includes\('private'\)/);
    expect(swContent).not.toMatch(/SHELL_ASSETS\s*=\s*\[\s*['"]\/['"]/);
  });
});
