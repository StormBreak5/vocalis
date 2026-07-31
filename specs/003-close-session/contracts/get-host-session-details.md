# Contract: get_host_session_details

## Definição SQL única

```sql
public.get_host_session_details(p_session_id uuid)
RETURNS TABLE (
  id uuid, code text, status text, closed_at timestamptz,
  created_at timestamptz, max_participants smallint, max_queue_entries smallint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Esta função é criada na migration 016 junto do cutover de leitura. Owner `postgres`; sem overload por código.

## Identidade e autorização

`auth.uid()` obrigatório. Retorna somente a Session em que `id=p_session_id AND host_id=auth.uid()`. Missing/non-owner/Participant/outro Host usa `SESSION_NOT_FOUND_OR_FORBIDDEN`; null usa `AUTH_REQUIRED`. Não recebe host_id e não bloqueia a linha porque é leitura STABLE.

## DTO e exposição

Retorna exatamente sete campos. Nunca retorna `host_id`, auth data, tokens, Participant, Queue, row type completo ou futuras colunas.

## ACL e erros

```sql
ALTER FUNCTION public.get_host_session_details(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_host_session_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_host_session_details(uuid) TO authenticated;
```

Erros: `AUTH_REQUIRED`, `SESSION_NOT_FOUND_OR_FORBIDDEN`, `UNKNOWN`. Leitura de active, paused e closed pelo owner é permitida. A operação é naturalmente idempotente: repetições não mutam dados nem emitem Realtime e retornam o mesmo snapshot enquanto o banco não mudar.

## Testes

`003_sessions_rls.sql` e `003_session_privileges.sql` cobrem owner nos três estados, negativas, DTO, pg_proc/ACL, ausência de overload e impossibilidade de obter detalhes completos por SELECT direto.
