import { test, expect } from '@playwright/test';
import {
  closedDialogHeading,
  confirmSessionClosure,
  createSession,
  joinSession,
} from './helpers/session';

test.describe('Closed session recovery', () => {
  test('recupera closed após refresh e abertura direta da rota', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const participantContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const participantPage = await participantContext.newPage();
      const code = await createSession(hostPage);

      await joinSession(participantPage, code, 'Participante Recuperação');
      await confirmSessionClosure(hostPage);
      await expect(closedDialogHeading(hostPage)).toBeVisible();

      await participantPage.reload();
      await expect(closedDialogHeading(participantPage)).toBeVisible();

      const directPage = await participantContext.newPage();
      await directPage.goto('/sala/' + code);
      await expect(closedDialogHeading(directPage)).toBeVisible();
    } finally {
      await hostContext.close();
      await participantContext.close();
    }
  });

  test('recusa uma nova entrada pelo código depois de closed', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const outsiderContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const outsiderPage = await outsiderContext.newPage();
      const code = await createSession(hostPage);

      await confirmSessionClosure(hostPage);
      await expect(closedDialogHeading(hostPage)).toBeVisible();

      await outsiderPage.goto('/sala/' + code);
      await outsiderPage.getByLabel(/Seu Nome/i).pressSequentially('Entrada tardia');
      await outsiderPage.getByRole('button', { name: /Entrar na sala/i }).click();

      await expect(
        outsiderPage.getByText('Esta sala já foi encerrada.'),
      ).toBeVisible();
      await expect(outsiderPage).toHaveURL('/sala/' + code);
    } finally {
      await hostContext.close();
      await outsiderContext.close();
    }
  });
});