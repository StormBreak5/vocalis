import { Client } from 'pg';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

export function assertLoopbackDatabaseUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('SUPABASE_TEST_DB_URL deve usar PostgreSQL.');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('Testes de concorrência recusam bancos remotos.');
  }
  return parsed;
}

export type RaceHarness = {
  txA: Client;
  txB: Client;
  observer: Client;
  waitUntilBlocked(blockedPid: number, blockerPid: number): Promise<void>;
  close(): Promise<void>;
};

export async function createPostgresRaceHarness(
  rawUrl = process.env.SUPABASE_TEST_DB_URL,
  timeoutMs = 5_000,
): Promise<RaceHarness> {
  if (!rawUrl) throw new Error('SUPABASE_TEST_DB_URL não definida.');
  const databaseUrl = assertLoopbackDatabaseUrl(rawUrl).toString();
  const clients = [new Client({ connectionString: databaseUrl }), new Client({ connectionString: databaseUrl }), new Client({ connectionString: databaseUrl })];
  await Promise.all(clients.map((client) => client.connect()));
  const [txA, txB, observer] = clients;

  return {
    txA,
    txB,
    observer,
    async waitUntilBlocked(blockedPid, blockerPid) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const result = await observer.query<{ blockers: number[] }>(
          'select pg_blocking_pids($1)::int[] as blockers',
          [blockedPid],
        );
        if (result.rows[0]?.blockers.includes(blockerPid)) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`Barreira não observou PID ${blockedPid} bloqueado por ${blockerPid}.`);
    },
    async close() {
      await Promise.allSettled(clients.map(async (client) => {
        try { await client.query('rollback'); } catch { /* sem transação ativa */ }
        await client.end();
      }));
    },
  };
}

export async function setAuthenticatedUser(client: Client, userId: string): Promise<void> {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
  await client.query(`set local role authenticated`);
}
