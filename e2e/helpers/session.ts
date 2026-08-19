import { expect, type BrowserContext, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/src/infrastructure/supabase/database.types';

export async function createSession(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: /Criar nova sala/i }).click();
  await page.waitForURL(/\/sala\/[A-Z2-9]{6}\/dj/);

  const match = page.url().match(/\/sala\/([A-Z2-9]{6})\/dj/);
  if (!match) {
    throw new Error('Código da sala não encontrado na URL do Host.');
  }

  return match[1];
}

export async function joinSession(
  page: Page,
  code: string,
  displayName: string,
) {
  await page.goto('/sala/' + code);
  await page.getByLabel(/Seu Nome/i).pressSequentially(displayName);
  await page.getByRole('button', { name: /Entrar na sala/i }).click();
  await expect(page.getByText(displayName, { exact: true })).toBeVisible();
}

export async function requestSong(
  page: Page,
  songTitle: string,
  artist: string,
) {
  const openRequestButton = page.getByRole('button', { name: 'Pedir música' });
  if (await openRequestButton.isVisible().catch(() => false)) {
    await openRequestButton.click();
  }

  await page.getByPlaceholder(/Ex: Evidências/i).fill(songTitle);
  await page.getByPlaceholder(/Ex: Chitãozinho/i).fill(artist);
  await page.getByRole('button', { name: /Colocar na fila/i }).click();
  await expect(page.getByText(songTitle, { exact: true })).toBeVisible();
}

export async function confirmSessionClosure(page: Page) {
  await openHostSessionControls(page);
  await visibleSessionCloseButton(page).click();
  await page.getByRole('button', { name: /Confirmar encerramento/i }).click();
}

export function visibleSessionCloseButton(page: Page) {
  return page.getByRole('button', { name: /Encerrar sala/i }).filter({ visible: true });
}

export async function openHostSessionControls(page: Page) {
  const closeButton = visibleSessionCloseButton(page);
  if (await closeButton.count()) return;
  await page.getByRole('button', { name: /Abrir controles da sessão/i }).click();
  await expect(closeButton).toBeVisible();
}

export function closedDialogHeading(page: Page) {
  return page.getByRole('heading', { name: 'Sala encerrada' });
}

export async function pairDisplay(hostPage: Page, code: string, tvPage: Page): Promise<void> {
  const participantsTab = hostPage.getByRole('tab', { name: /Participantes/i });
  if (await participantsTab.isVisible().catch(() => false)) {
    await participantsTab.click();
  }

  const generateButton = hostPage.getByRole('button', { name: 'Parear telão' }).filter({ visible: true });
  const generatedCodeCard = hostPage.getByTestId('dj-pairing-generated-code').filter({ visible: true });
  const codeValue = generatedCodeCard.locator('span').nth(1);
  // A second call to this helper (pairing a second TV) finds the card
  // already visible with the previous code — toBeVisible() alone would
  // resolve instantly and read stale text before React re-renders with the
  // new one. Compare against the pre-click value and let Playwright's
  // retrying `not.toHaveText` wait for the actual change instead.
  const previousCode = (await generatedCodeCard.count()) > 0
    ? await codeValue.textContent().catch(() => null)
    : null;

  await generateButton.click();

  await expect(generatedCodeCard).toBeVisible();
  if (previousCode) {
    await expect(codeValue).not.toHaveText(previousCode);
  }
  const pairingCode = (await codeValue.textContent())?.trim() ?? '';

  // A rota do telão é pensada exclusivamente para TV/projetor — o CSS de
  // `.flow` (display.module.css) assume um viewport largo e colapsa para
  // largura ~0 no viewport estreito padrão do projeto Mobile Chrome assim
  // que há conteúdo de fila para exibir (o estado vazio não usa `.flow`,
  // por isso isso só aparece quando a fila deixa de estar vazia). Mesmo
  // tamanho que os demais testes de telão já usam (público/Host).
  await tvPage.setViewportSize({ width: 1_920, height: 1_080 });
  await tvPage.goto(`/sala/${code}/display`);
  await expect(tvPage.locator('[data-display-pairing-screen]')).toBeVisible();
  await tvPage.getByLabel(/código de pareamento/i).fill(pairingCode);
  await tvPage.getByRole('button', { name: 'Parear telão' }).click();
  await expect(tvPage.locator('[data-display-pairing-screen]')).toHaveCount(0, { timeout: 15_000 });
}

export async function createContextSupabaseClient(context: BrowserContext) {
  const { combinedEnv } = loadEnvConfig(process.cwd());
  const supabaseUrl = combinedEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = combinedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Variáveis públicas do Supabase não configuradas para o E2E.');
  }

  const contextCookies = await context.cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return contextCookies.map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // O E2E usa a sessão já estabelecida pelo navegador e não renova cookies.
      },
    },
  });
}
