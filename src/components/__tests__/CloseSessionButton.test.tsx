/**
 * T053: Testes de CloseSessionButton
 *
 * Cobre:
 * - Renderização com rótulo "Encerrar sala"
 * - min-h-[48px] (touch target)
 * - Cancelamento da confirmação: zero chamadas RPC
 * - Confirmar encerramento: chama closeSessionAction
 * - Loading state: botão desabilitado durante chamada RPC
 * - Deduplicação: não dispara segunda chamada enquanto loading
 * - Erro: exibe role="alert" com mensagem
 * - Incerteza: exibe role="alert" com mensagem
 * - Offline: disabled (button.disabled === true), texto de conexão necessária
 * - Loading e offline sem clique: zero RPC calls
 * - Ausência de imports proibidos no arquivo do componente
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

vi.mock('@/src/application/session/close-session.action', () => ({
  closeSessionAction: vi.fn(),
}));

vi.mock('@/src/application/session/get-session-status', () => ({
  getSessionStatus: vi.fn(),
}));

vi.mock('@/src/components/session/SessionLifecycleProvider', () => ({
  useSessionLifecycleContext: vi.fn(),
}));

vi.mock('@/src/hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn().mockReturnValue(true),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CloseSessionButton } from '@/src/components/session/CloseSessionButton';
import { closeSessionAction } from '@/src/application/session/close-session.action';
import { getSessionStatus } from '@/src/application/session/get-session-status';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function buildLifecycleContext(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    snapshot: { id: SESSION_ID, code: 'ABC234', status: 'active', closedAt: null },
    phase: 'connected',
    epoch: 1,
    writesAllowed: true,
    error: null,
    dispatch: vi.fn(),
    ...overrides,
  };
}

describe('CloseSessionButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSessionLifecycleContext).mockReturnValue(buildLifecycleContext() as never);
    vi.mocked(useOnlineStatus).mockReturnValue({ isOnline: true });
    vi.mocked(getSessionStatus).mockResolvedValue({
      ok: false,
      code: 'SESSION_NOT_FOUND_OR_FORBIDDEN',
      userMessage: 'Sala indisponível.',
    });
  });

  // ------ Renderização básica ------
  it('renderiza botão com rótulo "Encerrar sala"', () => {
    render(<CloseSessionButton />);
    const btn = screen.getByRole('button', { name: /encerrar sala/i });
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain('Encerrar sala');
  });

  it('botão tem min-h-[48px] no className (touch target)', () => {
    render(<CloseSessionButton />);
    const btn = screen.getByRole('button', { name: /encerrar sala/i });
    expect(btn.className).toMatch(/min-h-\[48px\]/);
  });

  // ------ Cancelamento da confirmação — zero chamadas RPC ------
  it('abre diálogo de confirmação ao clicar e cancela sem chamar RPC', async () => {
    render(<CloseSessionButton />);
    fireEvent.click(screen.getByRole('button', { name: /encerrar sala/i }));
    await waitFor(() => { expect(screen.getByRole('alertdialog')).toBeDefined(); });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(closeSessionAction).not.toHaveBeenCalled();
    await waitFor(() => { expect(screen.queryByRole('alertdialog')).toBeNull(); });
  });

  // ------ Confirmar encerramento ------
  it('chama closeSessionAction ao confirmar encerramento', async () => {
    vi.mocked(closeSessionAction).mockResolvedValue({
      ok: true,
      result: { sessionId: SESSION_ID, status: 'closed', closedAt: '2026-07-29T10:00:00Z', changed: true },
    });
    render(<CloseSessionButton />);
    fireEvent.click(screen.getByRole('button', { name: /encerrar sala/i }));
    await waitFor(() => screen.getByRole('alertdialog'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar|encerrar/i }));
    await waitFor(() => expect(closeSessionAction).toHaveBeenCalledWith(SESSION_ID));
  });

  // ------ Loading state ------
  it('desabilita botão durante chamada RPC (loading)', async () => {
    let resolveAction!: (v: Awaited<ReturnType<typeof closeSessionAction>>) => void;
    vi.mocked(closeSessionAction).mockReturnValue(new Promise((resolve) => { resolveAction = resolve; }));
    render(<CloseSessionButton />);
    fireEvent.click(screen.getByRole('button', { name: /encerrar sala/i }));
    await waitFor(() => screen.getByRole('alertdialog'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar|encerrar/i }));
    // Após clicar em confirmar, o botão dentro do diálogo fica disabled
    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: /confirmar encerramento/i, hidden: true }) as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });
    resolveAction({ ok: false, code: 'UNKNOWN', userMessage: 'err' });
  });

  // ------ Deduplicação ------
  it('não dispara segunda chamada se já está em loading', async () => {
    let resolveAction!: (v: Awaited<ReturnType<typeof closeSessionAction>>) => void;
    vi.mocked(closeSessionAction).mockReturnValue(new Promise((resolve) => { resolveAction = resolve; }));
    render(<CloseSessionButton />);
    fireEvent.click(screen.getByRole('button', { name: /encerrar sala/i }));
    await waitFor(() => screen.getByRole('alertdialog'));
    const confirmBtn = screen.getByRole('button', { name: /confirmar|encerrar/i });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(closeSessionAction).toHaveBeenCalledTimes(1));
    resolveAction({ ok: false, code: 'UNKNOWN', userMessage: 'err' });
  });

  // ------ Erro ------
  it('exibe role="alert" com mensagem de erro quando RPC falha', async () => {
    vi.mocked(closeSessionAction).mockResolvedValue({
      ok: false,
      code: 'UNKNOWN',
      userMessage: 'Erro ao encerrar a sala.',
    });
    render(<CloseSessionButton />);
    fireEvent.click(screen.getByRole('button', { name: /encerrar sala/i }));
    await waitFor(() => screen.getByRole('alertdialog'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar|encerrar/i }));
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeDefined();
      expect(alert.textContent).toContain('Erro ao encerrar');
    });
  });

  // ------ Incerteza ------
  it('exibe role="alert" com mensagem de incerteza quando RESPONSE_UNCERTAIN', async () => {
    vi.mocked(closeSessionAction).mockResolvedValue({
      ok: false,
      code: 'RESPONSE_UNCERTAIN',
      userMessage: 'Não foi possível confirmar se a sala foi encerrada.',
    });
    render(<CloseSessionButton />);
    fireEvent.click(screen.getByRole('button', { name: /encerrar sala/i }));
    await waitFor(() => screen.getByRole('alertdialog'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar|encerrar/i }));
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeDefined();
      expect(alert.textContent).toContain('confirmar');
    });
  });

  // ------ Offline ------
  it('está desabilitado quando offline com texto de conexão necessária', () => {
    vi.mocked(useOnlineStatus).mockReturnValue({ isOnline: false });
    render(<CloseSessionButton />);
    const btn = screen.getByRole('button', { name: /encerrar sala/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const offlineText = screen.getByText(/conexão|offline|internet/i);
    expect(offlineText).toBeDefined();
  });

  // ------ Loading e offline sem clique ------
  it('não chama closeSessionAction sem clique mesmo offline', () => {
    vi.mocked(useOnlineStatus).mockReturnValue({ isOnline: false });
    render(<CloseSessionButton />);
    expect(closeSessionAction).not.toHaveBeenCalled();
  });

  // ------ Ausência de imports proibidos ------
  it('CloseSessionButton não importa @base-ui/react nem src/components/ui/button', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/session/CloseSessionButton.tsx', 'utf-8');
    expect(source).not.toMatch(/@base-ui\/react/);
    expect(source).not.toMatch(/from ['"].*components\/ui\/button['"]/);
  });
});
