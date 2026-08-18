import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DisplayPairingScreen } from '@/src/components/display/DisplayPairingScreen';
import { redeemDisplayPairingCodeAction } from '@/src/application/display-pairing/redeem-display-pairing-code.action';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock('@/src/application/display-pairing/redeem-display-pairing-code.action', () => ({
  redeemDisplayPairingCodeAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('DisplayPairingScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aceita 6 caracteres e converte para maiúsculas automaticamente, sem exigir shift', async () => {
    const user = userEvent.setup();
    render(<DisplayPairingScreen roomCode="KARA89" />);
    const input = screen.getByLabelText(/código de pareamento/i) as HTMLInputElement;
    await user.type(input, 'ab23cd');
    expect(input.value).toBe('AB23CD');
  });

  it('trava em 6 caracteres', async () => {
    const user = userEvent.setup();
    render(<DisplayPairingScreen roomCode="KARA89" />);
    const input = screen.getByLabelText(/código de pareamento/i) as HTMLInputElement;
    await user.type(input, 'ABCDEFGH');
    expect(input.value).toBe('ABCDEF');
  });

  it('touch target do botão e do input usam as classes de tamanho mínimo definidas em CSS', () => {
    render(<DisplayPairingScreen roomCode="KARA89" />);
    const button = screen.getByRole('button', { name: /parear telão/i });
    const input = screen.getByLabelText(/código de pareamento/i);
    expect(button.className).toMatch(/pairingButton/);
    expect(input.className).toMatch(/pairingInput/);
  });

  it('botão desabilitado até completar 6 caracteres', async () => {
    const user = userEvent.setup();
    render(<DisplayPairingScreen roomCode="KARA89" />);
    const button = screen.getByRole('button', { name: /parear telão/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.type(screen.getByLabelText(/código de pareamento/i), 'ABCDEF');
    expect(button.disabled).toBe(false);
  });

  it('em sucesso, chama a Server Action com o código da sala e o código digitado, e atualiza a página', async () => {
    vi.mocked(redeemDisplayPairingCodeAction).mockResolvedValue({ ok: true, result: { sessionId: 's1', paired: true } });
    const user = userEvent.setup();
    render(<DisplayPairingScreen roomCode="KARA89" />);
    await user.type(screen.getByLabelText(/código de pareamento/i), 'ABCDEF');
    await user.click(screen.getByRole('button', { name: /parear telão/i }));
    await waitFor(() => expect(redeemDisplayPairingCodeAction).toHaveBeenCalledWith('KARA89', 'ABCDEF'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('mostra sempre a mesma mensagem genérica para PAIRING_CODE_INVALID, nunca diferenciando a causa', async () => {
    vi.mocked(redeemDisplayPairingCodeAction).mockResolvedValue({
      ok: false, code: 'PAIRING_CODE_INVALID', userMessage: 'Código de pareamento inválido ou expirado.',
    });
    const user = userEvent.setup();
    render(<DisplayPairingScreen roomCode="KARA89" />);
    await user.type(screen.getByLabelText(/código de pareamento/i), 'WRONG1');
    await user.click(screen.getByRole('button', { name: /parear telão/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Código de pareamento inválido ou expirado.'));
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('mostra estado de carregamento durante o resgate', async () => {
    let resolvePromise: (value: Awaited<ReturnType<typeof redeemDisplayPairingCodeAction>>) => void = () => undefined;
    vi.mocked(redeemDisplayPairingCodeAction).mockReturnValue(new Promise((resolve) => { resolvePromise = resolve; }));
    const user = userEvent.setup();
    render(<DisplayPairingScreen roomCode="KARA89" />);
    await user.type(screen.getByLabelText(/código de pareamento/i), 'ABCDEF');
    await user.click(screen.getByRole('button', { name: /parear telão/i }));
    const pendingButton = screen.getByRole('button', { name: /pareando/i }) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);
    resolvePromise({ ok: true, result: { sessionId: 's1', paired: true } });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
