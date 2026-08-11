import 'server-only';
import {
  resolveAppPublicUrl,
  type AppPublicUrlConfig,
  type AppRuntime,
} from './app-public-url';

function runtimeFromEnvironment(value: string | undefined): AppRuntime {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

export function getAppPublicUrl(): AppPublicUrlConfig {
  return resolveAppPublicUrl(process.env.APP_PUBLIC_URL, {
    runtime: runtimeFromEnvironment(process.env.NODE_ENV),
    controlledTestEnvironment: process.env.VOCALIS_E2E_CONTROLLED === '1',
  });
}
