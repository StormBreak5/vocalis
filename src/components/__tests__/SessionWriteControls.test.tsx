/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequestSongForm } from '@/src/components/queue/RequestSongForm';
import { QueueItem } from '@/src/components/queue/QueueItem';
import { SessionStatusToggle } from '@/src/components/session/SessionStatusToggle';
import * as LifecycleProvider from '@/src/components/session/SessionLifecycleProvider';

vi.mock('@/src/application/queue/create-queue-entry.action', () => ({
  createQueueEntryAction: vi.fn(),
}));

// Mock do next/navigation usado no SessionStatusToggle
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe('Session Write Controls (US4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockContext = vi.spyOn(LifecycleProvider, 'useSessionLifecycleContext');

  const renderWithWritesAllowed = (ui: React.ReactElement, writesAllowed: boolean) => {
    mockContext.mockReturnValue({
      phase: writesAllowed ? 'connected' : 'closed',
      writesAllowed,
      sessionId: '123'
    } as any);
    return render(ui);
  };

  it('deve desabilitar RequestSongForm quando writesAllowed é falso', () => {
    renderWithWritesAllowed(<RequestSongForm sessionId="123" />, false);
    
    // Inputs must be disabled
    expect((screen.getByPlaceholderText(/Ex: Evidências/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByPlaceholderText(/Ex: Chitãozinho & Xororó/i) as HTMLInputElement).disabled).toBe(true);
    
    // Button must be disabled
    expect((screen.getByRole('button', { name: /Colocar na Fila/i }) as HTMLButtonElement).disabled).toBe(true);
    
    // Deve mostrar aviso de que a sessão está fechada/leitura (se não tiver a tag de offline ou activeSong, apenas desabilita, mas vamos ver a UI)
  });

  it('deve permitir escrever quando writesAllowed é verdadeiro e as outras flags permitirem', () => {
    renderWithWritesAllowed(<RequestSongForm sessionId="123" hasActiveSong={false} isOffline={false} />, true);
    
    expect((screen.getByPlaceholderText(/Ex: Evidências/i) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /Colocar na Fila/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('deve desabilitar os botões de Host no QueueItem quando writesAllowed é falso', () => {
    const mockEntry = { id: '1', songTitle: 'A', artist: 'B', participantName: 'P', status: 'pending' as const, participantId: '2', sessionId: '123', position: 1, createdAt: '2023-01-01', updatedAt: '2023-01-01' };
    renderWithWritesAllowed(<QueueItem entry={mockEntry} isCurrentUser={false} isHost={true} />, false);

    // Os botões de Host ("Chamar", "Pular") não devem ser renderizados ou estar disabled
    expect(screen.queryByRole('button', { name: /Chamar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pular/i })).toBeNull();
  });

  it('deve desabilitar botão de cancelar no QueueItem (isCurrentUser) quando writesAllowed é falso', () => {
    const mockEntry = { id: '1', songTitle: 'A', artist: 'B', participantName: 'P', status: 'pending' as const, participantId: '2', sessionId: '123', position: 1, createdAt: '2023-01-01', updatedAt: '2023-01-01' };
    renderWithWritesAllowed(<QueueItem entry={mockEntry} isCurrentUser={true} isHost={false} />, false);

    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i }) as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(true);
  });

  it('deve desabilitar o SessionStatusToggle quando writesAllowed é falso', () => {
    renderWithWritesAllowed(<SessionStatusToggle sessionId="123" initialStatus="active" />, false);
    
    // O botão principal ("Pausar Fila" ou "Retomar Fila") deve ficar desabilitado
    const toggleBtn = screen.getByRole('button', { name: /Pausar Fila/i }) as HTMLButtonElement;
    expect(toggleBtn.disabled).toBe(true);
  });
});
