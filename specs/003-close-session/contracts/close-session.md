# Contract: close_session

## Definição SQL única

```sql
public.close_session(p_session_id uuid)
RETURNS TABLE (session_id uuid, status text, closed_at timestamptz, changed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`; sem overload por code, host_id ou claims.

## Identidade, autorização e operação

Identidade somente por `auth.uid()`. Null retorna `AUTH_REQUIRED`. A função seleciona e bloqueia `public.sessions` onde `id=p_session_id AND host_id=auth.uid()`. Missing, outro Host, Participant e usuário sem vínculo retornam o mesmo `SESSION_NOT_FOUND_OR_FORBIDDEN`.

Active/paused atualiza status para closed e define `closed_at=clock_timestamp()` uma única vez. Closed retorna a linha original sem UPDATE. Participant e Queue nunca são tocados.

## Idempotência e concorrência

Primeira chamada: `changed=true`. Retry: `changed=false`, mesmo `closed_at`, nenhum evento adicional. Session é o primeiro e único lock. Corridas com writers são ordenadas pelo mesmo lock; close-first bloqueia a escrita, writer-first preserva o commit anterior.

## ACL

```sql
ALTER FUNCTION public.close_session(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.close_session(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_session(uuid) TO authenticated;
```

## Erros, Realtime e offline

`AUTH_REQUIRED`, `SESSION_NOT_FOUND_OR_FORBIDDEN`, `UNKNOWN`. Closed não é erro para esta função. changed=true produz um UPDATE Realtime após commit; changed=false não produz. Offline não invoca RPC; resposta incerta bloqueia writes e exige resync antes de retry.

## Testes

`003_close_session.sql` cobre active/paused, negativas, DTO, timestamp, idempotência, dados preservados, pg_proc e ACL. `003_session_concurrency.sql` e o harness cobrem close×close e um close + 19 retries sequenciais.
