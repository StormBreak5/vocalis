import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DjDisplayPairingPanel } from '@/src/components/dj/DjDisplayPairingPanel';
import { generateDisplayPairingCodeAction } from '@/src/application/display-pairing/generate-display-pairing-code.action';
import { revokeDisplayPairingAction } from '@/src/application/display-pairing/revoke-display-pairing.action';

vi.mock('@/src/application/display-pairing/generate-display-pairing-code.action', () => ({
  generateDisplayPairingCodeAction: vi.fn(),
}));
vi.mock('@/src/application/display-pairing/revoke-display-pairing.action', () => ({
  revokeDisplayPairingAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const sessionId = '11111111-1111-4111-8111-111111111111';
const displayA = { id: 'p1', pairedAt: '2026-08-19T21:34:00+00:00' };
const displayB = { id: 'p2', pairedAt: '2026-08-19T21:40:00+00:00' };

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

  it('numera cada telão por ordem de pareamento e mostra o horário — id sozinho não diz nada ao Host', () => {
    render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[displayA, displayB]} />);
    const timeA = new Date(displayA.pairedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const timeB = new Date(displayB.pairedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    expect(screen.getByText('Telão 1')).toBeTruthy();
    expect(screen.getByText('Telão 2')).toBeTruthy();
    expect(screen.getByText(`Pareado às ${timeA}`)).toBeTruthy();
    expect(screen.getByText(`Pareado às ${timeB}`)).toBeTruthy();
  });

  it('ao clicar em Revogar, chama a Server Action com o id daquele telão específico', async () => {
    vi.mocked(revokeDisplayPairingAction).mockResolvedValue({ ok: true, revocation: { id: displayB.id, revoked: true } });
    const user = userEvent.setup();
    render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[displayA, displayB]} />);
    await user.click(screen.getByRole('button', { name: /revogar telão 2/i }));
    await waitFor(() => expect(revokeDisplayPairingAction).toHaveBeenCalledWith(displayB.id));
  });

  it('mostra erro do servidor quando a revogação falha', async () => {
    vi.mocked(revokeDisplayPairingAction).mockResolvedValue({
      ok: false, code: 'PAIRING_NOT_FOUND_OR_FORBIDDEN', userMessage: 'Pareamento não encontrado ou indisponível.',
    });
    const { toast } = await import('sonner');
    const user = userEvent.setup();
    render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[displayA]} />);
    await user.click(screen.getByRole('button', { name: /revogar telão 1/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('desabilita os botões de Revogar enquanto uma revogação está em andamento', async () => {
    let resolveRevoke!: (value: Awaited<ReturnType<typeof revokeDisplayPairingAction>>) => void;
    vi.mocked(revokeDisplayPairingAction).mockReturnValue(
      new Promise((resolve) => { resolveRevoke = resolve; }),
    );
    const user = userEvent.setup();
    render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[displayA, displayB]} />);
    const revokeButtonA = screen.getByRole('button', { name: /revogar telão 1/i });
    const revokeButtonB = screen.getByRole('button', { name: /revogar telão 2/i });
    await user.click(revokeButtonA);
    expect(revokeButtonA.getAttribute('aria-busy')).toBe('true');
    expect(revokeButtonB.hasAttribute('disabled')).toBe(true);
    resolveRevoke({ ok: true, revocation: { id: displayA.id, revoked: true } });
    await waitFor(() => expect(revokeButtonB.hasAttribute('disabled')).toBe(false));
  });

  it('não remove a linha localmente após sucesso — a lista só muda quando o pai reenvia pairedDisplays (simula o evento Realtime de UPDATE removendo o item revogado)', async () => {
    vi.mocked(revokeDisplayPairingAction).mockResolvedValue({ ok: true, revocation: { id: displayA.id, revoked: true } });
    const user = userEvent.setup();
    const { rerender } = render(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[displayA, displayB]} />);
    await user.click(screen.getByRole('button', { name: /revogar telão 1/i }));
    await waitFor(() => expect(revokeDisplayPairingAction).toHaveBeenCalled());
    // Sem estado otimista: os dois telões continuam na lista até o pai
    // reenviar um pairedDisplays atualizado (o que useDisplayPairings só faz
    // ao processar o evento Realtime real — este teste simula esse reenvio).
    expect(screen.getByText('Telão 1')).toBeTruthy();
    expect(screen.getByText('Telão 2')).toBeTruthy();

    rerender(<DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={[displayB]} />);
    expect(screen.queryByText('Pareado às ' + new Date(displayA.pairedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))).toBeNull();
    expect(screen.getByText('Telão 1')).toBeTruthy(); // displayB agora é o único, renumerado para 1
  });
});
