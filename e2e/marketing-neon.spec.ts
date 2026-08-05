import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function capture(page: Page, name: string, testInfo: TestInfo) {
  const body = await page.screenshot();
  await testInfo.attach(name, { body, contentType: 'image/png' });
  const outputDirectory = process.env.MARKETING_SCREENSHOT_DIR;
  if (!outputDirectory) return;
  await mkdir(outputDirectory, { recursive: true });
  const project = testInfo.project.name.toLowerCase().replace(/\s+/g, '-');
  await writeFile(resolve(outputDirectory, `${project}-${name}.png`), body);
}

test('home e entrada mantêm navegação, validação e composição responsiva', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Seu karaokê, no ritmo certo.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Criar nova sala de karaokê/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Entrar como cantor/i })).toBeVisible();
  await capture(page, 'home-mobile', testInfo);

  await page.getByRole('link', { name: /Entrar como cantor/i }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('heading', { name: 'Entrar na sala' })).toBeVisible();
  await capture(page, 'entry-mobile', testInfo);

  await page.getByLabel(/Código da Sala/i).fill('ABC');
  await page.getByLabel(/Seu Nome/i).fill('Marina');
  await page.getByRole('button', { name: /Entrar na sala/i }).click();
  await expect(page.getByText('Código inválido.')).toBeVisible();
  await capture(page, 'entry-error-mobile', testInfo);

  await page.getByRole('link', { name: /Voltar para o início/i }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Entrar como cantor/i })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await capture(page, 'home-desktop', testInfo);
  await page.goto('/entrar');
  await capture(page, 'entry-desktop', testInfo);
});
