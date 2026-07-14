import { test, expect } from '@playwright/test';

test.describe('Host Creates Session', () => {
  test('should create a room and redirect to DJ dashboard', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/');
    
    // Verify landing page content
    await expect(page.getByRole('heading', { name: 'Vocalis' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Criar nova sala/i })).toBeVisible();
    
    // Intercept RPC or allow real if test DB is configured
    // For this E2E, we assume test DB is running or we mock it.
    // If not running, this test will fail, which is expected for true E2E.
    
    // Click create room
    await page.getByRole('button', { name: /Criar nova sala/i }).click();
    
    // Wait for redirect to DJ dashboard
    await page.waitForURL(/\/sala\/[A-Z2-9]{6}\/dj/);
    
    // Verify DJ dashboard content
    await expect(page.getByRole('heading', { name: 'Painel do DJ' })).toBeVisible();
    
    // The code should be displayed in the page text
    const url = page.url();
    const codeMatch = url.match(/\/sala\/([A-Z2-9]{6})\/dj/);
    expect(codeMatch).not.toBeNull();
    const code = codeMatch![1];
    
    await expect(page.getByText(code)).toBeVisible();
  });
});
