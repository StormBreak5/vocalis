import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EntrarPage, { initialCodeFromSearchParam } from '@/app/entrar/page';
import * as joinSessionActionModule from '@/src/application/participant/join-session.action';

vi.mock('@/src/application/participant/join-session.action', () => ({
  joinSessionAction: vi.fn(),
}));
vi.mock('@/src/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));
vi.mock('@/src/lib/browser-navigation', () => ({ replaceDocument: vi.fn() }));

describe('pagina /entrar com codigo preenchido', () => {
  it.each([
    [' abc234 ', 'ABC234'],
    ['a2b3c4', 'A2B3C4'],
    ['ABC', ''],
    ['ABC!23', ''],
    [undefined, ''],
    [['ABC234'], ''],
  ] as const)('normaliza com seguranca o parametro %s', (value, expected) => {
    expect(initialCodeFromSearchParam(value)).toBe(expected);
  });

  it('preenche o codigo sem entrar automaticamente e mantem apelido e confirmacao', async () => {
    render(await EntrarPage({
      searchParams: Promise.resolve({ codigo: ' abc234 ' }),
    }));

    const code = screen.getByLabelText(/Código da Sala/i) as HTMLInputElement;
    const name = screen.getByLabelText(/Seu Nome/i) as HTMLInputElement;
    expect(code.value).toBe('ABC234');
    expect(code.disabled).toBe(true);
    expect(name.value).toBe('');
    expect(screen.getByRole('button', { name: /Entrar na sala/i })).toBeDefined();
    expect(joinSessionActionModule.joinSessionAction).not.toHaveBeenCalled();
  });

  it('preserva o formulario vazio sem query string ou com valor invalido', async () => {
    const { unmount } = render(await EntrarPage());
    expect((screen.getByLabelText(/Código da Sala/i) as HTMLInputElement).value).toBe('');
    unmount();

    render(await EntrarPage({
      searchParams: Promise.resolve({ codigo: 'invalido' }),
    }));
    const code = screen.getByLabelText(/Código da Sala/i) as HTMLInputElement;
    expect(code.value).toBe('');
    expect(code.disabled).toBe(false);
  });
});
