import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Home from '@/app/page';
import EntrarPage from '@/app/entrar/page';
import { JoinForm } from '../participant/JoinForm';
import * as joinSessionActionModule from '@/src/application/participant/join-session.action';
import * as createSessionActionModule from '@/src/application/session/create-session.action';
import * as useOnlineStatusModule from '@/src/hooks/useOnlineStatus';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/src/application/participant/join-session.action', () => ({ joinSessionAction: vi.fn() }));
vi.mock('@/src/application/session/create-session.action', () => ({ createSessionAction: vi.fn() }));
vi.mock('@/src/lib/browser-navigation', () => ({ replaceDocument: vi.fn() }));

const codeLabel = 'C\u00f3digo da Sala';
const nameLabel = /Seu Nome/i;

describe('Noite Neon Elegante nas paginas publicas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<typeof useRouter>);
  });

  it('oferece as acoes principais de criacao e entrada na home', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Seu karaok\u00ea, no ritmo certo.' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Criar nova sala de karaok/i }).textContent).toContain('Criar sala');
    expect(screen.getByRole('link', { name: /Entrar como cantor/i }).getAttribute('href')).toBe('/entrar');
  });

  it('anuncia o loading da criacao de sala', async () => {
    let finish!: (value: Awaited<ReturnType<typeof createSessionActionModule.createSessionAction>>) => void;
    vi.mocked(createSessionActionModule.createSessionAction).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: /Criar nova sala de karaok/i }));
    expect(await screen.findByText('Criando sala...')).toBeDefined();
    finish({ ok: false, code: 'UNKNOWN', userMessage: 'Falha controlada.' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falha controlada.'));
  });

  it('mantem navegacao de retorno e apresenta o formulario standalone', () => {
    render(<EntrarPage />);
    expect(screen.getByRole('link', { name: /Voltar para o in/i }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('heading', { name: 'Entrar na sala' })).toBeDefined();
    expect(screen.getByText(/Use o c.digo de seis caracteres/i)).toBeDefined();
    expect(screen.getByText(/Seu apelido ficar. vis.vel/i)).toBeDefined();
  });

  it.each([
    ['SESSION_NOT_FOUND', 'Sala n\u00e3o encontrada.'],
    ['SESSION_PAUSED', 'A fila est\u00e1 pausada. Aguarde o DJ reabrir.'],
    ['SESSION_FULL', 'A sala est\u00e1 cheia.'],
    ['SESSION_CLOSED', 'Esta sala j\u00e1 foi encerrada.'],
  ] as const)('associa o erro contextual %s ao formulario standalone', async (code, userMessage) => {
    vi.mocked(joinSessionActionModule.joinSessionAction).mockResolvedValue({ ok: false, code, userMessage });
    render(<JoinForm variant="standalone" />);
    fireEvent.change(screen.getByLabelText(codeLabel), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText(nameLabel), { target: { value: 'Marina' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar na sala/i }));
    expect((await screen.findByRole('alert')).textContent).toContain(userMessage);
    expect(toast.error).toHaveBeenCalledWith(userMessage);
  });

  it('mantem validacoes de codigo e apelido proximas aos campos', async () => {
    vi.mocked(joinSessionActionModule.joinSessionAction)
      .mockResolvedValueOnce({ ok: false, code: 'INVALID_CODE_FORMAT', userMessage: 'C\u00f3digo inv\u00e1lido.' })
      .mockResolvedValueOnce({ ok: false, code: 'INVALID_NAME', userMessage: 'Nome inv\u00e1lido.' });
    render(<JoinForm variant="standalone" />);
    const code = screen.getByLabelText(codeLabel);
    const name = screen.getByLabelText(nameLabel);
    fireEvent.change(code, { target: { value: 'ABC' } });
    fireEvent.change(name, { target: { value: 'Marina' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar na sala/i }));
    expect(await screen.findByText('C\u00f3digo inv\u00e1lido.')).toBeDefined();
    fireEvent.change(code, { target: { value: 'ABC123' } });
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar na sala/i }));
    expect(await screen.findByText('Nome inv\u00e1lido.')).toBeDefined();
  });

  it('impede envio duplicado enquanto a entrada esta em andamento', async () => {
    let finish!: (value: Awaited<ReturnType<typeof joinSessionActionModule.joinSessionAction>>) => void;
    vi.mocked(joinSessionActionModule.joinSessionAction).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<JoinForm variant="standalone" />);
    fireEvent.change(screen.getByLabelText(codeLabel), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText(nameLabel), { target: { value: 'Marina' } });
    const form = screen.getByRole('button', { name: /Entrar na sala/i }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(joinSessionActionModule.joinSessionAction).toHaveBeenCalledTimes(1);
    finish({ ok: false, code: 'SESSION_NOT_FOUND', userMessage: 'Sala n\u00e3o encontrada.' });
    await screen.findByText('Sala n\u00e3o encontrada.');
  });

  it('preserva a variante embutida usada fora de entrar', () => {
    render(<JoinForm initialCode="ABC123" />);
    expect(screen.queryByText(/Use o c.digo de seis caracteres/i)).toBeNull();
    expect((screen.getByLabelText(codeLabel) as HTMLInputElement).disabled).toBe(true);
  });
});
