import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [
        '**/__tests__/infrastructure/db/*.test.ts',
        'src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts',
        'src/infrastructure/__tests__/session-closure-preservation.integration.test.ts',
      ],
    },
  }),
);
