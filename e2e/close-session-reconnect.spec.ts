import { test, expect } from '@playwright/test';
import {
  closedDialogHeading,
  confirmSessionClosure,
  createSession,
  joinSession,
} from './helpers/session';

test.describe('Closed session reconnect', () => {
  test('recupera evento perdido ao voltar online e receber pageshow', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const participantContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const participantPage = await participantContext.newPage();
      const code = await createSession(hostPage);

      await joinSession(participantPage, code, 'Participante Offline');
      await participantContext.setOffline(true);

      await confirmSessionClosure(hostPage);
      await expect(closedDialogHeading(hostPage)).toBeVisible();

      await participantContext.setOffline(false);
      await participantPage.evaluate(() => {
        window.dispatchEvent(new Event('online'));
        window.dispatchEvent(new PageTransitionEvent('pageshow', {
          persisted: true,
        }));
      });

      await expect(closedDialogHeading(participantPage)).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await hostContext.close();
      await participantContext.close();
    }
  });

  test('mantém closed após retomada da aba e nova sessão de página', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const participantContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const participantPage = await participantContext.newPage();
      const code = await createSession(hostPage);

      await joinSession(participantPage, code, 'Participante Suspenso');
      await participantPage.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
      });

      await confirmSessionClosure(hostPage);
      await expect(closedDialogHeading(hostPage)).toBeVisible();

      await participantPage.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await expect(closedDialogHeading(participantPage)).toBeVisible({
        timeout: 10_000,
      });

      await participantPage.reload();
      await expect(closedDialogHeading(participantPage)).toBeVisible();
    } finally {
      await hostContext.close();
      await participantContext.close();
    }
  });
});