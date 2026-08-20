# Contract: revoke_display_pairing

## Definição SQL única

```sql
public.revoke_display_pairing(p_display_pairing_id uuid)
RETURNS TABLE (id uuid, revoked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`.

## Identidade, autorização e operação

Identidade só por `auth.uid()`; null retorna `AUTH_REQUIRED`. A função bloqueia a linha com:

```sql
SELECT dp.id, dp.revoked_at INTO ...
FROM public.display_pairings AS dp
JOIN public.sessions AS s ON s.id = dp.session_id
WHERE dp.id = p_display_pairing_id AND s.host_id = auth.uid()
FOR UPDATE OF dp;
```

Pareamento inexistente ou pertencente a uma sessão de outro Host retorna `PAIRING_NOT_FOUND_OR_FORBIDDEN` (indistinguível entre "não existe" e "não é seu", mesmo espírito de `SESSION_NOT_FOUND_OR_FORBIDDEN`). Já revogado: retorna a linha existente com `revoked = false` (idempotente, sem `UPDATE` nem evento Realtime novo — mesmo padrão de `close_session` para uma sessão já fechada). Ativo: `UPDATE ... SET revoked_at = now()`, retorna `revoked = true`.

## Efeito

A partir do commit, `private.is_paired_display(session_id)` passa a retornar `false` para aquele `auth.uid()` — a próxima leitura de `sessions`/`queue` daquela TV (point-read de reconexão do `useSessionLifecycle`, ou o próximo carregamento de página) já não passa mais em nenhuma policy. Não há mecanismo de "kick" ativo: a revogação não força a TV a atualizar a página instantaneamente, ela só deixa de ser autorizada na próxima leitura — mesma filosofia fail-closed que o resto do lifecycle de sessão já usa (uma sessão fechada também não empurra um comando para o cliente, só deixa de autorizar a próxima leitura/Realtime).

## Cardinalidade SQL e DTO singular

`RETURNS TABLE` set-oriented, cardinalidade lógica um. `expectSingleRpcRow`; `RPC_RESULT_CARDINALITY`/`RPC_RESULT_INVALID` nos casos fora do contrato.

## ACL

```sql
ALTER FUNCTION public.revoke_display_pairing(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_display_pairing(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_display_pairing(uuid) TO authenticated;
```

## Erros

`AUTH_REQUIRED`, `PAIRING_NOT_FOUND_OR_FORBIDDEN`, `UNKNOWN`.

## Testes

`004_display_pairing_rls.sql` cobre revogação pelo Host dono, tentativa de revogação por Host de outra sessão (recusada), revogação idêntica repetida (idempotente), e o efeito pós-revogação sobre `sessions`/`queue`/`get_display_session_details` para a identidade revogada. `src/components/dj/__tests__/DjDisplayPairingPanel.test.tsx` cobre o clique em "Revogar" e a atualização da lista via evento Realtime simulado.
