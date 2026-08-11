import { test, expect } from '@playwright/test';
import { confirmSessionClosure } from './helpers/session';

test.describe('Navegação após encerramento (US5)', () => {
  test('O participante clica para voltar ao início e a navegação ocorre em menos de 5 segundos', async ({ browser }) => {
    // Como estamos validando performance bruta da navegação, criamos a sessão e cronometramos.
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    
    await hostPage.goto('/');
    await hostPage.getByRole('button', { name: /Criar Nova Sala/i }).click();
    await hostPage.waitForURL(/\/sala\/[A-Z0-9]+\/dj/);

    const hostUrl = hostPage.url();
    const codeMatch = hostUrl.match(/\/sala\/([A-Z0-9]+)\/dj/);
    if (!codeMatch) throw new Error('Não encontrou o código da sala');
    const code = codeMatch[1];

    const p1Context = await browser.newContext();
    const p1Page = await p1Context.newPage();
    await p1Page.goto(`/sala/${code}`);
    await p1Page.getByLabel(/Seu Nome/i).pressSequentially('João Navegador');
    await p1Page.getByRole('button', { name: /Entrar na sala/i }).click();
    await expect(p1Page.getByText('João Navegador')).toBeVisible();

    // Host encerra
    await hostPage.bringToFront();
    await confirmSessionClosure(hostPage);

    // Participante vê a modal e clica em Voltar
    await p1Page.bringToFront();
    const voltarBtn = p1Page.getByRole('button', { name: /Voltar para o início/i });
    await expect(voltarBtn).toBeVisible({ timeout: 5000 });

    const startTime = performance.now();
    await voltarBtn.click();
    
    // Deve chegar na URL raiz (/) 
    await p1Page.waitForURL(/\/$/, { timeout: 5000 });
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`Navegação concluída em ${duration}ms`);
    expect(duration).toBeLessThan(5000); // Requisito SC-008

    await hostContext.close();
    await p1Context.close();
  });
});
