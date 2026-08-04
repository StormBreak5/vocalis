import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseIntegrationClient } from '../supabase-integration-client';

const integrationEnabled = process.env.RUN_SUPABASE_INTEGRATION === 'true';
const createIntegrationAdminClient = (url: string, key: string) => createClient(url, key);

describe.skipIf(!integrationEnabled)('DB RPC: cancel_queue_entry', () => {
  let supabase: ReturnType<typeof createIntegrationAdminClient>;
  let supabaseUrl: string;
  let anonKey: string;
  let sessionId: string;
  let hostToken: string;
  const p1: { id: string; token: string; queueId: string } = { id: '', token: '', queueId: '' };

  beforeAll(async () => {
    const integration = createSupabaseIntegrationClient(process.env, createIntegrationAdminClient);
    if (!integration) {
      throw new Error('Integração Supabase não foi ativada.');
    }
    supabase = integration.client;
    supabaseUrl = integration.supabaseUrl;
    anonKey = integration.anonKey;

    // 1. Create a host user and session
    const hostEmail = `host_${Date.now()}@test.com`;
    const { data: hostAuth } = await supabase.auth.admin.createUser({
      email: hostEmail, password: 'password123', email_confirm: true,
    });
    const { data: hostLoginData } = await createClient(
      supabaseUrl,
      anonKey,
      { auth: { persistSession: false } },
    ).auth.signInWithPassword({ email: hostEmail, password: 'password123' });
    hostToken = hostLoginData.session!.access_token;

    const { data: sessionData } = await supabase.rpc('create_session', { p_host_id: hostAuth.user!.id });
    if (!sessionData) {
      throw new Error('create_session não retornou uma sessão.');
    }
    sessionId = sessionData.id;

    // 2. Create participant
    const email = `participant_${Date.now()}@test.com`;
    await supabase.auth.admin.createUser({ email, password: 'password123', email_confirm: true });
    const { data: loginData } = await createClient(supabaseUrl, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password: 'password123' });
    p1.token = loginData.session!.access_token;
    const participantClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { data: joinData } = await participantClient.rpc('join_session', { p_code: sessionData.code, p_display_name: 'Cantor 1' });
    p1.id = joinData.participant.id;

    // 3. Request a song
    const { data: queueRows } = await participantClient.rpc('create_queue_entry', {
      p_session_id: sessionId, p_song_title: 'Test Song', p_artist: 'Test Artist'
    });
    const queueData = Array.isArray(queueRows) ? queueRows[0] : queueRows;
    p1.queueId = queueData.id;
  });

  afterAll(async () => {
    if (!supabase || !sessionId) return;
    await supabase.from('sessions').delete().eq('id', sessionId);
  });

  it('allows the owner to cancel a pending song', async () => {
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { error } = await client.rpc('cancel_queue_entry', { p_queue_id: p1.queueId });
    if (error) console.error('Cancel Error:', error);
    expect(error).toBeNull();

    const { data, error: selectError } = await client.from('queue').select('status').eq('id', p1.queueId).single();
    if (selectError) console.error('Select Error:', selectError);
    expect(selectError).toBeNull();
    expect(data!.status).toBe('cancelled');
  });

  it('rejects cancellation of an already active song', async () => {
    // We create another one and force its status to singing
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { data: queueRows } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId, p_song_title: 'Another Song', p_artist: 'Artist'
    });

    const queueData = Array.isArray(queueRows) ? queueRows[0] : queueRows;
    const hostClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${hostToken}` } },
    });
    await hostClient.rpc('update_queue_status', {
      p_queue_id: queueData.id,
      p_new_status: 'preparing',
    });
    const { error: updateError } = await hostClient.rpc('update_queue_status', {
      p_queue_id: queueData.id,
      p_new_status: 'singing',
    });
    if (updateError) console.error('Update Error:', updateError);

    const { error } = await client.rpc('cancel_queue_entry', { p_queue_id: queueData.id });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('INVALID_STATUS_TRANSITION');
  });
});
