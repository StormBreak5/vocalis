import { test, expect } from '@playwright/test';
import { createSession, joinSession } from './helpers/session';

test.describe('Guest Joins Session', () => {
  test('should allow a guest to join a valid session', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);
      const guestPage = await guestContext.newPage();

      await joinSession(guestPage, code, 'Playwright Tester');
      await expect(guestPage.getByText('Você')).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('should show error for invalid code', async ({ page }) => {
    await page.goto('/sala/XXXXXX');

    await expect(page.getByLabel(/Código da Sala/i)).toHaveValue('XXXXXX');
    await page.getByLabel(/Seu Nome/i).pressSequentially('Tester');
    await page.getByRole('button', { name: /Entrar na sala/i }).click();

    await expect(page.getByText('Sala não encontrada.')).toBeVisible();
  });
});