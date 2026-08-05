import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createContextSupabaseClient, createSession, joinSession, requestSong } from './helpers/session';
import { createClient } from '@supabase/supabase-js';

async function captureState(page: Page, name: string, testInfo: TestInfo) {
  const body = await page.screenshot();
  await testInfo.attach(name, { body, contentType: 'image/png' });
  const outputDirectory = process.env.PARTICIPANT_SCREENSHOT_DIR;
  if (outputDirectory) {
    await mkdir(outputDirectory, { recursive: true });
    const project = testInfo.project.name.toLowerCase().replace(/\s+/g, '-');
    await writeFile(resolve(outputDirectory, `${project}-${name}.png`), body);
  }
}

async function seedQueueEntry(code: string, displayName: string, songTitle: string, artist: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase local não configurado para o E2E.');
  const host = new URL(supabaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('O E2E visual exige Supabase local.');

  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: authError } = await client.auth.signInAnonymously();
  if (authError) throw new Error(`Falha ao autenticar participante fictício: ${authError.message}`);
  const { data: joinData, error: joinError } = await client.rpc('join_session', {
    p_code: code,
    p_display_name: displayName,
  });
  if (joinError) throw new Error(`Falha ao criar participante fictício: ${joinError.message}`);
  const sessionId = (joinData as { participant?: { session_id?: string } })?.participant?.session_id;
  if (!sessionId) throw new Error('Sessão local ausente no retorno de join_session.');
  const { error: queueError } = await client.rpc('create_queue_entry', {
    p_session_id: sessionId,
    p_song_title: songTitle,
    p_artist: artist,
  });
  if (queueError) throw new Error(`Falha ao criar pedido fictício: ${queueError.message}`);
}

test('visão Noite Neon Elegante cobre estados funcionais e visuais', async ({ browser }, testInfo) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const participantContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const requesterContext = await browser.newContext({ viewport: { width: 390, height: 844 } });

  try {
    const hostPage = await hostContext.newPage();
    const participantPage = await participantContext.newPage();
    const requesterPage = await requesterContext.newPage();
    const code = await createSession(hostPage);

    await seedQueueEntry(code, 'Diego Carvalho', 'Garota de Ipanema', 'Tom Jobim');
    await seedQueueEntry(code, 'Nina Souza', 'I Wanna Dance with Somebody', 'Whitney Houston');
    await joinSession(participantPage, code, 'Marina Costa');
    await requestSong(participantPage, 'Bohemian Rhapsody', 'Queen');
    await seedQueueEntry(code, 'Bruno Lima', 'O Nome da Música É Muito Longo e Precisa Quebrar Bem', 'Banda Exemplo');

    const hostClient = await createContextSupabaseClient(hostContext);
    const { data: queueEntries, error: queueError } = await hostClient
      .from('queue')
      .select('id, song_title');
    expect(queueError).toBeNull();
    const queueId = (songTitle: string) => {
      const id = queueEntries?.find((item) => item.song_title === songTitle)?.id;
      if (!id) throw new Error(`Pedido não encontrado no E2E: ${songTitle}`);
      return id;
    };
    await hostClient.rpc('update_queue_status', { p_queue_id: queueId('Garota de Ipanema'), p_new_status: 'preparing' });
    await hostClient.rpc('update_queue_status', { p_queue_id: queueId('Garota de Ipanema'), p_new_status: 'singing' });
    await hostClient.rpc('update_queue_status', {
      p_queue_id: queueId('I Wanna Dance with Somebody'),
      p_new_status: 'preparing',
    });

    await expect(participantPage.getByRole('heading', { name: 'Garota de Ipanema' })).toBeVisible();
    await expect(participantPage.getByText('Preparando')).toBeVisible();
    await expect(participantPage.getByText('Bohemian Rhapsody')).toBeVisible();
    await captureState(participantPage, 'participant-active-full-queue', testInfo);

    await joinSession(requesterPage, code, 'Carla Mendes');
    await requesterPage.getByRole('button', { name: 'Pedir música' }).click();
    await expect(requesterPage.getByRole('dialog', { name: 'Pedir música' })).toBeVisible();
    await expect(requesterPage.getByPlaceholder(/Ex: Evidências/i)).toBeFocused();
    await captureState(requesterPage, 'participant-request-sheet', testInfo);
    await requesterPage.getByRole('button', { name: /Fechar painel de pedido/i }).click();

    await hostPage.getByRole('button', { name: 'Pausar fila' }).click();
    await expect(participantPage.getByText(/DJ pausou novos pedidos/i)).toBeVisible();
    await expect(participantPage.getByRole('button', { name: /Pedidos pausados pelo DJ/i })).toBeDisabled();
    await captureState(participantPage, 'participant-paused', testInfo);

    await participantContext.setOffline(true);
    await expect(participantPage.getByText(/fila exibida pode estar desatualizada/i)).toBeVisible();
    await expect(participantPage.getByText('Offline', { exact: true })).toBeVisible();
    await captureState(participantPage, 'participant-offline', testInfo);
    await participantContext.setOffline(false);
  } finally {
    await Promise.all([
      hostContext.close(), participantContext.close(), requesterContext.close(),
    ]);
  }
});
