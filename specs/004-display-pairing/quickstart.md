# Quickstart: Pareamento de Telão

## 1. Preflight da feature e da CLI

```powershell
git branch --show-current
Get-Content .specify/feature.json
powershell -ExecutionPolicy Bypass -File .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
npx --no-install supabase --version
```

## 2. Iniciar somente o Supabase local

```powershell
npx --no-install supabase start
npx --no-install supabase status -o env
```

Aceite só `localhost`/`127.0.0.1`. Não copie, imprima nem persista credenciais.

## 3. Construir a aplicação sem publicar

Crie os tipos de domínio, Server Actions, queries, hooks (`useDisplayPairings`) e componentes (`DisplayPairingScreen`, `DjDisplayPairingPanel`) planejados em `plan.md`, junto com os testes de unidade correspondentes. Não publique a versão nem rode typecheck global contra os tipos gerados enquanto a migration `018` ainda não foi aplicada localmente.

## 4. Criar e aplicar a migration única

Crie `supabase/migrations/20260817120000_018_display_pairing.sql` como uma única transação (`BEGIN`/`COMMIT`), na ordem descrita em `plan.md`: tabelas `private.display_pairing_codes`, `public.display_pairings` → helpers `is_paired_display`/`is_paired_display_open` → DROP+CREATE das policies de `sessions`/`queue` → policy de `display_pairings` → cinco RPCs → publication Realtime → `NOTIFY pgrst, 'reload schema'`.

```powershell
npx --no-install supabase migration up --local
npx --no-install supabase migration list --local
```

## 5. Gerar tipos em UTF-8 sem BOM

```powershell
$generated = (& npx --no-install supabase gen types typescript --local --schema public | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar tipos Supabase.' }
$target = Join-Path (Get-Location) 'src/infrastructure/supabase/database.types.ts'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $generated, $utf8NoBom)
$bytes = [System.IO.File]::ReadAllBytes($target)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { throw 'BOM UTF-8 inesperado.' }
```

Confirme as cinco RPCs em `Database['public']['Functions']` antes de compilar os consumidores.

## 6. Gate SQL

```powershell
npx --no-install supabase test db supabase/tests/004_display_pairing_codes.sql --local
npx --no-install supabase test db supabase/tests/004_display_pairing_rls.sql --local
npx --no-install supabase test db supabase/tests/004_display_pairing_privileges.sql --local
```

O arquivo `004_display_pairing_privileges.sql` é o que prova SC-003: chama cada RPC de escrita existente do projeto (`create_queue_entry`, `cancel_queue_entry`, `update_queue_status`, `update_session_status`, `close_session`), mais as duas RPCs de escrita host-only desta feature (`generate_display_pairing_code`, `revoke_display_pairing`), com identidade de telão pareado, e espera recusa em todas.

## 7. Aplicação, tipos e testes de unidade

```powershell
npm run typecheck
npx vitest run
```

## 8. Verificação manual (equivalente ao SC-001)

1. Criar sessão como Host em uma aba (`npm run dev` local).
2. No painel do DJ, clicar "Parear telão" e anotar o código de 6 caracteres.
3. Em uma segunda aba anônima (ou navegador diferente), abrir `/sala/<código-da-sala>/display` — deve aparecer a tela de pareamento, não um redirect.
4. Digitar o código de pareamento — a aba deve passar a exibir o telão ao vivo.
5. Recarregar a segunda aba — o telão deve continuar aparecendo sem pedir o código de novo.
6. No painel do DJ, confirmar que a contagem de telões pareados subiu para 1.
7. Adicionar uma música na fila em uma terceira aba de participante — a atualização deve aparecer na aba do telão pareado em tempo real, sem recarregar.
8. Pausar a sessão no painel do DJ — a aba do telão deve refletir a pausa.
9. Revogar o telão no painel do DJ — a aba do telão deve, na próxima leitura/reconexão, deixar de exibir dados ao vivo.
10. Encerrar a sessão — qualquer telão ainda pareado deve exibir o estado de encerramento; recarregar não deve pedir pareamento novamente nem reabrir o telão ao vivo.

## 9. Qualidade final

```powershell
npm run lint
npm run typecheck
npm run build
```

Nenhuma etapa deste quickstart publica ou implanta externamente por conta própria.
