# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: close-session-leave.spec.ts >> Navegação após encerramento (US5) >> O participante clica para voltar ao início e a navegação ocorre em menos de 5 segundos
- Location: e2e\close-session-leave.spec.ts:4:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /Voltar ao início/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: /Voltar ao início/i })

```

```yaml
- main:
  - heading "Sala C2SY5S" [level=1]
  - text: João Navegador Você
  - heading "Pedir Música" [level=2]
  - text: Nome da Música
  - 'textbox "Ex: Evidências"'
  - text: Artista / Banda
  - 'textbox "Ex: Chitãozinho & Xororó"'
  - button "Colocar na Fila"
  - heading "Fila Atual" [level=2]
  - paragraph: A fila está vazia no momento.
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Navegação após encerramento (US5)', () => {
  4  |   test('O participante clica para voltar ao início e a navegação ocorre em menos de 5 segundos', async ({ browser }) => {
  5  |     // Como estamos validando performance bruta da navegação, criamos a sessão e cronometramos.
  6  |     const hostContext = await browser.newContext();
  7  |     const hostPage = await hostContext.newPage();
  8  |     
  9  |     await hostPage.goto('/');
  10 |     await hostPage.getByRole('button', { name: /Criar Nova Sala/i }).click();
  11 |     await hostPage.waitForURL(/\/sala\/[A-Z0-9]+\/dj/);
  12 | 
  13 |     const hostUrl = hostPage.url();
  14 |     const codeMatch = hostUrl.match(/\/sala\/([A-Z0-9]+)\/dj/);
  15 |     if (!codeMatch) throw new Error('Não encontrou o código da sala');
  16 |     const code = codeMatch[1];
  17 | 
  18 |     const p1Context = await browser.newContext();
  19 |     const p1Page = await p1Context.newPage();
  20 |     await p1Page.goto(`/sala/${code}`);
  21 |     await p1Page.getByLabel(/Seu Nome/i).fill('João Navegador');
  22 |     await p1Page.getByRole('button', { name: /Entrar na sala/i }).click();
  23 |     await expect(p1Page.getByText('João Navegador')).toBeVisible();
  24 | 
  25 |     // Host encerra
  26 |     await hostPage.bringToFront();
  27 |     await hostPage.getByRole('button', { name: /Encerrar sala/i }).click();
  28 |     await hostPage.getByRole('button', { name: /Confirmar encerramento/i }).click();
  29 | 
  30 |     // Participante vê a modal e clica em Voltar
  31 |     await p1Page.bringToFront();
  32 |     const voltarBtn = p1Page.getByRole('button', { name: /Voltar ao início/i });
> 33 |     await expect(voltarBtn).toBeVisible({ timeout: 5000 });
     |                             ^ Error: expect(locator).toBeVisible() failed
  34 | 
  35 |     const startTime = performance.now();
  36 |     await voltarBtn.click();
  37 |     
  38 |     // Deve chegar na URL raiz (/) 
  39 |     await p1Page.waitForURL(/\/$/, { timeout: 5000 });
  40 |     const endTime = performance.now();
  41 |     const duration = endTime - startTime;
  42 |     
  43 |     console.log(`Navegação concluída em ${duration}ms`);
  44 |     expect(duration).toBeLessThan(5000); // Requisito SC-008
  45 | 
  46 |     await hostContext.close();
  47 |     await p1Context.close();
  48 |   });
  49 | });
  50 | 
```