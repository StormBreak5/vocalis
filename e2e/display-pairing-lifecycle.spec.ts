import { expect, test } from '@playwright/test';
import { confirmSessionClosure, createSession, pairDisplay } from './helpers/session';

test.describe('Pareamento de telão — ciclo de vida da sessão', () => {
  test('TV pareada reflete pausa em tempo real, recupera de queda de rede e exibe encerramento; reload pós-encerramento não reabre o telão nem pede novo pareamento', async ({ browser }) => {
    test.setTimeout(120_000);
    const hostContext = await browser.newContext();
    const tvContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const tvPage = await tvContext.newPage();
      const code = await createSession(hostPage);
      await pairDisplay(hostPage, code, tvPage);
      await expect(tvPage.getByRole('heading', { name: /fila está vazia/i })).toBeVisible();

      // Pausa reflete em tempo real, mesmo texto/estrutura que o telão do
      // próprio Host já usa (DisplayExperience é o mesmo componente).
      await hostPage.getByRole('button', { name: 'Pausar fila' }).filter({ visible: true }).click();
      await expect(tvPage.getByText('Novas entradas e pedidos estão pausados.')).toBeVisible();
      await hostPage.getByRole('button', { name: 'Retomar fila' }).filter({ visible: true }).click();
      await expect(tvPage.getByText('Novas entradas e pedidos estão pausados.')).toHaveCount(0);
      await expect(tvPage.getByText('Ao vivo', { exact: true })).toBeVisible();

      // Queda e retorno de rede: mesma mecânica já usada para o telão do
      // Host em e2e/public-room-display.spec.ts (setOffline + observador de
      // [data-display-state="reconnecting"]) — não é um mecanismo novo.
      await tvContext.setOffline(true);
      await expect(tvPage.getByText('Sem conexão.', { exact: true })).toBeVisible();
      const reconnectingSeen = tvPage.evaluate(() => new Promise<boolean>((resolve) => {
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
      await tvContext.setOffline(false);
      expect(await reconnectingSeen).toBe(true);
      await expect(tvPage.getByText('Ao vivo', { exact: true })).toBeVisible({ timeout: 15_000 });

      // Encerramento: a TV pareada precisa ver o mesmo DisplayClosedState
      // que o telão do Host já mostra hoje — sessions continua legível para
      // telão pareado mesmo com status closed (is_paired_display, sem exigir
      // sessão aberta; provado por supabase/tests/004_display_pairing_rls.sql).
      await confirmSessionClosure(hostPage);
      await expect(tvPage.getByRole('heading', { name: 'Sala encerrada' })).toBeVisible({ timeout: 10_000 });
      await expect(tvPage.locator('[data-display-pairing-screen]')).toHaveCount(0);

      // Reload pós-encerramento mantém o estado terminal sem pedir novo
      // pareamento — mesma garantia que o Edge Case da spec exige.
      await tvPage.reload();
      await expect(tvPage.getByRole('heading', { name: 'Sala encerrada' })).toBeVisible();
      await expect(tvPage.locator('[data-display-pairing-screen]')).toHaveCount(0);
    } finally {
      await Promise.allSettled([hostContext.close(), tvContext.close()]);
    }
  });
});
