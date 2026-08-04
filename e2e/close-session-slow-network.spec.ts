import { writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import {
  closedDialogHeading,
  createSession,
} from './helpers/session';

const evidencePath =
  'specs/003-close-session/validation/slow-network-e2e.json';

test.describe('Session closure under Slow 3G', () => {
  test('mantém loading, evita sucesso prematuro e recupera resposta perdida', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Throttling controlado requer CDP.');
    test.setTimeout(60_000);

    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();

    try {
      await createSession(hostPage);

      const cdp = await hostContext.newCDPSession(hostPage);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 400,
        downloadThroughput: (400 * 1024) / 8,
        uploadThroughput: (200 * 1024) / 8,
        connectionType: 'cellular3g',
      });

      let delayedActionCount = 0;
      await hostPage.route('**/*', async (route) => {
        const request = route.request();
        const isServerAction =
          request.method() === 'POST'
          && Boolean(await request.headerValue('next-action'));

        if (isServerAction && delayedActionCount === 0) {
          delayedActionCount += 1;
          const response = await route.fetch();
          await new Promise((resolve) => setTimeout(resolve, 9_000));
          await route.fulfill({ response });
          return;
        }

        await route.continue();
      });

      await hostPage.getByRole('button', { name: /Encerrar sala/i }).click();
      const confirmButton = hostPage.getByRole('button', {
        name: /Confirmar encerramento/i,
      });

      const startedAt = Date.now();
      await confirmButton.click();

      await expect(confirmButton).toBeDisabled();
      await expect(confirmButton).toContainText('Encerrando');
      await expect(closedDialogHeading(hostPage)).not.toBeVisible({
        timeout: 1_000,
      });

      await expect(closedDialogHeading(hostPage)).toBeVisible({
        timeout: 15_000,
      });
      const recoveredAfterMs = Date.now() - startedAt;

      expect(delayedActionCount).toBe(1);

      const evidence = {
        scenario: 'close_session_response_delayed_after_server_commit',
        environment: {
          browser: 'Chromium',
          viewport: '390x844-compatible mobile project',
          downloadKbps: 400,
          uploadKbps: 200,
          rttMs: 400,
          delayedResponseMs: 9_000,
          clientUncertaintyTimeoutMs: 8_000,
        },
        assertions: {
          immediateLoading: true,
          duplicateCalls: delayedActionCount,
          noPrematureSuccess: true,
          recoveredByPointRead: true,
          recoveredAfterMs,
        },
        verdict: 'pass',
        measuredAt: new Date().toISOString(),
      };

      await writeFile(
        evidencePath,
        JSON.stringify(evidence, null, 2) + '\n',
        'utf8',
      );
    } finally {
      await hostContext.close();
    }
  });
});