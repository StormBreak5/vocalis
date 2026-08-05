import { test, expect } from '@playwright/test';
import { createSession, joinSession, requestSong } from './helpers/session';

test('Host pausa e retoma a fila com atualização em tempo real', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const participantContext = await browser.newContext();
  const newParticipantContext = await browser.newContext();

  try {
    const hostPage = await hostContext.newPage();
    const participantPage = await participantContext.newPage();
    const newParticipantPage = await newParticipantContext.newPage();
    const code = await createSession(hostPage);

    await joinSession(participantPage, code, 'Cantor Atual');
    await requestSong(participantPage, 'Música Existente', 'Artista Existente');
    await expect(participantPage.getByRole('button', { name: /Pausar fila|Retomar fila/i })).toHaveCount(0);

    await hostPage.getByRole('button', { name: 'Pausar fila' }).click();
    await expect(hostPage.getByRole('button', { name: 'Retomar fila' })).toBeVisible();
    await expect(participantPage.getByText(/DJ pausou novos pedidos/i)).toBeVisible();
    await expect(participantPage.getByRole('button', { name: /Pedidos pausados pelo DJ/i })).toBeDisabled();

    await newParticipantPage.goto('/sala/' + code);
    await newParticipantPage.getByLabel(/Seu Nome/i).pressSequentially('Cantor Novo');
    await newParticipantPage.getByRole('button', { name: /Entrar na sala/i }).click();
    await expect(newParticipantPage.getByText(/fila está pausada/i)).toBeVisible();
    await expect(newParticipantPage.getByRole('button', { name: /Entrar na sala/i })).toBeVisible();

    await hostPage.getByRole('button', { name: 'Chamar' }).click();
    await expect(hostPage.getByRole('button', { name: 'Play' })).toBeVisible();

    await hostPage.getByRole('button', { name: 'Retomar fila' }).click();
    await expect(hostPage.getByRole('button', { name: 'Pausar fila' })).toBeVisible();
    await expect(participantPage.getByText(/DJ pausou novos pedidos/i)).toHaveCount(0);
    await expect(participantPage.getByText('Ao vivo', { exact: true })).toBeVisible();

    await newParticipantPage.getByRole('button', { name: /Entrar na sala/i }).click();
    await expect(newParticipantPage.getByText('Cantor Novo', { exact: true })).toBeVisible();
    await requestSong(newParticipantPage, 'Novo Pedido', 'Novo Artista');
  } finally {
    await hostContext.close();
    await participantContext.close();
    await newParticipantContext.close();
  }
});
