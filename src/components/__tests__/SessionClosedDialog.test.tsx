import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SessionClosedDialog } from '@/src/components/session/SessionClosedDialog';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { performRoomCleanup } from '@/src/hooks/session-room-cleanup';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/src/components/session/SessionLifecycleProvider', () => ({
  useSessionLifecycleContext: vi.fn(),
}));

vi.mock('@/src/hooks/session-room-cleanup', () => ({
  performRoomCleanup: vi.fn(),
}));

const contextMock = vi.mocked(useSessionLifecycleContext);
const cleanupMock = vi.mocked(performRoomCleanup);
const sessionId = '12345678-1234-4234-8234-123456789012';

function setContext(phase: 'connected' | 'closed') {
  contextMock.mockReturnValue({
    snapshot: {
      id: sessionId,
      code: 'TEST23',
      status: phase === 'closed' ? 'closed' : 'active',
      closedAt: phase === 'closed' ? '2026-07-29T10:00:00.000Z' : null,
    },
    phase,
    epoch: 1,
    writesAllowed: phase !== 'closed',
    newQueueEntriesAllowed: phase !== 'closed',
    error: null,
    sessionId,
    dispatch: vi.fn(),
  });
}

describe('SessionClosedDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupMock.mockResolvedValue(undefined);
  });

  it('não renderiza quando a sessão continua aberta', () => {
    setContext('connected');
    render(<SessionClosedDialog />);

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('exibe os textos obrigatórios e a única ação final', () => {
    setContext('closed');
    render(<SessionClosedDialog />);

    expect(screen.getByRole('heading', { name: 'Sala encerrada' })).toBeDefined();
    expect(screen.getByText('O DJ encerrou esta sessão de karaokê.')).toBeDefined();

    const button = screen.getByRole('button', { name: 'Voltar para o início' });
    expect(button.className).toMatch(/min-h-\[48px\]/);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('aguarda o cleanup antes de substituir a rota', async () => {
    let finishCleanup: (() => void) | undefined;
    cleanupMock.mockImplementation(
      () => new Promise<void>((resolve) => {
        finishCleanup = resolve;
      }),
    );
    setContext('closed');
    const user = userEvent.setup();
    render(<SessionClosedDialog />);

    await user.click(screen.getByRole('button', { name: 'Voltar para o início' }));

    expect(cleanupMock).toHaveBeenCalledWith(sessionId);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Saindo...' }).hasAttribute('disabled')).toBe(true);

    finishCleanup?.();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });

  it('não fecha via Escape', async () => {
    setContext('closed');
    const user = userEvent.setup();
    render(<SessionClosedDialog />);

    await user.keyboard('{Escape}');

    expect(screen.getByRole('alertdialog')).toBeDefined();
  });

  it('usa Radix diretamente sem depender dos botões legados', () => {
    const filePath = path.resolve(__dirname, '../session/SessionClosedDialog.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toMatch(/@base-ui\/react/);
    expect(content).not.toMatch(/src\/components\/ui\/button\.tsx/);
    expect(content).toMatch(/@radix-ui\/react-alert-dialog/);
  });
});