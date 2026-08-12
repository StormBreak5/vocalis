import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import decodeQR from 'qr/decode.js';
import {
  confirmSessionClosure,
  createSession,
  joinSession,
  requestSong,
} from './helpers/session';

async function openDisplayFromDashboard(hostPage: Page): Promise<Page> {
  let displayLink = hostPage.getByRole('link', { name: 'Abrir telão' }).filter({ visible: true });
  if (await displayLink.count() === 0) {
    await hostPage.getByRole('button', { name: /Abrir controles da sessão/i }).click();
    displayLink = hostPage.getByRole('link', { name: 'Abrir telão' }).filter({ visible: true });
  }

  const popupPromise = hostPage.context().waitForEvent('page');
  await displayLink.click();
  const displayPage = await popupPromise;
  await displayPage.waitForLoadState('domcontentloaded');
  const closeControls = hostPage.getByRole('button', { name: /Fechar controles da sessão/i });
  if (await closeControls.isVisible().catch(() => false)) await closeControls.click();
  return displayPage;
}

async function expectNoViewportOverflow(page: Page, includeDocument = true) {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    displayHorizontal: (() => {
      const display = document.querySelector<HTMLElement>('[data-public-display]');
      return display ? display.scrollWidth - display.clientWidth : 1;
    })(),
    displayVertical: (() => {
      const display = document.querySelector<HTMLElement>('[data-public-display]');
      return display ? display.scrollHeight - display.clientHeight : 1;
    })(),
  }));
  expect(overflow.displayHorizontal).toBe(0);
  expect(overflow.displayVertical).toBe(0);
  if (includeDocument) {
    expect(overflow.horizontal).toBe(0);
    expect(overflow.vertical).toBe(0);
  }
}

async function expectEssentialContentInsideCards(page: Page) {
  const clipped = await page.evaluate(() => {
    const checks = [
      ['[data-display-now-singing] h1', '[data-display-now-singing]'],
      ['[data-display-now-singing] > div:nth-last-child(2)', '[data-display-now-singing]'],
      ['[data-display-now-singing] > div:last-child', '[data-display-now-singing]'],
      ['[data-display-next-up]', '[data-display-next-up]'],
      ['[data-display-queue-preview]', '[data-display-queue-preview]'],
      ['[data-display-join-panel]', '[data-display-join-panel]'],
    ] as const;

    return checks.flatMap(([childSelector, containerSelector]) => {
      const child = document.querySelector<HTMLElement>(childSelector);
      const container = document.querySelector<HTMLElement>(containerSelector);
      if (!child || !container) return [];
      const childRect = child.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const tolerance = 1;
      return childRect.top < containerRect.top - tolerance
        || childRect.right > containerRect.right + tolerance
        || childRect.bottom > containerRect.bottom + tolerance
        || childRect.left < containerRect.left - tolerance
        ? [childSelector]
        : [];
    });
  });
  expect(clipped).toEqual([]);
}

async function decodeRenderedQr(page: Page): Promise<string> {
  const image = page.locator('[data-display-join-panel] img');
  const pixels = await image.evaluate((node) => {
    const qr = node as HTMLImageElement;
    const size = 680;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas indisponível para decodificar QR.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(qr, 0, 0, size, size);
    return Array.from(context.getImageData(0, 0, size, size).data);
  });

  return decodeQR({ width: 680, height: 680, data: Uint8Array.from(pixels) });
}

async function saveTemporaryScreenshot(page: Page, name: string) {
  const directory = process.env.VOCALIS_DISPLAY_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, name), fullPage: false });
}

async function createParticipantWithSong(
  browserContext: BrowserContext,
  code: string,
  participantName: string,
  songTitle: string,
  artist: string,
) {
  const page = await browserContext.newPage();
  await joinSession(page, code, participantName);
  await requestSong(page, songTitle, artist);
  return page;
}

