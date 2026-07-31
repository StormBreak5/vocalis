# Contract: update_session_status

## Definição SQL única

```sql
public.update_session_status(p_session_id uuid, p_new_status text)
RETURNS TABLE (id uuid, status text, changed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`; target aceita somente active ou paused. A função nunca aceita closed.

## Identidade, autorização e locking

`auth.uid()` obrigatório. Seleciona Session por id e host_id e bloqueia `FOR UPDATE`. Missing/non-owner/Participant/outro Host usa `SESSION_NOT_FOUND_OR_FORBIDDEN`. Closed retorna `SESSION_CLOSED`.

Active→paused e paused→active retornam changed=true. Active→active e paused→paused retornam changed=false sem UPDATE. Target closed/outro retorna `INVALID_STATUS_TRANSITION`. `closed_at` permanece null.

## Cardinalidade SQL e DTO singular

O SQL `RETURNS TABLE` é set-oriented; o resultado lógico é exatamente uma linha `{id,status,changed}`. O Supabase retorna array. A action entrega `data: unknown` e o schema específico a `src/application/shared/expect-single-rpc-row.ts`; zero/múltiplas linhas geram `RPC_RESULT_CARDINALITY`, linha inválida gera `RPC_RESULT_INVALID`. Campos só são acessados após a normalização, sem `any` ou cast direto.
## ACL, Realtime e testes

```sql
ALTER FUNCTION public.update_session_status(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_session_status(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_status(uuid,text) TO authenticated;
```

Qualification total; sem EXECUTE para role anon. Uma mudança real emite Session UPDATE; idempotência não emite.

`003_session_writers.sql` cobre assinatura/DTO/pg_proc/ACL, autorização, transições, target closed e Session closed. `src/application/shared/__tests__/expect-single-rpc-row.test.ts` e `src/application/__tests__/session-status-writers.test.ts` cobrem cardinalidade/schema e DTO singular. O harness cobre close×pause e close×resume nas duas ordens.
