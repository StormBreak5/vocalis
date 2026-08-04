const REQUIRED_ENVIRONMENT_VARIABLES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

type IntegrationEnvironment = Readonly<Record<string, string | undefined>>;

type IntegrationClient<TClient> = {
  client: TClient;
  supabaseUrl: string;
  anonKey: string;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function createSupabaseIntegrationClient<TClient>(
  environment: IntegrationEnvironment,
  clientFactory: (url: string, key: string) => TClient,
): IntegrationClient<TClient> | null {
  if (environment.RUN_SUPABASE_INTEGRATION !== 'true') {
    return null;
  }

  const missingVariables = REQUIRED_ENVIRONMENT_VARIABLES.filter(
    (name) => !environment[name]?.trim(),
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Integração Supabase ativada sem variáveis obrigatórias: ${missingVariables.join(', ')}.`,
    );
  }

  const supabaseUrl = environment.SUPABASE_URL!;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('SUPABASE_URL deve ser uma URL local válida.');
  }

  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error('SUPABASE_URL deve apontar exclusivamente para o Supabase local.');
  }

  return {
    client: clientFactory(supabaseUrl, environment.SUPABASE_SERVICE_ROLE_KEY!),
    supabaseUrl,
    anonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}