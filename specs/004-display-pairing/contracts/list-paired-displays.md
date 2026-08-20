# Contract: list_paired_displays

## Definição SQL única

```sql
public.list_paired_displays(p_session_id uuid)
RETURNS TABLE (id uuid, paired_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`.

## Identidade, autorização e operação

Identidade só por `auth.uid()`; null retorna `AUTH_REQUIRED`. Autoriza somente `private.is_session_host(p_session_id)`; qualquer outra identidade retorna `SESSION_NOT_FOUND_OR_FORBIDDEN`.

```sql
RETURN QUERY
SELECT dp.id, dp.paired_at
FROM public.display_pairings AS dp
WHERE dp.session_id = p_session_id AND dp.revoked_at IS NULL
ORDER BY dp.paired_at ASC;
```

Nenhuma coluna de identidade (`auth_user_id`) é retornada — o painel do DJ mostra contagem e horário de pareamento, nunca "quem" é a TV, porque não há nome ou atributo humano associado a um telão.

## Diferença desta RPC vs. leitura direta da tabela

`public.display_pairings` já tem uma policy `display_pairings_select_host` que permitiria ao Host ler a tabela diretamente via PostgREST. Esta RPC existe mesmo assim para manter o padrão do projeto de expor ao cliente uma projeção curada em vez de depender só de RLS + `SELECT *` — o mesmo raciocínio de `get_host_session_details` existir ao lado da policy de `sessions`. O hook `useDisplayPairings` usa a RPC para o snapshot inicial e a leitura direta da tabela (via Realtime `postgres_changes`, que também respeita a mesma RLS) só para os eventos incrementais.

## Cardinalidade

`RETURNS TABLE` set-oriented, mas aqui a cardinalidade lógica é **0..N**, não exatamente um — não passa por `expectSingleRpcRow`. O array retornado é consumido diretamente, com Zod `z.array(pairedDisplayRowSchema)` validando cada elemento.

## ACL

```sql
ALTER FUNCTION public.list_paired_displays(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_paired_displays(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_paired_displays(uuid) TO authenticated;
```

## Erros

`AUTH_REQUIRED`, `SESSION_NOT_FOUND_OR_FORBIDDEN`, `UNKNOWN`.

## Testes

`004_display_pairing_codes.sql` cobre lista vazia, um pareamento, múltiplos pareamentos, pareamento revogado excluído da lista, e não-Host recusado. `src/hooks/__tests__/useDisplayPairings.test.ts` cobre snapshot inicial + evento Realtime de `INSERT`/`UPDATE` incrementando/removendo a contagem exibida.
