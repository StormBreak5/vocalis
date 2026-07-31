$ErrorActionPreference = "Stop"
npx --no-install supabase start
npx --no-install supabase db reset --local
npx --no-install supabase migration list --local
$generated = (& npx --no-install supabase gen types typescript --local --schema public | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar tipos Supabase.' }
$target = Join-Path (Get-Location) 'src/infrastructure/supabase/database.types.ts'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $generated, $utf8NoBom)
$bytes = [System.IO.File]::ReadAllBytes($target)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { throw 'BOM UTF-8 inesperado.' }
npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local
npx --no-install supabase test db supabase/tests/003_session_writers.sql --local
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
npx --no-install supabase test db supabase/tests/003_sessions_rls.sql --local
npx --no-install supabase test db supabase/tests/003_participants_rls.sql --local
npx --no-install supabase test db supabase/tests/003_queue_rls.sql --local
npx --no-install supabase test db supabase/tests/003_close_session.sql --local
npx --no-install supabase test db supabase/tests/003_session_concurrency.sql --local
npm run test:db:race
npx vitest run
npm run lint
npm run typecheck
npm run build
