import { afterEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return import('@/src/infrastructure/config/app-public-url.server');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getAppPublicUrl (server) — fallback da Vercel', () => {
  it('usa VERCEL_PROJECT_PRODUCTION_URL quando APP_PUBLIC_URL está vazia', async () => {
    vi.stubEnv('APP_PUBLIC_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'vocalis.vercel.app');
    vi.stubEnv('NODE_ENV', 'production');
    const { getAppPublicUrl } = await load();
    expect(getAppPublicUrl()).toEqual({
      status: 'configured',
      baseUrl: 'https://vocalis.vercel.app',
    });
  });

  it('prefere APP_PUBLIC_URL explícita', async () => {
    vi.stubEnv('APP_PUBLIC_URL', 'https://karaoke.example');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'vocalis.vercel.app');
    const { getAppPublicUrl } = await load();
    expect(getAppPublicUrl()).toEqual({
      status: 'configured',
      baseUrl: 'https://karaoke.example',
    });
  });
});

describe('getMetadataBaseUrl', () => {
  it('cai para localhost quando nada está configurado', async () => {
    vi.stubEnv('APP_PUBLIC_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    const { getMetadataBaseUrl } = await load();
    expect(getMetadataBaseUrl().toString()).toBe('http://localhost:3000/');
  });

  it('usa a URL pública quando disponível', async () => {
    vi.stubEnv('APP_PUBLIC_URL', 'https://karaoke.example');
    const { getMetadataBaseUrl } = await load();
    expect(getMetadataBaseUrl().origin).toBe('https://karaoke.example');
  });
});
