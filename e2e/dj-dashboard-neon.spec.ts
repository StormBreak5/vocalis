import { expect, test } from '@playwright/test';
import {
  closedDialogHeading,
  confirmSessionClosure,
  createSession,
  joinSession,
  requestSong,
} from './helpers/session';

test.describe('Painel do DJ Noite Neon Elegante', () => {
  test('chama, inicia, finaliza, pausa e opera a fila existente', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const firstPage = await firstContext.newPage();
      const secondPage = await secondContext.newPage();
      const code = await createSession(hostPage);

      await expect(hostPage.getByRole('heading', { name: 'Painel do DJ' })).toBeVisible();
      await joinSession(firstPage, code, 'Cantor Um');
      await requestSong(firstPage, 'Primeira Música', 'Artista Um');
      await hostPage.reload();
      await expect(hostPage.getByRole('tab', { name: /Fila · 1/i })).toBeVisible();
      await joinSession(secondPage, code, 'Cantor Dois');
      await requestSong(secondPage, 'Segunda Música', 'Artista Dois');
      await expect(hostPage.getByRole('tab', { name: /Fila · 2/i })).toBeVisible();

      await hostPage.getByRole('button', { name: 'Chamar Cantor Um' }).filter({ visible: true }).click();
      await hostPage.getByRole('button', { name: 'Iniciar Cantor Um' }).filter({ visible: true }).click();
      await hostPage.getByRole('button', { name: 'Finalizar Cantor Um' }).filter({ visible: true }).click();
      await expect(hostPage.getByText('Primeira Música', { exact: true })).toHaveCount(0);

      await hostPage.getByRole('button', { name: 'Pausar fila' }).filter({ visible: true }).click();
      await expect(hostPage.getByRole('button', { name: 'Retomar fila' }).filter({ visible: true })).toBeVisible();
      await expect(hostPage.getByText(/músicas existentes continuam operáveis/i)).toBeVisible();
      await hostPage.getByRole('button', { name: 'Chamar Cantor Dois' }).filter({ visible: true }).click();
      await hostPage.getByRole('button', { name: 'Iniciar Cantor Dois' }).filter({ visible: true }).click();
      await expect(hostPage.getByRole('button', { name: 'Finalizar Cantor Dois' }).filter({ visible: true })).toBeEnabled();

      await hostPage.getByRole('button', { name: 'Retomar fila' }).filter({ visible: true }).click();
      await expect(hostPage.getByRole('button', { name: 'Pausar fila' }).filter({ visible: true })).toBeVisible();
      await hostPage.getByRole('button', { name: /Pular Cantor Dois/i }).filter({ visible: true }).click();
      await expect(hostPage.getByText('Segunda Música', { exact: true })).toHaveCount(0);
    } finally {
      await hostContext.close();
      await firstContext.close();
      await secondContext.close();
    }
  });

  test('bloqueia offline, expõe participantes e encerra com confirmação', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const participantContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const participantPage = await participantContext.newPage();
      const code = await createSession(hostPage);
      await joinSession(participantPage, code, 'Cantora Offline');
      await requestSong(participantPage, 'Música Preservada', 'Artista Local');
      await hostPage.reload();
      await expect(hostPage.getByRole('tab', { name: /Fila · 1/i })).toBeVisible();

      await hostContext.setOffline(true);
      await expect(hostPage.getByText(/estado exibido pode estar desatualizado/i)).toBeVisible();
      await expect(hostPage.getByRole('button', { name: /Chamar Cantora Offline/ }).filter({ visible: true })).toHaveCount(0);
      await expect(hostPage.getByTestId('dj-operational-dock')).toContainText('ações indisponíveis');
      await hostContext.setOffline(false);
      await expect(hostPage.getByText('Ao vivo', { exact: true })).toBeVisible();

      await hostPage.getByRole('tab', { name: /Participantes · 1/i }).click();
      await expect(hostPage.getByTestId('dj-participants-panel').filter({ visible: true })).toBeVisible();
      await expect(hostPage.getByText('Cantora Offline', { exact: true }).filter({ visible: true })).toBeVisible();

      await confirmSessionClosure(hostPage);
      await expect(closedDialogHeading(hostPage)).toBeVisible();
    } finally {
      await hostContext.close();
      await participantContext.close();
    }
  });
});
