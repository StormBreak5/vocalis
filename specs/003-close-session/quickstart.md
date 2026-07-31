# Quickstart: Encerramento de Sessão

Este guia valida a implementação futura exclusivamente contra o Supabase local ou ambiente representativo autorizado. Nunca execute os testes contra produção.

## 1. Selecionar a feature

```powershell
git branch --show-current
Get-Content .specify/feature.json
.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
```

Esperado: branch `003-close-session`, pointer `specs/003-close-session` e FEATURE_DIR com o mesmo caminho.

## 2. CLI e preflight não mutável

Fixar `supabase@2.106.0` como devDependency durante implementação. Antes de alterar banco:

```powershell
npx --no-install supabase --version
npx --no-install supabase migration --help
npx --no-install supabase migration up --help
npx --no-install supabase migration list --help
npx --no-install supabase db reset --help
npx --no-install supabase test db --help
npx --no-install supabase gen types --help
```

Ausência, versão diferente ou comando indisponível interrompe o fluxo.

## 3. Stack local

```powershell
npx --no-install supabase start
npx --no-install supabase status -o env
```

Confirme Database/Auth/Realtime locais e DB host localhost ou 127.0.0.1. Não copie, imprima ou persista credenciais.

## 4. Migration corretiva 015

Crie integralmente `supabase/migrations/20260729100000_015_session_closure_atomic.sql`. A baseline 001–014 permanece imutável. A 015 deve conter, numa transaction, preflight, schema/trigger/constraint, DROP exato das duas assinaturas com retorno alterado, todos os writers, close_session, locks e revokes de escrita.

Aplicar e verificar:

```powershell
npx --no-install supabase migration up --local
npx --no-install supabase migration list --local
```

Confirme timestamp `20260729100000`.

### Gerar tipos pós-015 em UTF-8 sem BOM

```powershell
$generated = (& npx --no-install supabase gen types typescript --local --schema public | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar tipos Supabase.' }
$target = Join-Path (Get-Location) 'src/infrastructure/supabase/database.types.ts'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $generated, $utf8NoBom)
$bytes = [System.IO.File]::ReadAllBytes($target)
if ($bytes.Length -ge 2 -and (($bytes[0] -eq 255 -and $bytes[1] -eq 254) -or ($bytes[0] -eq 254 -and $bytes[1] -eq 255))) { throw 'Encoding UTF-16 proibido.' }
if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) { throw 'BOM UTF-8 proibido.' }
npm run typecheck
```

Confirme join/create/cancel, update_queue_status, update_session_status e close_session nos tipos.

### Gate pós-015

```powershell
npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local
npx --no-install supabase test db supabase/tests/003_session_writers.sql --local
npx --no-install supabase test db supabase/tests/003_close_session.sql --local
npx --no-install supabase test db supabase/tests/003_session_concurrency.sql --local
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
npm run test:db:race
```

Esperado: invariantes, writers, write ACL, close, reabertura, timestamp, um close + 19 retries e todas as corridas passam. Neste estágio, `003_session_privileges.sql` executa somente seu ramo DML/EXECUTE/terminalidade; as asserções finais de SELECT são ativadas depois que 016 criar `get_host_session_details(uuid)`. Não avance à 016 com falha.

## 5. Migration 016 de leitura/RLS/Realtime

Crie integralmente `supabase/migrations/20260729101000_016_session_closure_rls_realtime.sql` com helpers, DROP das policies legadas, REVOKE SELECT, grants mínimos, policies finais, get_host_session_details, publication e reload.

```powershell
npx --no-install supabase migration up --local
npx --no-install supabase migration list --local
```

Confirme timestamp `20260729101000` e repita a geração UTF-8 sem BOM da seção anterior. Agora `get_host_session_details` também deve aparecer nos tipos.

### Gate pós-016

```powershell
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
npx --no-install supabase test db supabase/tests/003_sessions_rls.sql --local
npx --no-install supabase test db supabase/tests/003_participants_rls.sql --local
npx --no-install supabase test db supabase/tests/003_queue_rls.sql --local
npx vitest run src/infrastructure/__tests__/session-realtime.integration.test.ts
npm run typecheck
```

Esperado: policies antigas ausentes, conjunto final exato, grants por coluna, SELECTs proibidos, Host/member/external isolados e evento Session autorizado.

## 6. Harness de concorrência

`npm run test:db:race` chama `scripts/test-db-race-local.ps1`. No mesmo processo, o wrapper:

1. obtém `supabase status -o env`;
2. extrai DB_URL em memória;
3. rejeita host não loopback/TLS/produção;
4. define `SUPABASE_TEST_DB_URL` somente no Vitest filho;
5. espera o resultado;
6. remove a variável e fecha connections em finally.

Cada corrida usa txA, txB e observer; nenhuma ordem depende de sleep. Execute ambos os commit orders para close×close/join/create/cancel/pause/resume/update-queue. Separadamente, execute uma primeira close e 19 retries sequenciais.

## 7. Validação funcional

1. Host cria Session e dois Participants entram.
2. Host fecha active e paused em cenários separados.
3. Todos recebem o modal sem refresh.
4. Escape, outside click e ausência de X são verificados.
5. Join/create/cancel/update/pause-resume falham após closed.
6. Refresh, deep link, evento perdido, reconnect, token refresh e BFCache recuperam closed.
7. Voltar limpa somente a sala e navega para `/`.
8. Participant/Queue/status/position permanecem no banco.

## 8. Métricas

### Realtime

Observar exatamente 20 entregas, do commit confirmado ao modal. Calcular nearest-rank p95 e exigir ≤2 s. Registrar navegador/versão, região, viewport mobile, perfil estável e ambiente. O teste local é diagnóstico; repetir em ambiente representativo não produtivo.

### Rede lenta

Chromium, viewport 390×844, Slow 3G controlado (400 Kbps down, 200 Kbps up, RTT 400 ms), timeout de incerteza 8 s. Validar loading imediato, disabled, nenhum sucesso/modal antecipado, mensagem incerta, writes bloqueados, resync e retry único.

### Navegação

Em Chromium estável, viewport 390×844, Supabase local e rede loopback sem throttling, iniciar o cronômetro no clique “Voltar para o início”; URL `/` deve concluir em até 5 s. Registrar versão, região local e perfil; a medição começa no clique e não depende da entrega Realtime.

## 9. Gate final

```powershell
npx --no-install supabase db reset --local
npx --no-install supabase migration list --local
npm run test:db:race
npx vitest run
npm run test:e2e
npm run lint
npm run typecheck
npm run build
```

Após o reset, execute também a matriz SQL final concreta:

```powershell
npx --no-install supabase test db supabase/tests/003_session_closure_invariants.sql --local
npx --no-install supabase test db supabase/tests/003_session_writers.sql --local
npx --no-install supabase test db supabase/tests/003_close_session.sql --local
npx --no-install supabase test db supabase/tests/003_session_concurrency.sql --local
npx --no-install supabase test db supabase/tests/003_session_privileges.sql --local
npx --no-install supabase test db supabase/tests/003_sessions_rls.sql --local
npx --no-install supabase test db supabase/tests/003_participants_rls.sql --local
npx --no-install supabase test db supabase/tests/003_queue_rls.sql --local
```

Qualquer falha bloqueia conclusão.
