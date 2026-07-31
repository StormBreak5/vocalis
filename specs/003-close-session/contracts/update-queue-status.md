# Contract: update_queue_status

## Definição SQL única

```sql
public.update_queue_status(p_queue_id uuid, p_new_status text)
RETURNS TABLE (id uuid, status text, updated_at timestamptz, changed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`; Queue determina session_id; cliente não envia Session ou Host.

## Identidade, autorização e locking

`auth.uid()` é obrigatório. A função lê session_id imutável sem lock, bloqueia a Session pertencente ao Host, rejeita closed e depois bloqueia Queue. Missing/non-owner/cross-session retorna `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN`. Somente Host proprietário executa.

## Transições

- pending → preparing ou cancelled;
- preparing → singing ou cancelled;
- singing → completed ou cancelled;
- completed/cancelled são terminais;
- mesmo status válido retorna `changed=false`, preserva updated_at e não executa UPDATE;
- demais casos retornam `INVALID_STATUS_TRANSITION`.

Closed sempre retorna `SESSION_CLOSED`, sem mutação/evento.

## Cardinalidade SQL e DTO singular

O SQL `RETURNS TABLE` é set-oriented; o resultado lógico é exatamente uma linha `{id,status,updated_at,changed}`. O Supabase retorna array. A action usa `src/application/shared/expect-single-rpc-row.ts` com `data: unknown` e schema específico antes de acessar campos. Zero/múltiplas linhas geram `RPC_RESULT_CARDINALITY`; linha inválida gera `RPC_RESULT_INVALID`. Não há `any` nem cast array→objeto.
## ACL e erros

```sql
ALTER FUNCTION public.update_queue_status(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_queue_status(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_queue_status(uuid,text) TO authenticated;
```

Qualification total; sem EXECUTE para role anon. Erros: `AUTH_REQUIRED`, `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN`, `SESSION_CLOSED`, `INVALID_STATUS_TRANSITION`, `UNKNOWN`.

## Testes

`003_session_writers.sql` cobre assinatura, DTO, pg_proc/ACL, autorização, transições, idempotência e closed. `src/application/shared/__tests__/expect-single-rpc-row.test.ts` e `src/application/__tests__/session-status-writers.test.ts` cobrem cardinalidade/schema e DTO singular. O harness cobre close×update_queue_status nas duas ordens.
