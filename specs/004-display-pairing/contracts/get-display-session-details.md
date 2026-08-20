# Contract: get_display_session_details

## Definição SQL única

```sql
public.get_display_session_details(p_session_id uuid)
RETURNS TABLE (id uuid, code text, status text, closed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`. Paralela a `get_host_session_details`, mas com autorização mais ampla (Host **ou** telão pareado) e projeção mais estreita (sem `created_at`, `max_participants`, `max_queue_entries` — a página do telão não usa esses campos).

## Identidade, autorização e operação

Identidade só por `auth.uid()`; null retorna `AUTH_REQUIRED`. Autoriza se `private.is_session_host(p_session_id)` OR `private.is_paired_display(p_session_id)` — **sem** exigir sessão aberta, deliberadamente (ver `research.md` R5). Qualquer outra identidade (participante comum, visitante não relacionado, telão revogado) recebe `SESSION_NOT_FOUND_OR_FORBIDDEN`, reaproveitando o mesmo código de erro indistinguível já usado por `get_host_session_details`.

Retorna `id, code, status, closed_at` da sessão, independentemente do status.

## Uso na página

`app/sala/[code]/display/page.tsx` chama esta RPC depois de `getSessionStatusRowByCode(code)` resolver o `session_id`. Retorno nulo/erro faz a página renderizar `DisplayPairingScreen` em vez de redirecionar. Retorno com `status = 'closed'` faz a página renderizar `DisplayClosedState`, igual ao caminho já existente para o Host.

## Cardinalidade SQL e DTO singular

`RETURNS TABLE` set-oriented, cardinalidade lógica um. Segue o mesmo padrão de `get_host_session_details`: `expectSingleRpcRow`, `RPC_RESULT_CARDINALITY`/`RPC_RESULT_INVALID` em cardinalidade/schema inesperados.

## ACL

```sql
ALTER FUNCTION public.get_display_session_details(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_display_session_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_display_session_details(uuid) TO authenticated;
```

## Erros

`AUTH_REQUIRED`, `SESSION_NOT_FOUND_OR_FORBIDDEN`, `UNKNOWN`.

## Testes

`004_display_pairing_rls.sql` cobre Host (aberto/fechado), telão pareado ativo (aberto/fechado), telão revogado (recusado em ambos), participante comum (recusado), visitante sem vínculo (recusado), e telão de outra sessão (recusado). `src/application/display-pairing/__tests__/get-display-session-details.test.ts` cobre zero/uma/múltiplas linhas e o roteamento da página (`app/sala/[code]/display/page.tsx`) para as três telas possíveis.
