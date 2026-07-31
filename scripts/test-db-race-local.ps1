$ErrorActionPreference = 'Stop'
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$envLines = & npx --no-install supabase status -o env 2>$null
$statusExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousPreference
if ($statusExitCode -ne 0) { throw 'Supabase local indisponível.' }
$dbLine = $envLines | Where-Object { $_ -match '^(DB_URL|POSTGRES_URL)=' } | Select-Object -First 1
if (-not $dbLine) { throw 'URL do banco local não encontrada.' }
$dbUrl = ($dbLine -split '=', 2)[1].Trim('"')
$parsed = [Uri]$dbUrl
if ($parsed.Scheme -notin @('postgres', 'postgresql') -or $parsed.Host -notin @('localhost', '127.0.0.1')) {
  throw 'Banco remoto rejeitado pelo harness.'
}
try {
  $env:SUPABASE_TEST_DB_URL = $dbUrl
  & npx vitest run src/infrastructure/__tests__/supabase/postgres-race-harness.test.ts src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'Harness de concorrência falhou.' }
} finally {
  Remove-Item Env:SUPABASE_TEST_DB_URL -ErrorAction SilentlyContinue
}
