import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayFullscreenButton } from '../DisplayFullscreenButton';

let fullscreenElement: Element | null;
let requestFullscreen: ReturnType<typeof vi.fn>;
let exitFullscreen: ReturnType<typeof vi.fn>;

function installFullscreenApi() {
  fullscreenElement = null;
  requestFullscreen = vi.fn(async () => undefined);
  exitFullscreen = vi.fn(async () => undefined);
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: exitFullscreen,
  });
}

describe('DisplayFullscreenButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    installFullscreenApi();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
  });

  it('entra e sai de tela cheia somente por clique', async () => {
    render(<DisplayFullscreenButton />);
    const enter = await screen.findByRole('button', { name: 'Entrar em tela cheia' });

    fireEvent.click(enter);
    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(1));

    fullscreenElement = document.documentElement;
    fireEvent(document, new Event('fullscreenchange'));
    const exit = await screen.findByRole('button', { name: 'Sair da tela cheia' });
    fireEvent.click(exit);
    await waitFor(() => expect(exitFullscreen).toHaveBeenCalledTimes(1));
  });

  it('oculta por inatividade em tela cheia e reaparece por ponteiro', async () => {
    render(<DisplayFullscreenButton />);
    const button = await screen.findByRole('button', { name: 'Entrar em tela cheia' });
    fullscreenElement = document.documentElement;
    fireEvent(document, new Event('fullscreenchange'));

    act(() => vi.advanceTimersByTime(2_600));
    expect(button.hasAttribute('data-visible')).toBe(false);
    fireEvent.pointerMove(document);
    expect(button.hasAttribute('data-visible')).toBe(true);
  });

  it('não quebra nem renderiza controle quando a API está ausente', () => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: undefined,
    });

    render(<DisplayFullscreenButton />);
    expect(screen.queryByRole('button', { name: /tela cheia/i })).toBeNull();
  });

  it('remove listeners e cancela timer no unmount', async () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(<DisplayFullscreenButton />);
    await screen.findByRole('button', { name: 'Entrar em tela cheia' });
    fullscreenElement = document.documentElement;
    fireEvent(document, new Event('fullscreenchange'));

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('focusin', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
