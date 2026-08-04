import { writeFile } from 'node:fs/promises';
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  closedDialogHeading,
  confirmSessionClosure,
  createSession,
  joinSession,
} from './helpers/session';

const SAMPLE_COUNT = 20;
const WARMUP_SAMPLE_COUNT = 3;
const P95_LIMIT_MS = 2_000;
const evidencePath =
  'specs/003-close-session/validation/realtime-p95/automated-local.json';

function nearestRankP95(samples: number[]) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil(0.95 * ordered.length) - 1];
}

async function joinParticipants(
  pages: Page[],
  code: string,
  participantLabel: string,
) {
  for (let index = 0; index < pages.length; index += 1) {
    await joinSession(
      pages[index],
      code,
      participantLabel + ' ' + (index + 1),
    );
  }
}

async function measureClosureDelivery(
  browser: Browser,
  participantCount: number,
  participantLabel: string,
) {
  const hostContext = await browser.newContext();
  const participantContexts: BrowserContext[] = [];

  try {
    const hostPage = await hostContext.newPage();
    const code = await createSession(hostPage);

    const participantPages: Page[] = [];
    for (let index = 0; index < participantCount; index += 1) {
      const context = await browser.newContext();
      participantContexts.push(context);
      participantPages.push(await context.newPage());
    }

    await joinParticipants(participantPages, code, participantLabel);

    // A assinatura faz parte da preparação, não da métrica observada.
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
    await expect(closedDialogHeading(hostPage)).toBeVisible({ timeout: 10_000 });
    const startedAt = await commitConfirmedAt;
    const deliveryResults = await Promise.allSettled(deliveries);
    const failures = deliveryResults.filter((result) => result.status === 'rejected');
    expect(
      failures,
      failures.length + ' entregas Realtime não chegaram.',
    ).toHaveLength(0);

    return deliveryResults.flatMap((result) =>
      result.status === 'fulfilled'
        ? [Math.max(0, result.value - startedAt)]
        : [],
    );
  } finally {
    await Promise.allSettled(participantContexts.map((context) => context.close()));
    await hostContext.close().catch(() => undefined);
  }
}

test.describe('Realtime propagation of Session Closure', () => {
  test('@performance entrega closed sem reload em exatamente 20 observações', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Métrica oficial executada em Chromium.');
    test.setTimeout(180_000);

    const warmupSamples = await measureClosureDelivery(
      browser,
      WARMUP_SAMPLE_COUNT,
      'Participante Aquecimento',
    );
    expect(warmupSamples).toHaveLength(WARMUP_SAMPLE_COUNT);

    const latencies = await measureClosureDelivery(
      browser,
      SAMPLE_COUNT,
      'Participante Métrica',
    );
    expect(latencies).toHaveLength(SAMPLE_COUNT);

    const ordered = [...latencies].sort((left, right) => left - right);
    const p95 = nearestRankP95(latencies);
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
        warmupSamples: WARMUP_SAMPLE_COUNT,
      },
      warmup: {
        samples: warmupSamples,
        discarded: true,
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
      verdict: p95 <= P95_LIMIT_MS ? 'pass' : 'fail',
      measuredAt: new Date().toISOString(),
    };

    await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    expect(
      p95,
      `p95 Realtime ${p95}ms excedeu o limite de ${P95_LIMIT_MS}ms; amostras: ${latencies.join(', ')}`,
    ).toBeLessThanOrEqual(P95_LIMIT_MS);
  });
});
