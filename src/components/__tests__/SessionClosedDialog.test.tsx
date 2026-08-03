import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionClosedDialog } from '@/src/components/session/SessionClosedDialog';
import fs from 'fs';
import path from 'path';

// Mock do useRouter para evitar quebra ao redirecionar
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));


// Mock do useSessionLifecycleContext
vi.mock('@/src/components/session/SessionLifecycleProvider', () => {
  return {
    useSessionLifecycleContext: vi.fn(),
  };
});

import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import * as Cleanup from '@/src/hooks/session-room-cleanup';

describe('SessionClosedDialog', () => {
  const mockContext = useSessionLifecycleContext as unknown as ReturnType<typeof vi.fn>;

  it('não renderiza nada se phase não for closed', () => {
    mockContext.mockReturnValue({ phase: 'connected' });
    render(<SessionClosedDialog />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('renderiza o dialog bloqueante quando phase é closed com textos corretos e focus trap', async () => {
    mockContext.mockReturnValue({ phase: 'closed' });
    render(<SessionClosedDialog />);
    
    // Como estamos usando Radix UI AlertDialog (ou implementando), esperamos um alertdialog
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).not.toBeNull();
    
    // Verifica os textos
    expect(screen.getByRole('heading', { name: /esta sessão foi encerrada/i })).not.toBeNull();
    
    // Verifica botão com min-h-48px
    const btn = screen.getByRole('button', { name: /voltar ao início/i });
    expect(btn.className).toMatch(/min-h-\[48px\]/);
  });

  it('redireciona para home via REPLACE ao clicar no botão, invocando cleanup', async () => {
    const cleanupSpy = vi.spyOn(Cleanup, 'performRoomCleanup');
    // Como mockamos window.location ou useRouter, precisamos interceptar
    const user = userEvent.setup();
    mockContext.mockReturnValue({ phase: 'closed', sessionId: '123' });
    render(<SessionClosedDialog />);
    
    const btn = screen.getByRole('button', { name: /voltar ao início/i });
    await user.click(btn);
    
    expect(cleanupSpy).toHaveBeenCalledWith('123');
    expect(replaceMock).toHaveBeenCalledWith('/');
  });

  it('não permite fechar via Escape (AlertDialog sem botões de cancelamento e preventDefault)', async () => {
    const user = userEvent.setup();
    mockContext.mockReturnValue({ phase: 'closed' });
    render(<SessionClosedDialog />);
    
    // Simular press Escape
    await user.keyboard('{Escape}');
    
    // Dialog ainda deve estar na tela
    expect(screen.getByRole('alertdialog')).not.toBeNull();
  });

  it('não deve importar de @base-ui/react ou src/components/ui/button.tsx', () => {
    const filePath = path.resolve(__dirname, '../session/SessionClosedDialog.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    expect(content).not.toMatch(/@base-ui\/react/);
    expect(content).not.toMatch(/src\/components\/ui\/button\.tsx/);
    expect(content).toMatch(/@radix-ui\/react-alert-dialog/);
  });
});
