# Contract: redeem_display_pairing_code

## Definição SQL única

```sql
public.redeem_display_pairing_code(p_room_code text, p_pairing_code text)
RETURNS TABLE (session_id uuid, paired boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`.

## Identidade, autorização e operação

Identidade só por `auth.uid()`; null retorna `UNAUTHORIZED` (o chamador da Server Action garante `signInAnonymously()` antes desta RPC, mesmo bootstrap de `createSessionAction`). Não exige nenhum vínculo prévio com a sessão — é exatamente o mecanismo que cria esse vínculo.

Passos, nesta ordem:

1. Resolve `v_session_id, v_status` por `SELECT id, status FROM public.sessions WHERE code = upper(trim(p_room_code))`. Não encontrado: `v_session_id` permanece `NULL` — **nenhuma exceção é levantada aqui**.
2. Rate limit, avaliado **antes** de qualquer gravação: se `v_session_id IS NOT NULL`, conta `SELECT count(*) FROM private.display_pairing_attempts WHERE session_id = v_session_id AND auth_user_id = auth.uid() AND attempted_at > now() - interval '5 minutes'`. Se `v_session_id IS NULL`, conta sem filtro de sessão — `SELECT count(*) FROM private.display_pairing_attempts WHERE auth_user_id = auth.uid() AND attempted_at > now() - interval '5 minutes'` — porque não há sessão para escopar e a defesa precisa cobrir quem varre vários códigos de sala com a mesma identidade. `count >= 10` → `PAIRING_CODE_INVALID` imediatamente, **sem inserir** a linha desta tentativa em `private.display_pairing_attempts` e sem avaliar mais nada. Um chamador já bloqueado não grava mais linhas: a tabela do rate limit não pode, ela própria, virar um vetor de escrita sem limite.
3. `INSERT INTO private.display_pairing_attempts (session_id, auth_user_id) VALUES (v_session_id, auth.uid())` — só é alcançado quando o passo 2 não recusou, ou seja, quando a contagem estava abaixo do limite. Grava mesmo quando `v_session_id` é `NULL` (código de sala inexistente), o que fecha a sondagem de código de sala sob o mesmo rate limit (ver `research.md`).
4. `v_session_id IS NULL` → `PAIRING_CODE_INVALID`. Código de sala inexistente e código de pareamento errado produzem exatamente o mesmo erro — a tela de pareamento renderiza a mesma mensagem genérica nos dois casos, e nenhuma UI depende de diferenciá-los.
5. `v_status = 'closed'` → `SESSION_CLOSED`.
6. `SELECT * FROM private.display_pairing_codes WHERE session_id = v_session_id AND code = upper(trim(p_pairing_code)) AND consumed_at IS NULL FOR UPDATE`. Não encontrado, ou encontrado com `expires_at <= now()` → `PAIRING_CODE_INVALID` (mesma exceção dos passos 2 e 4).
7. `UPDATE private.display_pairing_codes SET consumed_at = now(), consumed_by = auth.uid() WHERE id = v_code_id`.
8. `INSERT INTO public.display_pairings (session_id, auth_user_id) VALUES (v_session_id, auth.uid()) ON CONFLICT (session_id, auth_user_id) DO UPDATE SET revoked_at = NULL, paired_at = now() WHERE public.display_pairings.revoked_at IS NOT NULL` — idempotente tanto para primeiro pareamento quanto para re-pareamento após revogação; identidade já pareada e ativa que resgata outro código válido apenas confirma o vínculo existente sem erro.
9. `RETURN QUERY SELECT v_session_id, true`.

## Concorrência

Passo 6 usa `FOR UPDATE`, serializando duas transações disputando o mesmo código. A segunda, ao readquirir o lock após o commit da primeira, reavalia `consumed_at IS NULL` e não encontra a linha — cai no mesmo `PAIRING_CODE_INVALID` do passo 6. Implementa o Edge Case "duas TVs tentam resgatar o mesmo código simultaneamente: apenas uma vence".

## Cardinalidade SQL e DTO singular

`RETURNS TABLE` set-oriented, cardinalidade lógica um. `expectSingleRpcRow` normaliza; zero/múltiplas linhas → `RPC_RESULT_CARDINALITY`; schema inválido → `RPC_RESULT_INVALID`.

## ACL

```sql
ALTER FUNCTION public.redeem_display_pairing_code(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_display_pairing_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_display_pairing_code(text, text) TO authenticated;
```

## Erros

`UNAUTHORIZED`, `SESSION_CLOSED`, `PAIRING_CODE_INVALID`, `UNKNOWN`. Não existe `SESSION_NOT_FOUND` nesta RPC — código de sala inexistente colapsa em `PAIRING_CODE_INVALID`, junto com código de pareamento inexistente, expirado, já consumido e limite de tentativas excedido. (As demais RPCs da feature — `generate_display_pairing_code`, `get_display_session_details`, `list_paired_displays`, `revoke_display_pairing` — continuam usando `SESSION_NOT_FOUND_OR_FORBIDDEN` normalmente; a mudança é exclusiva desta RPC, porque só ela é alcançável por um chamador que ainda não tem nenhum vínculo com a sessão.)

## Testes

`004_display_pairing_codes.sql` cobre resgate válido (código único-uso, `display_pairings` criado), resgate de código expirado, resgate de código já consumido, resgate de código de outra sessão (isolamento), resgate concorrente do mesmo código, resgate com código de sala inexistente (`PAIRING_CODE_INVALID`, não `SESSION_NOT_FOUND`), e re-pareamento após revogação. `004_display_pairing_rate_limit.sql` cobre a 11ª tentativa em 5 minutos tanto com sessão resolvida (contagem por `(session_id, auth_user_id)`) quanto com código de sala inexistente (contagem por `auth_user_id` sozinho); confirma que as primeiras 10 tentativas gravam linha em `private.display_pairing_attempts` (com `session_id` nulo no caso de sala inexistente) e que a 11ª tentativa em diante **não** grava nenhuma linha nova — o total de linhas para aquela identidade fica travado em 10 independentemente de quantas chamadas adicionais forem feitas dentro da janela. `src/application/display-pairing/__tests__/redeem-display-pairing-code.action.test.ts` cobre o bootstrap de auth anônimo e o mapeamento de erro.
