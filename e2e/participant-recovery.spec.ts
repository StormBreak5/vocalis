import { test, expect } from '@playwright/test';
import { createSession, joinSession } from './helpers/session';

test.describe('Participant Recovery and Reconnection', () => {
  test('should recover participant identity after refresh', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const participantContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);
      const participantPage = await participantContext.newPage();

      await joinSession(participantPage, code, 'John Recovery');
      await expect(participantPage.getByText('Você')).toBeVisible();

      await participantPage.reload();

      await expect(participantPage.getByLabel(/Código da Sala/i)).toHaveCount(0);
      await expect(participantPage.getByText('John Recovery')).toBeVisible();
      await expect(participantPage.getByText('Você')).toBeVisible();
    } finally {
      await hostContext.close();
      await participantContext.close();
    }
  });

  test('should show join form if no cookie exists', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/sala/AABB22');

    await expect(page.getByLabel(/Código da Sala/i)).toBeVisible();
    await expect(page.getByLabel(/Código da Sala/i)).toHaveValue('AABB22');
  });

  test('should show join form if cookie has invalid structure silently', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'vocalis_pid',
        value: JSON.stringify({ invalid: 'data' }),
        domain: 'localhost',
        path: '/sala/AABB22',
      },
    ]);

    await page.goto('/sala/AABB22');
    await expect(page.getByLabel(/Código da Sala/i)).toBeVisible();
  });
});