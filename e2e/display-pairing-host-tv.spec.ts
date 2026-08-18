import { expect, test } from '@playwright/test';
import { createSession } from './helpers/session';

test.describe('Pareamento de telão — Host pareia a TV do bar', () => {
  test('Host gera código, a TV resgata e passa a exibir o telão; reload mantém; o painel do DJ reflete a contagem ao vivo', async ({ browser }) => {
    test.setTimeout(90_000);
    const hostContext = await browser.newContext();
    const tvContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);

      // Mobile: o painel de pareamento vive na aba "Participantes".
      const participantsTab = hostPage.getByRole('tab', { name: /Participantes/i });
      if (await participantsTab.isVisible().catch(() => false)) {
        await participantsTab.click();
      }

      const generateButton = hostPage.getByRole('button', { name: 'Parear telão' }).filter({ visible: true });
      await expect(generateButton).toBeVisible();
      await expect(hostPage.getByText('Nenhum telão pareado ainda.').filter({ visible: true })).toBeVisible();
      await generateButton.click();

      const generatedCodeCard = hostPage.getByTestId('dj-pairing-generated-code').filter({ visible: true });
      await expect(generatedCodeCard).toBeVisible();
      const pairingCode = (await generatedCodeCard.locator('span').nth(1).textContent())?.trim() ?? '';
      expect(pairingCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

      // Segunda aba, identidade totalmente nova: representa a TV do bar.
      const tvPage = await tvContext.newPage();
      await tvPage.goto(`/sala/${code}/display`);
      await expect(tvPage.locator('[data-display-pairing-screen]')).toBeVisible();

      const pairingInput = tvPage.getByLabel(/código de pareamento/i);
      await pairingInput.fill(pairingCode);
      await tvPage.getByRole('button', { name: 'Parear telão' }).click();

      // O telão precisa aparecer sem exigir mais nada do usuário — se o
      // cookie de sessão anônima escrito pela Server Action não tivesse sido
      // propagado antes do router.refresh(), o sintoma seria a tela de
      // pareamento reaparecendo aqui como se o código estivesse errado.
      await expect(tvPage.locator('[data-display-pairing-screen]')).toHaveCount(0, { timeout: 15_000 });
      await expect(tvPage.getByRole('heading', { name: /fila está vazia/i })).toBeVisible();
      await expect(tvPage.locator('[data-display-join-panel]')).toBeVisible();

      // Reload da TV mantém o telão sem pedir o código de novo.
      await tvPage.reload();
      await expect(tvPage.locator('[data-display-pairing-screen]')).toHaveCount(0);
      await expect(tvPage.locator('[data-display-join-panel]')).toBeVisible();

      // Painel do DJ reflete a contagem em tempo real — nenhum reload da
      // hostPage acontece entre o resgate acima e esta asserção.
      await expect(hostPage.getByText('1 pareado').filter({ visible: true })).toBeVisible({ timeout: 15_000 });
      await expect(hostPage.getByText('Nenhum telão pareado ainda.').filter({ visible: true })).toHaveCount(0);
    } finally {
      await Promise.allSettled([hostContext.close(), tvContext.close()]);
    }
  });

  test('código de pareamento errado mostra mensagem genérica e não desbloqueia o telão', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const tvContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);

      const tvPage = await tvContext.newPage();
      await tvPage.goto(`/sala/${code}/display`);
      await tvPage.getByLabel(/código de pareamento/i).fill('ZZZZZZ');
      await tvPage.getByRole('button', { name: 'Parear telão' }).click();

      await expect(tvPage.locator('#pairing-code-error')).toHaveText('Código de pareamento inválido ou expirado.');
      await expect(tvPage.locator('[data-display-pairing-screen]')).toBeVisible();
      await expect(tvPage.locator('[data-display-join-panel]')).toHaveCount(0);
    } finally {
      await Promise.allSettled([hostContext.close(), tvContext.close()]);
    }
  });
});
