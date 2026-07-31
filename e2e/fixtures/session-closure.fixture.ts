import { test as base, type BrowserContext, type Page } from '@playwright/test';

type SessionClosurePages = {
  hostContext: BrowserContext;
  participantAContext: BrowserContext;
  participantBContext: BrowserContext;
  hostPage: Page;
  participantAPage: Page;
  participantBPage: Page;
};

export const test = base.extend<SessionClosurePages>({
  hostContext: async ({ browser }, use) => { const context = await browser.newContext(); await use(context); await context.close(); },
  participantAContext: async ({ browser }, use) => { const context = await browser.newContext(); await use(context); await context.close(); },
  participantBContext: async ({ browser }, use) => { const context = await browser.newContext(); await use(context); await context.close(); },
  hostPage: async ({ hostContext }, use) => use(await hostContext.newPage()),
  participantAPage: async ({ participantAContext }, use) => use(await participantAContext.newPage()),
  participantBPage: async ({ participantBContext }, use) => use(await participantBContext.newPage()),
});

export { expect } from '@playwright/test';
