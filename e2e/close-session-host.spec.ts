import { test, expect } from '@playwright/test';

test.describe('Host Close Session', () => {
  test('deve permitir fechar sala e desistir sem afetar status e interatividade', async ({ browser }) => {
    // 1. Criar Host e Sala
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await hostPage.goto('/');
    await hostPage.getByRole('button', { name: /Criar nova sala/i }).click();
    await hostPage.waitForURL(/\/sala\/[A-Z2-9]{6}\/dj/);
    
    const djUrl = hostPage.url();
    const codeMatch = djUrl.match(/\/sala\/([A-Z2-9]{6})\/dj/);
    expect(codeMatch).not.toBeNull();
    const code = codeMatch![1];
    const guestUrl = `/sala/${code}`;

    // 2. Desistir de encerrar a sala (cancelar dialog)
    const closeBtn = hostPage.getByRole('button', { name: /Encerrar sala/i });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    
    // Dialog abre
    const dialog = hostPage.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    
    // Foco deve estar no dialog ou botões (acessibilidade)
    const cancelBtn = hostPage.getByRole('button', { name: /Cancelar/i });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // Dialog fecha
    await expect(dialog).not.toBeVisible();
    
    // Foco deve voltar para o botão que abriu
    await expect(closeBtn).toBeFocused();

    // 3. Outro usuário tenta acessar como Host (não autorizado)
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(djUrl);
    // Deve ser redirecionado para a página de convidado
    await guestPage.waitForURL(guestUrl);
    await expect(guestPage.getByRole('heading', { name: 'Painel do DJ' })).not.toBeVisible();

    // 4. Entrar como convidado (interatividade garantida pois não fechou)
    await guestPage.getByLabel(/Seu Nome/i).fill('Convidado 1');
    await guestPage.getByRole('button', { name: /Entrar na sala/i }).click();
    // Verifica UI do participante (nome na tela, indicando que entrou na sala)
    await expect(guestPage.getByText('Convidado 1')).toBeVisible();

    // 5. Finalmente, confirmar encerramento
    await hostPage.bringToFront();
    await closeBtn.click();
    await expect(dialog).toBeVisible();
    const confirmBtn = hostPage.getByRole('button', { name: /Confirmar encerramento/i });
    await confirmBtn.click();
    // Esperar a requisição completar (dialog fecha em caso de sucesso)
    await expect(dialog).not.toBeVisible();
    // Forçamos o reload para confirmar que o banco foi atualizado e a página protege
    await hostPage.reload();
    await expect(hostPage.getByText(/Esta sessão foi encerrada/i)).toBeVisible();
    
    await hostContext.close();
    await guestContext.close();
  });
});
