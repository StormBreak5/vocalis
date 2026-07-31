# Contract: create_queue_entry

## Remoção da assinatura histórica

A baseline possui `(uuid, character varying, character varying) RETURNS public.queue`. Como o retorno muda, a migration 015 executa primeiro:

```sql
DROP FUNCTION IF EXISTS public.create_queue_entry(uuid, character varying, character varying);
```

## Definição SQL única

```sql
public.create_queue_entry(
  p_session_id uuid,
  p_song_title character varying,
  p_artist character varying
) RETURNS TABLE (
  id uuid, session_id uuid, participant_id uuid,
  song_title character varying, artist character varying,
  status character varying, position integer,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`; objetos qualificados; sem overload por host_id.

## Identidade, autorização e lock

Identidade somente por `auth.uid()`; null gera `AUTH_REQUIRED`. A função bloqueia `public.sessions` por `p_session_id` antes de consultar Participant/Queue. Missing gera `SESSION_NOT_FOUND_OR_FORBIDDEN`; closed gera `SESSION_CLOSED`; paused gera `SESSION_PAUSED`. Active exige Participant vinculado ao JWT. O Host não recebe identidade Participant implícita.

Depois do lock, aplica validação de título/artista, limites, Microfone Justo e posição. Ordem: Session → Participant/Queue. Nenhuma Queue row é criada após closed.

## Retorno, erros e idempotência

Cada linha do retorno SQL possui nove campos explícitos; a função nunca usa `RETURNS public.queue`. O DTO singular só existe após a normalização de cardinalidade abaixo. Erros: `AUTH_REQUIRED`, `SESSION_NOT_FOUND_OR_FORBIDDEN`, `SESSION_PAUSED`, `SESSION_CLOSED`, `PARTICIPANT_NOT_FOUND_OR_FORBIDDEN`, `ACTIVE_SONG_EXISTS`, `QUEUE_FULL`, `INVALID_SONG`, `UNKNOWN`.

A criação não é idempotente; retry após resposta incerta deve ressincronizar. O índice parcial impede duas músicas ativas.

## Cardinalidade SQL e DTO singular

`RETURNS TABLE` é set-oriented, embora o contrato lógico exija exatamente uma linha de nove campos. O Supabase retorna array. A action passa `data: unknown` e o schema `QueueEntry` a `src/application/shared/expect-single-rpc-row.ts`; zero ou múltiplas linhas geram `RPC_RESULT_CARDINALITY`, linha inválida gera `RPC_RESULT_INVALID`, e somente uma linha válida vira o DTO singular. É proibido cast de array para objeto, `any` ou acesso a `data.campo` antes da normalização.

## ACL

```sql
ALTER FUNCTION public.create_queue_entry(uuid,character varying,character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_queue_entry(uuid,character varying,character varying) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_queue_entry(uuid,character varying,character varying) TO authenticated;
```

## Testes

`003_session_writers.sql` prova DROP/recriação, retorno, pg_proc/ACL, active/paused/closed, Microfone Justo, posição, limites e nenhuma inserção após closed. `src/application/shared/__tests__/expect-single-rpc-row.test.ts` e `src/application/__tests__/closed-session-writers.test.ts` cobrem zero/uma/múltiplas linhas, schema e consumo singular. O harness prova close×create nas duas ordens.
