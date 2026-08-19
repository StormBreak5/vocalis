import { expect, test } from '@playwright/test';
import { createSession, pairDisplay } from './helpers/session';

test.describe('Pareamento de telão — Host revoga um telão', () => {
  test('revoga uma TV pareada sem afetar a outra; o efeito só se confirma no reload — não é instantâneo', async ({ browser }) => {
    test.setTimeout(120_000);
    const hostContext = await browser.newContext();
    const tvAContext = await browser.newContext();
    const tvBContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const tvAPage = await tvAContext.newPage();
      const tvBPage = await tvBContext.newPage();
      const code = await createSession(hostPage);

      await pairDisplay(hostPage, code, tvAPage);
      await expect(hostPage.getByText('1 pareado').filter({ visible: true })).toBeVisible({ timeout: 30_000 });
      await pairDisplay(hostPage, code, tvBPage);
      await expect(hostPage.getByText('2 pareados').filter({ visible: true })).toBeVisible({ timeout: 30_000 });

      await expect(hostPage.getByText('Telão 1').filter({ visible: true })).toBeVisible();
      await expect(hostPage.getByText('Telão 2').filter({ visible: true })).toBeVisible();

      // Revoga especificamente "Telão 2" (a TV B) pelo painel do DJ.
      const revokeButton = hostPage.getByRole('button', { name: 'Revogar Telão 2' }).filter({ visible: true });
      await revokeButton.click();

      // O painel do Host reflete a revogação ao vivo (evento Realtime de
      // UPDATE em display_pairings removendo o item) — isso não é o mesmo
      // que a TV B ter perdido acesso; é só o Host vendo o próprio commit.
      await expect(hostPage.getByText('1 pareado').filter({ visible: true })).toBeVisible({ timeout: 15_000 });
      await expect(hostPage.getByText('Telão 2').filter({ visible: true })).toHaveCount(0);
      await expect(hostPage.getByText('Telão 1').filter({ visible: true })).toBeVisible();

      // A revogação NÃO é instantânea para a TV afetada, e este teste não
      // finge que é (research.md R16): a página da TV B já estava renderizada
      // e sua assinatura Realtime já estava aberta antes da revogação — RLS é
      // avaliada no momento da assinatura, não a cada evento entregue, então
      // a TV B pode continuar funcionando normalmente até algo forçar uma
      // nova leitura. Este teste não faz nenhuma asserção sobre o estado da
      // TV B nesse meio-tempo (seria inerentemente não-determinístico). O
      // reload abaixo é exatamente e apenas isso — o gatilho explícito que
      // força a reavaliação — nunca um reload incidental por outro motivo.
      await tvBPage.reload();
      await expect(tvBPage.locator('[data-display-pairing-screen]')).toBeVisible({ timeout: 15_000 });

      // A TV A (não revogada) precisa continuar funcionando normalmente —
      // reload dela também, para provar que a revogação de uma TV não afeta
      // a outra mesmo depois de ambas reavaliarem autorização.
      await tvAPage.reload();
      await expect(tvAPage.locator('[data-display-pairing-screen]')).toHaveCount(0);
      await expect(tvAPage.getByRole('heading', { name: /fila está vazia/i })).toBeVisible();
    } finally {
      await Promise.allSettled([
        hostContext.close(),
        tvAContext.close(),
        tvBContext.close(),
      ]);
    }
  });
});
