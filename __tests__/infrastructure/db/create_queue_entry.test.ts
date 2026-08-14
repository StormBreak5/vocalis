import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseIntegrationClient } from '../supabase-integration-client';

const integrationEnabled = process.env.RUN_SUPABASE_INTEGRATION === 'true';
const createIntegrationAdminClient = (url: string, key: string) => createClient(url, key);

describe.skipIf(!integrationEnabled)('DB RPC: create_queue_entry', () => {
  let supabase: ReturnType<typeof createIntegrationAdminClient>;
  let supabaseUrl: string;
  let anonKey: string;
  let sessionId: string;
  const participantTokens: { id: string; email: string; token: string }[] = [];

  beforeAll(async () => {
    const integration = createSupabaseIntegrationClient(process.env, createIntegrationAdminClient);
    if (!integration) {
      throw new Error('Integração Supabase não foi ativada.');
    }
    supabase = integration.client;
    supabaseUrl = integration.supabaseUrl;
    anonKey = integration.anonKey;

    // 1. Create a host user
    const hostEmail = `host_${Date.now()}@test.com`;
    const { error: createHostError } = await supabase.auth.admin.createUser({
      email: hostEmail, password: 'password123', email_confirm: true,
    });
    if (createHostError) console.error('createHostError:', createHostError);
    const { data: hostLoginData } = await createClient(supabaseUrl, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({
      email: hostEmail,
      password: 'password123',
    });
    const hostClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${hostLoginData.session!.access_token}` } }
    });

    // 2. Create session (ownership is derived from the caller's auth.uid())
    const { data: sessionData, error: sessionError } = await hostClient.rpc('create_session');
    if (!sessionData) {
      throw new Error('create_session não retornou uma sessão: ' + JSON.stringify(sessionError));
    }
    sessionId = sessionData.id;
    const sessionCode = sessionData.code;

    // 3. Create a couple of anonymous participants via API
    for (let i = 0; i < 2; i++) {
      const email = `participant_${i}_${Date.now()}@test.com`;
      await supabase.auth.admin.createUser({
        email,
        password: 'password123',
        email_confirm: true,
      });

      // Login to get token
      const { data: loginData } = await createClient(supabaseUrl, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({
        email,
        password: 'password123',
      });

      const token = loginData.session!.access_token;
      
      // Join session using the participant's client
      const participantClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });

      const { data: joinData, error: joinError } = await participantClient.rpc('join_session', {
        p_code: sessionCode,
        p_display_name: `Cantor ${i}`,
      });

      if (joinError || !joinData) {
        throw new Error(`Failed to join session: ${joinError?.message || 'Unknown error'}`);
      }

      participantTokens.push({ id: joinData.participant.id, email, token });
    }
  });

  afterAll(async () => {
    if (!supabase || !sessionId) return;
    await supabase.from('sessions').delete().eq('id', sessionId);
  });

  it('allows a participant to request a song and auto-assigns position 1', async () => {
    const p1 = participantTokens[0];
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { data: rows, error } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: 'Evidências',
      p_artist: 'Chitãozinho & Xororó',
    });

    const data = Array.isArray(rows) ? rows[0] : rows;
    expect(error).toBeNull();
    expect(data.position).toBe(1);
    expect(data.status).toBe('pending');
    expect(data.participant_id).toBe(p1.id);
  });

  it('rejects if the participant tries to request another song while the first is pending', async () => {
    const p1 = participantTokens[0];
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { error } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: 'Bohemian Rhapsody',
      p_artist: 'Queen',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('ACTIVE_SONG_EXISTS');
  });

  it('assigns position 2 to the second participant', async () => {
    const p2 = participantTokens[1];
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${p2.token}` } }
    });

    const { data: rows, error } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: 'Wonderwall',
      p_artist: 'Oasis',
    });

    const data = Array.isArray(rows) ? rows[0] : rows;
    expect(error).toBeNull();
    expect(data.position).toBe(2);
  });
});
