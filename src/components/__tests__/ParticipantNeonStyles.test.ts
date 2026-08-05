import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Participant neon visual safeguards', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/participant/participant-neon.module.css'), 'utf8');

  it('preserva safe areas, toque mínimo e foco visível', () => {
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toMatch(/min-height:\s*48px/);
    expect(css).toContain('outline: 3px solid var(--neon-focus)');
  });

  it('remove movimento em prefers-reduced-motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none !important');
    expect(css).toContain('transition: none !important');
  });
});
