import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/components/dj/dj-dashboard.module.css', 'utf8');

describe('fundação estrutural do Painel do DJ', () => {
  it('mantém grade 65/35, dock seguro e alvos de 48px', () => {
    expect(css).toContain('grid-template-columns: minmax(0, 1.86fr)');
    expect(css).toContain('--dj-dock-height: 96px');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('min-height: 48px');
  });

  it('trata títulos longos, zoom de texto e movimento reduzido', () => {
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('-webkit-line-clamp: 2');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('grid-template-columns: 44px 32px minmax(0, 1fr)');
  });
});
