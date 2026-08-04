import { writeFile } from 'node:fs/promises';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  closedDialogHeading,
  confirmSessionClosure,
  createSession,
  joinSession,
} from './helpers/session';

const SAMPLE_COUNT = 20;
const P95_LIMIT_MS = 2_000;
const evidencePath =
  'specs/003-close-session/validation/realtime-p95/automated-local.json';

function nearestRankP95(samples: number[]) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil(0.95 * ordered.length) - 1];
}

async function joinParticipants(pages: Page[], code: string) {
  for (let index = 0; index < pages.length; index += 1) {
    await joinSession(
      pages[index],
      code,
      'Participante Métrica ' + (index + 1),
    );
  }
}

test.describe('Realtime propagation of Session Closure', () => {
  test('entrega closed sem reload em exatamente 20 observações', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Métrica oficial executada em Chromium.');
    test.setTimeout(180_000);

    const hostContext = await browser.newContext();
    const participantContexts: BrowserContext[] = [];

    try {
      const hostPage = await hostContext.newPage();
      const code = await createSession(hostPage);

      const participantPages: Page[] = [];
      for (let index = 0; index < SAMPLE_COUNT; index += 1) {
        const context = await browser.newContext();
        participantContexts.push(context);
        const participantPage = await context.newPage();
        participantPages.push(participantPage);
      }

      await joinParticipants(participantPages, code);

      // A preparação não faz parte da métrica: aguarda todos os canais concluírem a assinatura.
      await participantPages[0].waitForTimeout(3_000);

      const commitConfirmedAt = hostPage
        .waitForResponse((response) => {
          const request = response.request();
          return request.method() === 'POST'
            && Boolean(request.headers()['next-action']);
        })
        .then(() => Date.now());
      const deliveries = participantPages.map(async (participantPage) => {
        await closedDialogHeading(participantPage).waitFor({
          state: 'visible',
          timeout: 10_000,
        });
        return Date.now();
      });

      await confirmSessionClosure(hostPage);
      await expect(closedDialogHeading(hostPage)).toBeVisible({
        timeout: 10_000,
      });
      const startedAt = await commitConfirmedAt;
      const deliveryResults = await Promise.allSettled(deliveries);
      const failures = deliveryResults.filter(
        (result) => result.status === 'rejected',
      );
      expect(failures, failures.length + ' entregas Realtime não chegaram.').toHaveLength(0);
      const latencies = deliveryResults.flatMap((result) =>
        result.status === 'fulfilled'
          ? [Math.max(0, result.value - startedAt)]
          : [],
      );

      expect(latencies).toHaveLength(SAMPLE_COUNT);
      const p95 = nearestRankP95(latencies);
      expect(p95).toBeLessThanOrEqual(P95_LIMIT_MS);

      const ordered = [...latencies].sort((left, right) => left - right);
      const evidence = {
        metric: 'session_closed_realtime_delivery',
        unit: 'ms',
        environment: {
          browser: 'Chromium',
          viewport: 'mobile project viewport',
          network: 'loopback sem throttling',
          sessionCount: 1,
          participantCount: SAMPLE_COUNT,
          samples: SAMPLE_COUNT,
        },
        results: {
          samples: latencies,
          min: ordered[0],
          max: ordered.at(-1),
          p50: ordered[Math.ceil(0.5 * ordered.length) - 1],
          p95,
        },
        threshold: {
          p95MaxMs: P95_LIMIT_MS,
        },
        verdict: 'pass',
        measuredAt: new Date().toISOString(),
      };

      await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    } finally {
      await Promise.allSettled(
        participantContexts.map((context) => context.close()),
      );
      await hostContext.close().catch(() => undefined);
    }
  });
});