import { expect, test } from '@playwright/test';
import { createSession, joinSession, pairDisplay, requestSong } from './helpers/session';

test.describe('Pareamento de telão — bar com mais de uma TV', () => {
  test('duas TVs pareadas com dois códigos distintos: painel do DJ mostra contagem 2 ao vivo, e mudança na fila chega às duas simultaneamente', async ({ browser }) => {
    test.setTimeout(120_000);
    const hostContext = await browser.newContext();
    const tvAContext = await browser.newContext();
    const tvBContext = await browser.newContext();
    const participantContext = await browser.newContext();
    try {
      const hostPage = await hostContext.newPage();
      const tvAPage = await tvAContext.newPage();
      const tvBPage = await tvBContext.newPage();
      const code = await createSession(hostPage);

      // Cada código de pareamento é de uso único — duas TVs exigem duas
      // chamadas de geração, cada uma com seu próprio código. Resgatar o
      // mesmo código duas vezes exercitaria o caminho de erro (código já
      // consumido), não o de duas TVs distintas.
      //
      // Timeout maior que o padrão nas duas asserções de contagem abaixo:
      // isolado (rodando só este arquivo logo após `supabase db reset`), o
      // processo Realtime local ocasionalmente reinicia (SIGTERM + perda da
      // conexão de replicação com o Postgres, visível nos logs do container
      // supabase_realtime_vocalis) — reinício que o harness (`checkRealtime`
      // em scripts/e2e/run-local.mjs) não detecta, porque só confirma que dá
      // pra assinar um canal, não que eventos de postgres_changes atravessam
      // essa reconexão. Um canal assinado bem cedo (a página do DJ monta e
      // este hook assina quase imediatamente após `createSession`) pode
      // ficar órfão do lado do servidor sem que o cliente perceba. Isso é
      // uma fragilidade do harness local, não do RPC/hook do produto — não
      // reproduz rodando a suíte completa, onde outros testes já consomem
      // esse período antes deste arquivo ser alcançado.
      await pairDisplay(hostPage, code, tvAPage);
      await expect(hostPage.getByText('1 pareado').filter({ visible: true })).toBeVisible({ timeout: 30_000 });

      await pairDisplay(hostPage, code, tvBPage);
      await expect(hostPage.getByText('2 pareados').filter({ visible: true })).toBeVisible({ timeout: 30_000 });
      await expect(hostPage.getByText('1 pareado').filter({ visible: true })).toHaveCount(0);

      await expect(tvAPage.getByRole('heading', { name: /fila está vazia/i })).toBeVisible();
      await expect(tvBPage.getByRole('heading', { name: /fila está vazia/i })).toBeVisible();

      // Mudança na fila chega às duas TVs simultaneamente — nenhum reload em
      // nenhuma das duas entre o pedido e as asserções abaixo.
      const participantPage = await participantContext.newPage();
      await joinSession(participantPage, code, 'Cantor Simultâneo');
      await requestSong(participantPage, 'Música Compartilhada', 'Artista Compartilhado');

      // Título e artista renderizam combinados num único nó de texto
      // ("Música Compartilhada · Artista Compartilhado" — DisplayNextUp),
      // por isso substring, não exact, para o título/artista.
      await expect(tvAPage.getByText('Cantor Simultâneo', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(tvAPage.getByText('Música Compartilhada')).toBeVisible();
      await expect(tvBPage.getByText('Cantor Simultâneo', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(tvBPage.getByText('Música Compartilhada')).toBeVisible();
    } finally {
      await Promise.allSettled([
        hostContext.close(),
        tvAContext.close(),
        tvBContext.close(),
        participantContext.close(),
      ]);
    }
  });
});
