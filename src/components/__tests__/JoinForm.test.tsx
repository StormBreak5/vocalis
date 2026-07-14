import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JoinForm } from '../participant/JoinForm';
import * as useOnlineStatusModule from '@/src/hooks/useOnlineStatus';
import * as joinSessionActionModule from '@/src/application/participant/join-session.action';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/src/application/participant/join-session.action', () => ({
  joinSessionAction: vi.fn(),
}));

describe('JoinForm', () => {
  let mockPush: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush = vi.fn();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('renders both fields with accessible labels', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    render(<JoinForm />);
    
    expect(screen.getByLabelText(/Código da Sala/i)).toBeDefined();
    expect(screen.getByLabelText(/Seu Nome/i)).toBeDefined();
  });

  it('code field normalizes to uppercase', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    render(<JoinForm />);
    
    const codeInput = screen.getByLabelText(/Código da Sala/i) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: 'aabb11' } });
    
    expect(codeInput.value).toBe('AABB11');
  });

  it('empty name shows inline error before submit', async () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(joinSessionActionModule, 'joinSessionAction').mockResolvedValue({
      ok: false,
      code: 'INVALID_NAME',
      userMessage: 'Nome inválido.',
    });

    render(<JoinForm />);
    
    const codeInput = screen.getByLabelText(/Código da Sala/i);
    fireEvent.change(codeInput, { target: { value: 'AABB22' } });

    const submitBtn = screen.getByRole('button', { name: /Entrar na sala/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const errorMsg = screen.getByText('Nome inválido.');
      expect(errorMsg).toBeDefined();
    });
  });

  it('submit disabled when offline', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: false });
    render(<JoinForm />);
    
    const submitBtn = screen.getByRole('button') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.getAttribute('aria-label')).toBe('Ação indisponível offline');
  });

  it('toast shown for SESSION_NOT_FOUND error', async () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(joinSessionActionModule, 'joinSessionAction').mockResolvedValue({
      ok: false,
      code: 'SESSION_NOT_FOUND',
      userMessage: 'Sala não encontrada.',
    });

    render(<JoinForm />);
    
    const codeInput = screen.getByLabelText(/Código da Sala/i);
    const nameInput = screen.getByLabelText(/Seu Nome/i);
    
    fireEvent.change(codeInput, { target: { value: 'AABB22' } });
    fireEvent.change(nameInput, { target: { value: 'John' } });

    const submitBtn = screen.getByRole('button', { name: /Entrar na sala/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Sala não encontrada.');
    });
  });
});
