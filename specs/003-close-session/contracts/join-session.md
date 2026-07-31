# Contract: join_session

## Definição SQL única

```sql
public.join_session(p_code text, p_display_name text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`. Não existe overload por UUID, host_id ou claims. Como a assinatura/return type final histórica já é `(text,text) RETURNS jsonb`, ela pode ser substituída sem DROP de retorno.

## Entrada e retorno

`p_code` é normalizado como código de seis caracteres; `p_display_name` é validado e trimado. O JSON retorna somente:

```json
{"participant":{"id":"uuid","session_id":"uuid","display_name":"Nome","disambiguation_index":1,"joined_at":"timestamptz","last_seen":"timestamptz"}}
```

Nunca retorna `auth_user_id`, recovery hash/token, Session inteira ou campos futuros.

## Identidade, autorização e lock

Identidade somente por `auth.uid()`; null gera `AUTH_REQUIRED`. A função localiza a Session por código e a bloqueia `FOR UPDATE` antes de contar, recuperar ou criar Participant. Active permite recovery/criação. Paused retorna `SESSION_PAUSED` sem mutação. Closed retorna `SESSION_CLOSED` antes de INSERT ou atualização de `last_seen`. Código inexistente retorna `SESSION_NOT_FOUND`.

Capacidade, nome, vínculo `(session_id,auth_user_id)` e isolamento são validados no banco. A ordem é Session → Participant.

## Segurança e ACL

Todos os objetos são qualificados (`auth.uid()`, `public.sessions`, `public.participants`). Depois da definição:

```sql
ALTER FUNCTION public.join_session(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.join_session(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_session(text,text) TO authenticated;
```

Supabase Anonymous Auth usa role authenticated. Não há grant para role anon não autenticado.

## Erros e idempotência

`AUTH_REQUIRED`, `SESSION_NOT_FOUND`, `SESSION_PAUSED`, `SESSION_CLOSED`, `SESSION_FULL`, `INVALID_DISPLAY_NAME`, `UNKNOWN`. SESSION_CLOSED é traduzido para “Esta sala já foi encerrada.” Recovery do mesmo vínculo em active é idempotente e não cria duplicata.

## Testes

`003_session_writers.sql` prova assinatura/pg_proc/ACL, auth, active, paused, closed, capacidade, DTO sanitizado, recovery e nenhuma mutação após closed. O harness prova close×join nas duas ordens.
