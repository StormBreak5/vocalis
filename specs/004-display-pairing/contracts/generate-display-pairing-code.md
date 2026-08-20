# Contract: generate_display_pairing_code

## Definição SQL única

```sql
public.generate_display_pairing_code(p_session_id uuid)
RETURNS TABLE (code text, expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = ''
```

Owner `postgres`; sem overload por código de sala ou claims.

## Identidade, autorização e operação

Identidade só por `auth.uid()`. Null retorna `AUTH_REQUIRED`. A função bloqueia `public.sessions` com `SELECT ... WHERE id = p_session_id AND host_id = auth.uid() FOR UPDATE`. Missing, outro Host, Participant, telão pareado e usuário sem vínculo retornam `SESSION_NOT_FOUND_OR_FORBIDDEN`. `status = 'closed'` retorna `SESSION_CLOSED` sem gerar código.

Gera um código de 6 caracteres do alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, retenta em colisão contra `private.display_pairing_codes_active_code_idx` até 5 vezes (`CODE_GENERATION_FAILED` na 6ª). Insere `session_id`, `code`, `created_by = auth.uid()`, `expires_at = now() + interval '5 minutes'`.

## Concorrência

O lock de `sessions` é o mesmo lock Session-first usado por todo writer do projeto; gerar dois códigos em sequência rápida não tem efeito colateral além de deixar o código anterior ainda válido até expirar ou ser consumido (Edge Case "Host gera vários códigos sem resgatar").

## Cardinalidade SQL e DTO singular

`RETURNS TABLE` é set-oriented; contrato lógico exige exatamente uma linha `{code, expires_at}`. `src/application/shared/expect-single-rpc-row.ts` normaliza; zero/múltiplas linhas geram `RPC_RESULT_CARDINALITY`, schema inválido gera `RPC_RESULT_INVALID`.

## ACL

```sql
ALTER FUNCTION public.generate_display_pairing_code(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_display_pairing_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_display_pairing_code(uuid) TO authenticated;
```

## Erros

`AUTH_REQUIRED`, `SESSION_NOT_FOUND_OR_FORBIDDEN`, `SESSION_CLOSED`, `CODE_GENERATION_FAILED`, `UNKNOWN`.

## Testes

`004_display_pairing_codes.sql` cobre Host ativo/pausado (sucesso), Host de sessão fechada (`SESSION_CLOSED`), não-Host (`SESSION_NOT_FOUND_OR_FORBIDDEN`), colisão forçada (retry), `expires_at` exatamente 5 minutos à frente, e `pg_proc`/ACL. `src/application/display-pairing/__tests__/generate-display-pairing-code.action.test.ts` cobre zero/uma/múltiplas linhas.
