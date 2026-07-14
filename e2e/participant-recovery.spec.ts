import { test, expect } from '@playwright/test';

test.describe('Participant Recovery and Reconnection', () => {
  test('should recover participant identity after refresh', async ({ page }) => {
    // 1. Join session
    await page.goto('/sala/AABB22');
    await page.getByLabel(/Código da Sala/i).fill('AABB22');
    await page.getByLabel(/Seu Nome/i).fill('John Recovery');
    await page.getByRole('button', { name: /Entrar na sala/i }).click();

    // 2. Wait for participant view to load
    await expect(page.getByText('John Recovery')).toBeVisible();
    await expect(page.getByText('Você')).toBeVisible();

    // 3. Refresh page
    await page.reload();

    // 4. Assert participant view is still shown without join form
    await expect(page.getByLabel(/Código da Sala/i)).toHaveCount(0); // form should not be there
    await expect(page.getByText('John Recovery')).toBeVisible();
    await expect(page.getByText('Você')).toBeVisible();
  });

  test('should show join form if no cookie exists', async ({ page, context }) => {
    // Clear cookies explicitly
    await context.clearCookies();

    // Navigate to room
    await page.goto('/sala/AABB22');

    // Assert join form is shown
    await expect(page.getByLabel(/Código da Sala/i)).toBeVisible();
    await expect(page.getByLabel(/Código da Sala/i)).toHaveValue('AABB22');
  });

  test('should show join form if cookie has invalid structure silently', async ({ page, context }) => {
    // Set invalid cookie manually
    await context.addCookies([
      {
        name: 'vocalis_pid',
        value: JSON.stringify({ invalid: 'data' }),
        domain: 'localhost',
        path: '/sala/AABB22',
      },
    ]);

    await page.goto('/sala/AABB22');

    // Form should render, meaning recovery failed silently
    await expect(page.getByLabel(/Código da Sala/i)).toBeVisible();
  });
});
