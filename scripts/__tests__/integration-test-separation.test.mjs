import { describe, expect, it, vi } from 'vitest';
import unitConfig from '../../vitest.unit.config.ts';
import { createSupabaseIntegrationClient } from '../../__tests__/infrastructure/supabase-integration-client.ts';
import { LOCAL_VITEST_SUITES } from '../supabase/run-vitest-local.mjs';

const DATABASE_INTEGRATION_TESTS = [
  '__tests__/infrastructure/db/create_queue_entry.test.ts',
  '__tests__/infrastructure/db/cancel_queue_entry.test.ts',
];

describe('separação entre testes unitários e de integração', () => {
  it('exclui a pasta aprovada de integração do gate unitário', () => {
    expect(unitConfig.test?.exclude).toContain(
      '**/__tests__/infrastructure/db/*.test.ts',
    );
  });

  it('mantém os dois testes de RPC no executor de integração', () => {
    expect(LOCAL_VITEST_SUITES.integration).toEqual(
      expect.arrayContaining(DATABASE_INTEGRATION_TESTS),
    );
  });

  it('não cria cliente quando a integração está desativada', () => {
    const clientFactory = vi.fn();

    expect(
      createSupabaseIntegrationClient(
        { RUN_SUPABASE_INTEGRATION: 'false' },
        clientFactory,
      ),
    ).toBeNull();
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('falha claramente quando a integração está ativa sem credenciais', () => {
    const clientFactory = vi.fn();

    expect(() =>
      createSupabaseIntegrationClient(
        { RUN_SUPABASE_INTEGRATION: 'true' },
        clientFactory,
      ),
    ).toThrow(
      'Integração Supabase ativada sem variáveis obrigatórias: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
    expect(clientFactory).not.toHaveBeenCalled();
  });
});