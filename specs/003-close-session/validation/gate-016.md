# Validation: Gate pós-016

**Task**: T052

## Comandos SQL obrigatórios

| Arquivo | Testes | Resultado |
|---------|--------|-----------|
| `003_session_privileges.sql` (ramo pós-016) | 13 | ✅ PASS |
| `003_sessions_rls.sql` | 15 | ✅ PASS |
| `003_participants_rls.sql` | 9 | ✅ PASS |
| `003_queue_rls.sql` | 10 | ✅ PASS |
| **Total SQL** | **47** | **✅ PASS** |

> Nota: `003_sessions_rls.sql` tinha plano declarado como `plan(14)` mas executava 15 asserções. Corrigido para `plan(15)` durante o gate.

## Vitest Realtime (obrigatório T052)

```
 ✓ src/infrastructure/realtime/session-realtime.integration.test.ts (17 tests) 11ms

 Test Files  1 passed (1)
      Tests  17 passed (17)
```

✅ 17 testes PASS — envelope UPDATE/sessions válido, new exato 4 colunas, old parcial, rejeição de host_id/coluna extra, schema/table/eventType incorretos, incoerência closed/closed_at, isolamento cross-session.

## Evidências de pg_policies, grants, envelope/projeção e isolamento

- `sessions_select_owned_or_member` presente, sem policies legadas residuais ✅
- Sem predicado `true` em policies ✅
- `host_id` proibido para `authenticated` ✅
- `id, code, status, closed_at` concedidas para `authenticated` ✅
- `sessions` em publication `supabase_realtime` ✅
- Host lê active/paused/closed (3) ✅
- Membro lê active/paused/closed (3) ✅
- Externo não lê nenhuma sessão (0) ✅
- UUID/código conhecido não amplia acesso externo ✅

## Resultado Final

✅ **Gate pós-016 VERDE — US1 (MVP) liberado. Continuar com T053 (CloseSessionButton).**
