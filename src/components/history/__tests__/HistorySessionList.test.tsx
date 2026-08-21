import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistorySessionList } from '@/src/components/history/HistorySessionList';
import type { HostSessionHistoryEntry } from '@/src/domain/session-history.types';

function entry(overrides: Partial<HostSessionHistoryEntry>): HostSessionHistoryEntry {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'ABC234',
    status: 'closed',
    createdAt: '2026-08-01T10:00:00Z',
    closedAt: '2026-08-01T12:00:00Z',
    songCount: 2,
    participantCount: 3,
    ...overrides,
  };
}

describe('HistorySessionList', () => {
  it('mostra estado vazio quando o host nunca criou sessão', () => {
    render(<HistorySessionList sessions={[]} />);
    expect(screen.getByText(/você ainda não criou nenhuma sessão/i)).toBeTruthy();
  });

  it('renderiza código, datas, status e contagens de cada sessão', () => {
    render(<HistorySessionList sessions={[entry({})]} />);
    expect(screen.getByText('ABC234')).toBeTruthy();
    expect(screen.getByText('Sala encerrada')).toBeTruthy();
    expect(screen.getByText(/criada em 01\/08\/2026/i)).toBeTruthy();
    expect(screen.getByText(/encerrada em 01\/08\/2026/i)).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('músicas')).toBeTruthy();
    expect(screen.getByText('pessoas')).toBeTruthy();
  });

  it.each([
    ['active', 'Sessão ativa'],
    ['paused', 'Fila pausada'],
    ['closed', 'Sala encerrada'],
  ] as const)('mostra o rótulo de status %s', (status, label) => {
    render(<HistorySessionList sessions={[entry({ status, closedAt: null })]} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('não mostra data de encerramento para sessão ainda aberta', () => {
    render(<HistorySessionList sessions={[entry({ status: 'active', closedAt: null })]} />);
    expect(screen.queryByText(/encerrada em/i)).toBeNull();
  });

  it('mostra a contagem total de sessões no cabeçalho', () => {
    render(<HistorySessionList sessions={[entry({ id: 'a' }), entry({ id: 'b', code: 'XYZ789' })]} />);
    expect(screen.getByText('2 sessões')).toBeTruthy();
  });
});
