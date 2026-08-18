import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';
import PublicDisplayPage from '@/app/sala/[code]/display/page';
import { getSessionStatusRowByCode } from '@/src/infrastructure/supabase/queries/session.queries';
import { getDisplaySessionDetails } from '@/src/application/display-pairing/get-display-session-details';
import { generateRoomEntryQr } from '@/src/infrastructure/qr/room-entry-qr.server';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }),
}));
vi.mock('@/src/infrastructure/supabase/queries/session.queries', () => ({
  getSessionStatusRowByCode: vi.fn(),
}));
vi.mock('@/src/application/display-pairing/get-display-session-details', () => ({
  getDisplaySessionDetails: vi.fn(),
}));
vi.mock('@/src/infrastructure/qr/room-entry-qr.server', () => ({
  generateRoomEntryQr: vi.fn(),
}));
vi.mock('@/src/components/session/SessionLifecycleProvider', () => ({
  SessionLifecycleProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="lifecycle-provider">{children}</div>
  ),
}));
vi.mock('@/src/components/display/DisplayExperience', () => ({
  DisplayExperience: ({ code }: { code: string }) => (
    <div data-testid="display-experience">Telão autorizado {code}</div>
  ),
}));
vi.mock('@/src/components/display/DisplayPairingScreen', () => ({
  DisplayPairingScreen: ({ roomCode }: { roomCode: string }) => (
    <div data-testid="display-pairing-screen">Parear {roomCode}</div>
  ),
}));

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('PublicDisplayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionStatusRowByCode).mockResolvedValue({
      id: SESSION_ID,
      code: 'ABC234',
      status: 'active',
      closed_at: null,
    });
    vi.mocked(getDisplaySessionDetails).mockResolvedValue({
      id: SESSION_ID,
      code: 'ABC234',
      status: 'active',
      closedAt: null,
    });
    vi.mocked(generateRoomEntryQr).mockReturnValue({ status: 'origin-not-configured' });
  });

  it('normaliza o código e só monta a tela depois de confirmar autorização (Host ou telão pareado)', async () => {
    render(await PublicDisplayPage({ params: Promise.resolve({ code: ' abc234 ' }) }));

    expect(getSessionStatusRowByCode).toHaveBeenCalledWith('ABC234');
    expect(getDisplaySessionDetails).toHaveBeenCalledWith(SESSION_ID);
    expect(generateRoomEntryQr).toHaveBeenCalledWith('ABC234');
    expect(screen.getByText('Telão autorizado ABC234')).toBeDefined();
  });

  it('mostra a tela de pareamento — não redireciona — quando a sala é invisível ou inexistente (FR-008)', async () => {
    vi.mocked(getSessionStatusRowByCode).mockResolvedValue(null);

    render(await PublicDisplayPage({ params: Promise.resolve({ code: 'ABC234' }) }));

    expect(redirect).not.toHaveBeenCalled();
    expect(getDisplaySessionDetails).not.toHaveBeenCalled();
    expect(generateRoomEntryQr).not.toHaveBeenCalled();
    expect(screen.getByTestId('display-pairing-screen')).toBeDefined();
    expect(screen.getByText('Parear ABC234')).toBeDefined();
  });

  it('mostra a tela de pareamento — não redireciona — quando a autorização não é confirmada (participante, revogado, etc.)', async () => {
    vi.mocked(getDisplaySessionDetails).mockResolvedValue(null);

    render(await PublicDisplayPage({ params: Promise.resolve({ code: 'ABC234' }) }));

    expect(redirect).not.toHaveBeenCalled();
    expect(generateRoomEntryQr).not.toHaveBeenCalled();
    expect(screen.getByTestId('display-pairing-screen')).toBeDefined();
  });

  it('redireciona código com formato inválido antes de qualquer leitura', async () => {
    await expect(PublicDisplayPage({ params: Promise.resolve({ code: 'invalido' }) }))
      .rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/sala/INVALIDO');
    expect(getSessionStatusRowByCode).not.toHaveBeenCalled();
    expect(getDisplaySessionDetails).not.toHaveBeenCalled();
  });

  it('renderiza sala inicialmente encerrada no servidor sem dados ativos', async () => {
    vi.mocked(getDisplaySessionDetails).mockResolvedValue({
      id: SESSION_ID,
      code: 'ABC234',
      status: 'closed',
      closedAt: '2026-08-12T01:00:00.000Z',
    });

    render(await PublicDisplayPage({ params: Promise.resolve({ code: 'ABC234' }) }));

    expect(screen.getByRole('heading', { name: 'Sala encerrada' })).toBeDefined();
    expect(generateRoomEntryQr).not.toHaveBeenCalled();
    expect(screen.queryByTestId('lifecycle-provider')).toBeNull();
    expect(screen.queryByTestId('display-experience')).toBeNull();
    expect(screen.queryByTestId('display-pairing-screen')).toBeNull();
    expect(screen.queryByText('ABC234')).toBeNull();
    expect(document.querySelector('[data-display-join-panel]')).toBeNull();
    expect(document.querySelector('[data-display-queue-preview]')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(document.body.textContent).not.toContain('/entrar?codigo=');
  });
});
