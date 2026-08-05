import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Participant neon visual safeguards', () => {
  const participantCss = readFileSync(resolve(process.cwd(), 'src/components/participant/participant-neon.module.css'), 'utf8');
  const foundationCss = readFileSync(resolve(process.cwd(), 'src/components/vocalis/vocalis-neon-foundation.module.css'), 'utf8');

  it('preserva safe areas, toque mínimo e foco visível na fundação compartilhada', () => {
    expect(foundationCss).toContain('env(safe-area-inset-bottom)');
    expect(participantCss).toMatch(/min-height:\s*48px/);
    expect(foundationCss).toContain('outline: 3px solid var(--neon-focus)');
  });

  it('remove movimento em prefers-reduced-motion', () => {
    expect(foundationCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(foundationCss).toContain('animation: none !important');
    expect(foundationCss).toContain('transition: none !important');
  });

  it('mantém a paleta em uma única fundação reutilizável', () => {
    expect(foundationCss).toContain('--neon-bg:');
    expect(participantCss).not.toContain('--neon-bg:');
  });
});
