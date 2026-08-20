# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: entry-code-prefill.spec.ts >> Entrada com codigo preenchido >> preenche o codigo e exige apelido e confirmacao
- Location: e2e\entry-code-prefill.spec.ts:5:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/sala\/VQQ33U$/
Received string:  "http://127.0.0.1:3000/entrar?codigo=vqq33u"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × unexpected value "http://127.0.0.1:3000/entrar?codigo=vqq33u"

```

```yaml
- main:
  - link "Voltar para o início":
    - /url: /
  - link "Vocalis — página inicial":
    - /url: /
    - text: Vocalis
  - heading "Entrar na sala" [level=1]
  - paragraph: Informe seus dados para acompanhar a fila e saber exatamente quando chega a sua vez.
  - region "Pronto para cantar?":
    - heading "Pronto para cantar?" [level=2]
    - paragraph: Entre com o código da sala e escolha como quer ser chamado.
    - text: Código da Sala
    - textbox "Código da Sala" [disabled]:
      - /placeholder: "Ex: AABB22"
      - text: VQQ33U
    - paragraph: Use o código de seis caracteres exibido pelo DJ.
    - text: Seu Nome (ou Apelido)
    - textbox "Seu Nome (ou Apelido)" [invalid]:
      - /placeholder: Como quer ser chamado?
    - paragraph: Seu apelido ficará visível para as pessoas na sala.
    - alert: Nome inválido.
    - button "Entrar na sala": Entrar na Sala
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | import { createSession } from './helpers/session';
  3  | 
  4  | test.describe('Entrada com codigo preenchido', () => {
  5  |   test('preenche o codigo e exige apelido e confirmacao', async ({ browser }) => {
  6  |     const hostContext = await browser.newContext();
  7  |     const guestContext = await browser.newContext();
  8  | 
  9  |     try {
  10 |       const hostPage = await hostContext.newPage();
  11 |       const code = await createSession(hostPage);
  12 |       const guestPage = await guestContext.newPage();
  13 | 
  14 |       await guestPage.goto(`/entrar?codigo=${code.toLowerCase()}`);
  15 |       const codeInput = guestPage.getByLabel(/Código da Sala/i);
  16 |       const nameInput = guestPage.getByLabel(/Seu Nome/i);
  17 |       await expect(codeInput).toHaveValue(code);
  18 |       await expect(codeInput).toBeDisabled();
  19 |       await expect(nameInput).toHaveValue('');
  20 |       await expect(guestPage).toHaveURL(new RegExp(`/entrar\\?codigo=${code.toLowerCase()}$`));
  21 | 
  22 |       await nameInput.fill('Cantor QR');
  23 |       await guestPage.getByRole('button', { name: /Entrar na sala/i }).click();
> 24 |       await expect(guestPage).toHaveURL(new RegExp(`/sala/${code}$`));
     |                               ^ Error: expect(page).toHaveURL(expected) failed
  25 |       await expect(guestPage.getByText('Cantor QR', { exact: true })).toBeVisible();
  26 |     } finally {
  27 |       await hostContext.close();
  28 |       await guestContext.close();
  29 |     }
  30 |   });
  31 | 
  32 |   test('mantem entrada normal e esvazia codigo invalido', async ({ page }) => {
  33 |     await page.goto('/entrar');
  34 |     await expect(page.getByLabel(/Código da Sala/i)).toHaveValue('');
  35 |     await expect(page.getByLabel(/Código da Sala/i)).toBeEnabled();
  36 | 
  37 |     await page.goto('/entrar?codigo=abc%21%21%21');
  38 |     await expect(page.getByLabel(/Código da Sala/i)).toHaveValue('');
  39 |     await expect(page.getByLabel(/Código da Sala/i)).toBeEnabled();
  40 |   });
  41 | });
  42 | 
```