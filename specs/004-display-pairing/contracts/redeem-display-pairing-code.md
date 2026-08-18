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
2. `v_session_id IS NULL` → `PAIRING_CODE_INVALID`. Código de sala inexistente e código de pareamento errado produzem exatamente o mesmo erro — a tela de pareamento renderiza a mesma mensagem genérica nos dois casos, e nenhuma UI depende de diferenciá-los. Colapsar os dois é o que impede sondar códigos de sala por essa RPC: uma resposta distinguível revelaria se um código de sala existe ou não.
3. `v_status = 'closed'` → `SESSION_CLOSED`.
4. `SELECT * FROM private.display_pairing_codes WHERE session_id = v_session_id AND code = upper(trim(p_pairing_code)) AND consumed_at IS NULL FOR UPDATE`. Não encontrado, ou encontrado com `expires_at <= now()` → `PAIRING_CODE_INVALID` (mesma exceção do passo 2).
5. `UPDATE private.display_pairing_codes SET consumed_at = now(), consumed_by = auth.uid() WHERE id = v_code_id`.
6. `INSERT INTO public.display_pairings (session_id, auth_user_id) VALUES (v_session_id, auth.uid()) ON CONFLICT ON CONSTRAINT display_pairings_session_identity_key DO UPDATE SET revoked_at = NULL, paired_at = now() WHERE public.display_pairings.revoked_at IS NOT NULL` — idempotente tanto para primeiro pareamento quanto para re-pareamento após revogação; identidade já pareada e ativa que resgata outro código válido apenas confirma o vínculo existente sem erro. `ON CONFLICT` nomeia a constraint em vez de listar colunas: um alvo por lista de colunas aqui é ambíguo contra o parâmetro OUT `session_id` desta própria função (`RETURNS TABLE(session_id uuid, ...)` declara `session_id` implicitamente como variável dentro do corpo plpgsql).
7. `RETURN QUERY SELECT v_session_id, true`.

Não há rate limit nem log de tentativas nesta RPC — ver `research.md` pela decisão de removê-los e o porquê. O espaço de códigos (32⁶ ≈ 1,07 bilhão) e a janela de expiração de 5 minutos já tornam força bruta inviável; o passo 2 (colapsar sala inexistente) é o que resta da defesa contra sondagem, e não depende de nenhum log.

## Concorrência

Passo 4 usa `FOR UPDATE`, serializando duas transações disputando o mesmo código. A segunda, ao readquirir o lock após o commit da primeira, reavalia `consumed_at IS NULL` e não encontra a linha — cai no mesmo `PAIRING_CODE_INVALID` do passo 4. Implementa o Edge Case "duas TVs tentam resgatar o mesmo código simultaneamente: apenas uma vence".

## Cardinalidade SQL e DTO singular

`RETURNS TABLE` set-oriented, cardinalidade lógica um. `expectSingleRpcRow` normaliza; zero/múltiplas linhas → `RPC_RESULT_CARDINALITY`; schema inválido → `RPC_RESULT_INVALID`.

## ACL

```sql
ALTER FUNCTION public.redeem_display_pairing_code(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_display_pairing_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_display_pairing_code(text, text) TO authenticated;
```

## Erros

`UNAUTHORIZED`, `SESSION_CLOSED`, `PAIRING_CODE_INVALID`, `UNKNOWN`. Não existe `SESSION_NOT_FOUND` nesta RPC — código de sala inexistente colapsa em `PAIRING_CODE_INVALID`, junto com código de pareamento inexistente, expirado e já consumido. (As demais RPCs da feature — `generate_display_pairing_code`, `get_display_session_details`, `list_paired_displays`, `revoke_display_pairing` — continuam usando `SESSION_NOT_FOUND_OR_FORBIDDEN` normalmente; a mudança é exclusiva desta RPC, porque só ela é alcançável por um chamador que ainda não tem nenhum vínculo com a sessão.)

## Testes

`004_display_pairing_codes.sql` cobre resgate válido (código único-uso, `display_pairings` criado), resgate de código expirado, resgate de código já consumido, resgate de código de outra sessão (isolamento), resgate concorrente do mesmo código, resgate com código de sala inexistente (`PAIRING_CODE_INVALID`, não `SESSION_NOT_FOUND`), e re-pareamento após revogação. `src/application/display-pairing/__tests__/redeem-display-pairing-code.action.test.ts` cobre o bootstrap de auth anônimo e o mapeamento de erro.
