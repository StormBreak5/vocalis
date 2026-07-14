import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

describe('DB RPC: create_queue_entry', () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  let sessionId: string;
  let participantTokens: { id: string; email: string; token: string }[] = [];

  beforeAll(async () => {
    // 1. Create a host user
    const hostEmail = `host_${Date.now()}@test.com`;
    const { data: hostAuth, error: createHostError } = await supabase.auth.admin.createUser({
      email: hostEmail, password: 'password123', email_confirm: true,
    });
    if (createHostError) console.error('createHostError:', createHostError);
    const hostId = hostAuth.user!.id;

    // 2. Create session
    const { data: sessionData } = await supabase.rpc('create_session', { p_host_id: hostId });
    sessionId = sessionData.id;
    const sessionCode = sessionData.code;

    // 3. Create a couple of anonymous participants via API
    for (let i = 0; i < 2; i++) {
      const email = `participant_${i}_${Date.now()}@test.com`;
      const { data: authData } = await supabase.auth.admin.createUser({
        email,
        password: 'password123',
        email_confirm: true,
      });

      // Login to get token
      const { data: loginData } = await supabase.auth.signInWithPassword({
        email,
        password: 'password123',
      });

      const token = loginData.session!.access_token;
      
      // Join session using the participant's client
      const participantClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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
    await supabase.from('sessions').delete().eq('id', sessionId);
  });

  it('allows a participant to request a song and auto-assigns position 1', async () => {
    const p1 = participantTokens[0];
    const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { data, error } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: 'Evidências',
      p_artist: 'Chitãozinho & Xororó',
    });

    expect(error).toBeNull();
    expect(data.position).toBe(1);
    expect(data.status).toBe('pending');
    expect(data.participant_id).toBe(p1.id);
  });

  it('rejects if the participant tries to request another song while the first is pending', async () => {
    const p1 = participantTokens[0];
    const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { data, error } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: 'Bohemian Rhapsody',
      p_artist: 'Queen',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('ACTIVE_SONG_EXISTS');
  });

  it('assigns position 2 to the second participant', async () => {
    const p2 = participantTokens[1];
    const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${p2.token}` } }
    });

    const { data, error } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: 'Wonderwall',
      p_artist: 'Oasis',
    });

    expect(error).toBeNull();
    expect(data.position).toBe(2);
  });
});
