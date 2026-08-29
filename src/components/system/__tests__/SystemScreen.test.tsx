import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemScreen } from '@/src/components/system/SystemScreen';
import { NotFoundScreen } from '@/src/components/system/NotFoundScreen';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

describe('SystemScreen', () => {
  it('renderiza título, descrição e ações', () => {
    render(
      <SystemScreen
        title="Algo deu errado"
        description="Detalhe do problema"
        actions={<button type="button">Tentar de novo</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Algo deu errado' })).toBeTruthy();
    expect(screen.getByText('Detalhe do problema')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});

describe('NotFoundScreen', () => {
  it('mostra a mensagem e o link para o início', () => {
    render(<NotFoundScreen />);
    expect(screen.getByRole('heading', { name: /não encontrada/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /início/i }).getAttribute('href')).toBe('/');
  });
});

describe('ErrorScreen', () => {
  it('chama reset ao clicar em "Tentar de novo" e reporta ao Sentry', async () => {
    const Sentry = await import('@sentry/nextjs');
    const { ErrorScreen } = await import('@/src/components/system/ErrorScreen');
    const reset = vi.fn();
    render(<ErrorScreen error={new Error('boom')} reset={reset} scope="test" />);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { boundary: 'test' } }),
    );
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(reset).toHaveBeenCalled();
  });
});
