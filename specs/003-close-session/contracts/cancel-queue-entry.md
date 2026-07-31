# Contract: cancel_queue_entry

## Remoção da assinatura histórica

A baseline possui `(uuid) RETURNS public.queue`. A migration 015 executa:

```sql
DROP FUNCTION IF EXISTS public.cancel_queue_entry(uuid);
```

## Definição SQL única

```sql
public.cancel_queue_entry(p_queue_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`; referências qualificadas; sem parâmetros session_id/host_id.

## Identidade, autorização e lock

Identidade somente por `auth.uid()`; null gera `AUTH_REQUIRED`. A função lê apenas o `session_id` imutável da Queue entry sem lock, bloqueia a Session, rejeita closed, então bloqueia a mesma Queue row. Missing/non-owner/cross-session usa `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN`.

Participant dono ou Host proprietário pode cancelar nos estados permitidos pelo comportamento existente. Em active ou paused, `pending → cancelled` é a única transição desta RPC; demais mudanças do Host usam `update_queue_status`. Closed retorna `SESSION_CLOSED` e não altera status, posição ou timestamps. Ordem: Session → Queue.

## Retorno, erros e idempotência

RPC retorna void; action retorna somente `AppSuccess<void>`. Erros: `AUTH_REQUIRED`, `QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN`, `SESSION_CLOSED`, `INVALID_STATUS_TRANSITION`, `UNKNOWN`. Repetição de uma operação já aplicada segue o erro de transição existente; não há DTO alternativo.

## ACL

```sql
ALTER FUNCTION public.cancel_queue_entry(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_queue_entry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_queue_entry(uuid) TO authenticated;
```

## Testes

`003_session_writers.sql` prova DROP/recriação, return void, pg_proc/ACL, Participant/Host, status permitido, closed e preservação. O harness prova close×cancel nas duas ordens.
