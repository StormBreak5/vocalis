# Quickstart: Encerramento de Sessao

**Status da Funcionalidade**: Concluída (Feature `003-close-session` incorporou a lógica definitiva de RLS, transactions e Session Lifecycle).
A stack técnica local roda no Supabase, devendo atuar com scripts de migrações em `supabase/migrations/` (focados no isolamento via Realtime fail-closed) e tests pgTAP.

## 1. Preflight da feature e da CLI

Confirme branch, feature pointer e diretorio antes de alterar artefatos:

```powershell
git branch --show-current
Get-Content .specify/feature.json
powershell -ExecutionPolicy Bypass -File .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
```

A Supabase CLI aprovada e a devDependency exata `2.106.0`. O preflight nao modifica estado:

```powershell
npx --no-install supabase --version
npx --no-install supabase migration --help
npx --no-install supabase migration up --help
npx --no-install supabase migration list --help
npx --no-install supabase db reset --help
npx --no-install supabase test db --help
npx --no-install supabase gen types --help
```

Ausencia, versao divergente ou comando indisponivel interrompe o fluxo.

## 2. Iniciar somente o Supabase local

```powershell
npx --no-install supabase start
npx --no-install supabase status -o env
```

Valide Database, Auth e Realtime e aceite somente host `localhost` ou `127.0.0.1`. Nao copie, imprima nem persista credenciais. O harness deve obter e consumir `SUPABASE_TEST_DB_URL` no mesmo processo que inicia o Vitest e abortar para qualquer host remoto.

## 3. Construir as adaptacoes sem publicar

Crie os arquivos planejados, incluindo os consumidores de `join_session`, `create_queue_entry`, `cancel_queue_entry`, `update_queue_status`, `update_session_status` e `close_session`, o helper de cardinalidade, o lifecycle e os testes. Nao publique a versao e nao execute typecheck global dos consumidores de RPC nova enquanto o schema gerado ainda for historico.

## 4. Criar e aplicar a migration 015 atomica

Crie `supabase/migrations/20260729100000_015_session_closure_atomic.sql` como uma unica transaction. Ela inclui integridade, trigger terminal, todos os writers, `close_session`, locks Session-first e os REVOKEs:

```sql
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.participants FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.queue FROM PUBLIC, anon, authenticated;
```

Aplique e confira a historia local:

```powershell
npx --no-install supabase migration up --local
npx --no-install supabase migration list --local
```

## 5. Gerar tipos pos-015 em UTF-8 sem BOM

Use PowerShell 5.1 sem redirecionamento simples:

```powershell
$generated = (& npx --no-install supabase gen types typescript --local --schema public | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar tipos Supabase.' }
$target = Join-Path (Get-Location) 'src/infrastructure/supabase/database.types.ts'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $generated, $utf8NoBom)
$bytes = [System.IO.File]::ReadAllBytes($target)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { throw 'BOM UTF-8 inesperado.' }
```

Confirme nos tipos os writers e `close_session` antes de compilar os consumidores.

## 6. Gate SQL pos-015 e aplicacao

Execute estes arquivos, nesta ordem:

```powershell
npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local
npx --no-install supabase test db supabase/tests/003_session_writers.sql --local
npx --no-install supabase test db supabase/tests/003_close_session.sql --local
npx --no-install supabase test db supabase/tests/003_session_concurrency.sql --local
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
```

Depois execute o harness deterministico e as verificacoes da aplicacao:

```powershell
npm run test:db:race
npm run typecheck
npx vitest run
```

A 016 e proibida enquanto qualquer verificacao falhar.

## 7. Criar e aplicar a migration 016

Crie `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql` com DROP das policies legadas, policies finais, REVOKE SELECT amplo, grants minimos por coluna, `get_host_session_details` e publication Realtime. Aplique e confira:

```powershell
npx --no-install supabase migration up --local
npx --no-install supabase migration list --local
```

Gere novamente `src/infrastructure/supabase/database.types.ts` repetindo literalmente o bloco PowerShell 5.1 da secao 5. Confirme `get_host_session_details` e o schema final antes dos testes TypeScript dependentes da 016.

## 8. Gate RLS, Realtime, integracao e E2E

Execute os testes SQL finais com caminhos completos:

```powershell
npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local
npx --no-install supabase test db supabase/tests/003_session_writers.sql --local
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
npx --no-install supabase test db supabase/tests/003_sessions_rls.sql --local
npx --no-install supabase test db supabase/tests/003_participants_rls.sql --local
npx --no-install supabase test db supabase/tests/003_queue_rls.sql --local
npx --no-install supabase test db supabase/tests/003_close_session.sql --local
npx --no-install supabase test db supabase/tests/003_session_concurrency.sql --local
```

Valide a assinatura Realtime UPDATE/public/sessions, a projecao `id/code/status/closed_at`, o envelope completo, a ausencia de `host_id` em `new`, RLS e isolamento. Depois execute:

```powershell
npm run test:db:race
npx vitest run
npm run test:e2e
```

Os E2E incluem Host e dois participantes, cancelamento da confirmacao sem qualquer RPC, p95 de 20 entregas, Slow 3G, recovery e navegacao para `/` em ate cinco segundos.

## 9. Qualidade final

```powershell
npm run lint
npm run typecheck
npm run build
```

Use `supabase db reset --local` somente para validacao final em banco limpo ou recuperacao controlada. Depois do reset, repita migrations, geracao final de tipos, os oito testes SQL, harness, Vitest, integracao/E2E, lint, typecheck e build.

## 10. Primeira publicacao

Somente depois de todos os passos anteriores verdes a versao pode ser publicada. A ordem operacional unica e:

1. construir e adaptar a aplicacao;
2. aplicar 015 no ambiente controlado;
3. gerar tipos;
4. executar testes SQL;
5. executar typecheck e testes da aplicacao;
6. aplicar 016;
7. gerar tipos finais;
8. executar RLS, Realtime, integracao e E2E;
9. executar lint e build;
10. autorizar a primeira publicacao desta versao.

Nenhuma etapa deste quickstart publica ou implanta externamente por conta propria.
