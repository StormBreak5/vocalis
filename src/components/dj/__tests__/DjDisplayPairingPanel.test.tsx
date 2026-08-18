import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DjDisplayPairingPanel } from '@/src/components/dj/DjDisplayPairingPanel';
import { generateDisplayPairingCodeAction } from '@/src/application/display-pairing/generate-display-pairing-code.action';

vi.mock('@/src/application/display-pairing/generate-display-pairing-code.action', () => ({
  generateDisplayPairingCodeAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const sessionId = '11111111-1111-4111-8111-111111111111';

describe('DjDisplayPairingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('mostra contagem de telões pareados', () => {
    render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[
      { id: 'p1', pairedAt: '2026-08-17T12:00:00+00:00' },
      { id: 'p2', pairedAt: '2026-08-17T12:01:00+00:00' },
    ]} />);
    expect(screen.getByText('2', { selector: 'span[aria-label]' })).toBeTruthy();
  });

  it('estado vazio quando nenhum telão pareado', () => {
    render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[]} />);
    expect(screen.getByText(/nenhum telão pareado/i)).toBeTruthy();
  });

  it('ao clicar em Parear telão, chama a Server Action e exibe o código gerado', async () => {
    vi.mocked(generateDisplayPairingCodeAction).mockResolvedValue({
      ok: true, pairing: { code: 'ABCDEF', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() },
    });
    const user = userEvent.setup();
    render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[]} />);
    await user.click(screen.getByRole('button', { name: /parear telão/i }));
    await waitFor(() => expect(generateDisplayPairingCodeAction).toHaveBeenCalledWith(sessionId));
    await waitFor(() => expect(screen.getByText('ABCDEF')).toBeTruthy());
  });

  it('mostra a contagem regressiva do código gerado', async () => {
    vi.mocked(generateDisplayPairingCodeAction).mockResolvedValue({
      ok: true, pairing: { code: 'ABCDEF', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() },
    });
    const user = userEvent.setup();
    render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[]} />);
    await user.click(screen.getByRole('button', { name: /parear telão/i }));
    await waitFor(() => expect(screen.getByText(/expira em/i)).toBeTruthy());
  });

  it('mostra erro do servidor quando a geração falha', async () => {
    vi.mocked(generateDisplayPairingCodeAction).mockResolvedValue({
      ok: false, code: 'SESSION_CLOSED', userMessage: 'Esta sala já foi encerrada.',
    });
    const { toast } = await import('sonner');
    const user = userEvent.setup();
    render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[]} />);
    await user.click(screen.getByRole('button', { name: /parear telão/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
