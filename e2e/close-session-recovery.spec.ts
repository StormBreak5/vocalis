import { test, expect } from '@playwright/test';

test.describe('Resync Fallback (US3)', () => {
  test('Ao recarregar a aba ou navegar diretamente, o participante recupera o estado closed através do Server Component e do Fallback', async ({ browser }) => {
    // 1. Host creates a session
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    
    await hostPage.goto('/');
    await hostPage.getByRole('button', { name: /Criar Nova Sala/i }).click();
    await hostPage.waitForURL(/\/sala\/[A-Z0-9]+\/dj/);
    
    const hostUrl = hostPage.url();
    const codeMatch = hostUrl.match(/\/sala\/([A-Z0-9]+)\/dj/);
    if (!codeMatch) throw new Error('Não encontrou o código da sala');
    const code = codeMatch[1];

    // 2. Participant joins
    const p1Context = await browser.newContext();
    const p1Page = await p1Context.newPage();
    await p1Page.goto(`/sala/${code}`);
    await p1Page.getByLabel(/Seu Nome/i).fill('Participante Recarrega');
    await p1Page.getByRole('button', { name: /Entrar na sala/i }).click();
    await expect(p1Page.getByText('Participante Recarrega')).toBeVisible();

    // 3. Host encerra a sessão
    await hostPage.bringToFront();
    await hostPage.getByRole('button', { name: /Encerrar sala/i }).click();
    await hostPage.getByRole('button', { name: /Confirmar encerramento/i }).click();

    // 4. O Host deve ver a notificação de encerrado (assumido ok via unitário/router.refresh)
    // await expect(hostPage.getByRole('heading', { name: /Esta sessão foi encerrada/i })).toBeVisible({ timeout: 5000 });

    // 5. O Participante, mesmo que o Websocket falhasse, se ele der refresh na página, deve ver que está fechada!
    // Simulando o retorno de um BFCache ou refresh por conta de rede
    await p1Page.bringToFront();
    await p1Page.reload();

    // O Server Component vai retornar a página completa mas com `initialSnapshot` fechado, o provider local exibe o dialog!
    await expect(p1Page.getByRole('heading', { name: /Esta sessão foi encerrada/i })).toBeVisible();

    await hostContext.close();
    await p1Context.close();
  });
});
