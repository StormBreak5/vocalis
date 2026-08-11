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
