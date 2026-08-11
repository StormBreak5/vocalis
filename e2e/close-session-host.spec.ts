import { test, expect } from '@playwright/test';
import {
  closedDialogHeading,
  confirmSessionClosure,
  createSession,
  joinSession,
  openHostSessionControls,
  visibleSessionCloseButton,
} from './helpers/session';

test.describe('Host Close Session', () => {
  test('permite cancelar e depois encerrar a sala', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);
      await openHostSessionControls(hostPage);
      const closeButton = visibleSessionCloseButton(hostPage);

      await closeButton.click();
      const confirmationDialog = hostPage.getByRole('alertdialog', {
        name: /Encerrar sala/i,
      });
      await expect(confirmationDialog).toBeVisible();
      await hostPage.getByRole('button', { name: /Cancelar/i }).click();
      await expect(confirmationDialog).not.toBeVisible();
      await expect(closeButton).toBeFocused();

      const guestPage = await guestContext.newPage();
      await guestPage.goto('/sala/' + code + '/dj');
      await guestPage.waitForURL('/sala/' + code);
      await joinSession(guestPage, code, 'Convidado 1');

      await confirmSessionClosure(hostPage);
      await expect(closedDialogHeading(hostPage)).toBeVisible();
      await expect(closedDialogHeading(guestPage)).toBeVisible();

      await hostPage.reload();
      await expect(closedDialogHeading(hostPage)).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
