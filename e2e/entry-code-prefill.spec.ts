import { expect, test } from '@playwright/test';
import { createSession } from './helpers/session';

test.describe('Entrada com codigo preenchido', () => {
  test('preenche o codigo e exige apelido e confirmacao', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);
      const guestPage = await guestContext.newPage();

      await guestPage.goto(`/entrar?codigo=${code.toLowerCase()}`);
      const codeInput = guestPage.getByLabel(/Código da Sala/i);
      const nameInput = guestPage.getByLabel(/Seu Nome/i);
      await expect(codeInput).toHaveValue(code);
      await expect(codeInput).toBeDisabled();
      await expect(nameInput).toHaveValue('');
      await expect(guestPage).toHaveURL(new RegExp(`/entrar\\?codigo=${code.toLowerCase()}$`));

      await nameInput.fill('Cantor QR');
      await guestPage.getByRole('button', { name: /Entrar na sala/i }).click();
      await expect(guestPage).toHaveURL(new RegExp(`/sala/${code}$`));
      await expect(guestPage.getByText('Cantor QR', { exact: true })).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('mantem entrada normal e esvazia codigo invalido', async ({ page }) => {
    await page.goto('/entrar');
    await expect(page.getByLabel(/Código da Sala/i)).toHaveValue('');
    await expect(page.getByLabel(/Código da Sala/i)).toBeEnabled();

    await page.goto('/entrar?codigo=abc%21%21%21');
    await expect(page.getByLabel(/Código da Sala/i)).toHaveValue('');
    await expect(page.getByLabel(/Código da Sala/i)).toBeEnabled();
  });
});