test.describe('Telão Público Host-only', () => {
  test('aplica autorização uniforme para participante, outro Host, anônimo e sala inexistente', async ({ browser }) => {
    test.setTimeout(90_000);
    const hostContext = await browser.newContext();
    const participantContext = await browser.newContext();
    const otherHostContext = await browser.newContext();
    const anonymousContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);

      await hostPage.goto(`/sala/${code}/display`);
      await expect(hostPage.locator('[data-public-display]')).toBeVisible();

      const participantPage = await participantContext.newPage();
      await joinSession(participantPage, code, 'Participante Sem Acesso');
      await participantPage.goto(`/sala/${code}/display`);
      await expect(participantPage).toHaveURL(new RegExp(`/sala/${code}$`));
      await expect(participantPage.locator('[data-public-display]')).toHaveCount(0);

      const otherHostPage = await otherHostContext.newPage();
      await createSession(otherHostPage);
      await otherHostPage.goto(`/sala/${code}/display`);
      await expect(otherHostPage).toHaveURL(new RegExp(`/sala/${code}$`));

      const anonymousPage = await anonymousContext.newPage();
      await anonymousPage.goto(`/sala/${code}/display`);
      await expect(anonymousPage).toHaveURL(new RegExp(`/sala/${code}$`));

      await hostPage.goto('/sala/ZZZ999/display');
      await expect(hostPage).toHaveURL(/\/sala\/ZZZ999$/);
    } finally {
      await Promise.allSettled([
        hostContext.close(),
        participantContext.close(),
        otherHostContext.close(),
        anonymousContext.close(),
      ]);
    }
  });

  test('abre pelo Painel, atualiza sem reload e preserva o último estado durante recuperação', async ({ browser }) => {
    test.setTimeout(240_000);
    const hostContext = await browser.newContext();
    const participantContexts = [
      await browser.newContext(),
      await browser.newContext(),
      await browser.newContext(),
    ];
    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);
      await createParticipantWithSong(participantContexts[0], code, 'Marina Costa', 'Evidências', 'Chitãozinho & Xororó');
      await createParticipantWithSong(participantContexts[1], code, 'Diego Luz', 'Tempo Perdido', 'Legião Urbana');
      await createParticipantWithSong(participantContexts[2], code, 'Aisha 星', 'Velha Infância', 'Tribalistas');
      await hostPage.reload();

      const displayPage = await openDisplayFromDashboard(hostPage);

      await displayPage.setViewportSize({ width: 1_920, height: 1_080 });
      const forbiddenRequests: string[] = [];
      displayPage.on('request', (request) => {
        const url = request.url();
        if (
          ['PATCH', 'PUT', 'DELETE'].includes(request.method())
          || /\/rpc\/(?:update|close|cancel|request|join)/i.test(url)
        ) forbiddenRequests.push(`${request.method()} ${url}`);
      });

      await expect(displayPage.getByText('Marina Costa', { exact: true })).toBeVisible();
      await hostPage.getByRole('button', { name: 'Chamar Marina Costa' }).filter({ visible: true }).click();
      await hostPage.getByRole('button', { name: 'Iniciar Marina Costa' }).filter({ visible: true }).click();
      await expect(displayPage.locator('[data-display-now-singing]')).toContainText('Marina Costa');
      await expect(displayPage.locator('[data-display-now-singing]')).toContainText('Evidências');

      await hostPage.getByRole('button', { name: 'Chamar Diego Luz' }).filter({ visible: true }).click();
      await expect(displayPage.locator('[data-display-next-up]')).toContainText('Diego Luz');
      await expect(displayPage.locator('[data-display-queue-preview]')).toContainText('Aisha 星');

      await hostPage.getByRole('button', { name: 'Pausar fila' }).filter({ visible: true }).click();
      await expect(displayPage.getByText(/Novas entradas e pedidos estão pausados/i)).toBeVisible();
      await expect(displayPage.getByText('Marina Costa', { exact: true })).toBeVisible();
      await saveTemporaryScreenshot(displayPage, 'display-paused-1920x1080.png');

      await hostContext.setOffline(true);
      await expect(displayPage.getByText('Sem conexão.', { exact: true })).toBeVisible();
      await expect(displayPage.getByText('Marina Costa', { exact: true })).toBeVisible();
      await expect(displayPage.getByText('Evidências', { exact: true })).toBeVisible();
      const reconnectingSeen = displayPage.evaluate(() => new Promise<boolean>((resolve) => {
        const isReconnecting = () => document.querySelector('[data-display-state="reconnecting"]') !== null;
        if (isReconnecting()) return resolve(true);
        const observer = new MutationObserver(() => {
          if (!isReconnecting()) return;
          observer.disconnect();
          resolve(true);
        });
        observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
        window.setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, 5_000);
      }));
      await hostContext.setOffline(false);
      expect(await reconnectingSeen).toBe(true);
      await expect(displayPage.getByText('Ao vivo', { exact: true })).toBeVisible({ timeout: 15_000 });
      await hostPage.getByRole('button', { name: 'Retomar fila' }).filter({ visible: true }).click();
      await expect(displayPage.getByText('Sessão ativa', { exact: true })).toBeVisible();

      for (const [width, height, file] of [
        [1_280, 720, 'display-active-1280x720.png'],
        [1_920, 1_080, 'display-active-1920x1080.png'],
        [3_440, 1_440, 'display-active-3440x1440.png'],
      ] as const) {
        await displayPage.setViewportSize({ width, height });
        await expectNoViewportOverflow(displayPage);
        await expectEssentialContentInsideCards(displayPage);
        await saveTemporaryScreenshot(displayPage, file);
      }

      for (const zoom of ['80%', '100%', '125%']) {
        await displayPage.evaluate((value) => { document.documentElement.style.zoom = value; }, zoom);
        await expectNoViewportOverflow(displayPage, false);
      }
      await displayPage.evaluate(() => { document.documentElement.style.zoom = ''; });

      await confirmSessionClosure(hostPage);
      await expect(displayPage.getByRole('heading', { name: 'Sala encerrada' })).toBeVisible({ timeout: 10_000 });
      await expect(displayPage.getByText(code, { exact: true })).toHaveCount(0);
      await expect(displayPage.getByText('Marina Costa', { exact: true })).toHaveCount(0);
      await expect(displayPage.getByText('Evidências', { exact: true })).toHaveCount(0);
      await expect(displayPage.locator('[data-display-join-panel]')).toHaveCount(0);
      await expect(displayPage.locator('[data-display-queue-preview]')).toHaveCount(0);
      await displayPage.setViewportSize({ width: 1_920, height: 1_080 });
      await saveTemporaryScreenshot(displayPage, 'display-closed-1920x1080.png');
      expect(forbiddenRequests).toEqual([]);
    } finally {
      await Promise.allSettled(participantContexts.map((context) => context.close()));
      await hostContext.close().catch(() => undefined);
    }
  });

  test('mostra fila vazia e decodifica o QR para a URL exata', async ({ browser }) => {
    test.setTimeout(60_000);
    test.skip(!process.env.APP_PUBLIC_URL, 'Executado na passagem com origem pública fictícia.');
    const hostContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);
      const displayPage = await openDisplayFromDashboard(hostPage);

      await displayPage.setViewportSize({ width: 1_920, height: 1_080 });
      await expect(displayPage.getByRole('heading', { name: /fila está vazia/i })).toBeVisible();
      const source = await displayPage.locator('[data-display-join-panel] img').getAttribute('src');
      expect(source).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
      const expectedUrl = `${process.env.APP_PUBLIC_URL!.replace(/\/$/, '')}/entrar?codigo=${code}`;
      expect(await decodeRenderedQr(displayPage)).toBe(expectedUrl);
      await expect(displayPage.getByText(expectedUrl, { exact: true })).toBeVisible();
      await saveTemporaryScreenshot(displayPage, 'display-empty-with-qr-1920x1080.png');
    } finally {
      await hostContext.close();
    }
  });

  test('não cria QR falso quando APP_PUBLIC_URL está ausente', async ({ browser }) => {
    test.skip(Boolean(process.env.APP_PUBLIC_URL), 'Executado na passagem sem APP_PUBLIC_URL.');
    const hostContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);
      const displayPage = await openDisplayFromDashboard(hostPage);

      await displayPage.setViewportSize({ width: 1_920, height: 1_080 });
      await expect(displayPage.getByText('Entre no Vocalis')).toBeVisible();
      await expect(displayPage.getByText(/Use o código abaixo na tela de entrada/i)).toBeVisible();
      await expect(displayPage.getByText(code, { exact: true })).toBeVisible();
      await expect(displayPage.locator('[data-display-join-panel] img')).toHaveCount(0);
      await expect(displayPage.getByText(/configur|localhost/i)).toHaveCount(0);
      await saveTemporaryScreenshot(displayPage, 'display-origin-missing-1920x1080.png');
    } finally {
      await hostContext.close();
    }
  });

  test('continua funcional quando a Fullscreen API está ausente', async ({ browser }) => {
    const hostContext = await browser.newContext();
    await hostContext.addInitScript(() => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(Document.prototype, 'exitFullscreen', {
        configurable: true,
        value: undefined,
      });
    });
    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);
      await hostPage.goto(`/sala/${code}/display`);

      await expect(hostPage.locator('[data-public-display]')).toBeVisible();
      await expect(hostPage.getByRole('heading', { name: /fila está vazia/i })).toBeVisible();
      await expect(hostPage.getByRole('button', { name: /tela cheia/i })).toHaveCount(0);
    } finally {
      await hostContext.close();
    }
  });

  test('preserva textos longos e Unicode sem overflow', async ({ browser }) => {
    test.setTimeout(60_000);
    const hostContext = await browser.newContext();
    const participantContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);
      const participantName = 'Marina Conceição 🎤 Vozes 夜';
      const songTitle = 'Canção Extraordinariamente Longa — Versão Internacional Remasterizada';
      await createParticipantWithSong(
        participantContext,
        code,
        participantName,
        songTitle,
        'Orquestra Filarmônica de São Paulo & Gäste 東京',
      );
      await hostPage.reload();
      const displayPage = await hostContext.newPage();
      await displayPage.goto(`/sala/${code}/display`);
      await displayPage.setViewportSize({ width: 1_920, height: 1_080 });
      await hostPage.getByRole('button', { name: new RegExp(`Chamar ${participantName}`) }).filter({ visible: true }).click();
      await hostPage.getByRole('button', { name: new RegExp(`Iniciar ${participantName}`) }).filter({ visible: true }).click();

      await expect(displayPage.getByText(participantName, { exact: true })).toBeVisible();
      await expect(displayPage.getByText(songTitle, { exact: true })).toBeVisible();
      await expect(displayPage.locator('[data-large-text]')).toBeVisible();
      await expectNoViewportOverflow(displayPage);
      await saveTemporaryScreenshot(displayPage, 'display-long-unicode-1920x1080.png');
    } finally {
      await Promise.allSettled([hostContext.close(), participantContext.close()]);
    }
  });
});
