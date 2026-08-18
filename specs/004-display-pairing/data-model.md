# Data Model: Pareamento de Telão

## `private.display_pairing_codes`

Credencial efêmera de uso único, gerada pelo Host, consumida por uma TV.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `session_id` | uuid | NOT NULL, FK → `public.sessions(id)` ON DELETE CASCADE |
| `code` | char(6) | NOT NULL, alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| `created_at` | timestamptz | NOT NULL DEFAULT `now()` |
| `expires_at` | timestamptz | NOT NULL, `created_at + interval '5 minutes'` |
| `consumed_at` | timestamptz | NULL até o primeiro resgate bem-sucedido |
| `consumed_by` | uuid | NULL, FK → `auth.users(id)`, preenchido junto com `consumed_at` |
| `created_by` | uuid | NOT NULL, FK → `auth.users(id)` — Host que gerou (auditoria) |

Constraints:

```sql
CONSTRAINT display_pairing_codes_consumed_coherence_check
  CHECK ((consumed_at IS NULL) = (consumed_by IS NULL))
CONSTRAINT display_pairing_codes_consumed_after_created_check
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
```

Índice único parcial (mesma forma do índice anti-spam de `queue`):

```sql
CREATE UNIQUE INDEX display_pairing_codes_active_code_idx
  ON private.display_pairing_codes (code)
  WHERE consumed_at IS NULL;
```

Um código nunca é `UPDATE`ado além de `consumed_at`/`consumed_by`. Não há job de limpeza — códigos expirados e não consumidos permanecem na tabela (auditoria implícita) mas nunca mais passam na checagem `expires_at > now()` da RPC de resgate; eles continuam ocupando o índice único parcial, tal como o histórico de `create_session` nunca libera códigos de sala.

Sem RLS: schema `private` não é exposto por PostgREST e não recebe nenhum GRANT a papéis web.

Não há tabela de log de tentativas. O rate limit por identidade/sessão foi removido do desenho — ver `research.md` pela decisão e o motivo (espaço de códigos de 32⁶ ≈ 1,07 bilhão contra uma janela de 5 minutos torna força bruta inviável, e a tentativa de logar antes de rejeitar esbarrava numa tensão transacional real: um `RAISE EXCEPTION` desfaz qualquer escrita feita antes dele na mesma chamada). A metade de FR-015 que independe do log — respostas indistinguíveis entre código inexistente, expirado, já consumido e sala inexistente — continua garantida só pelo `redeem_display_pairing_code` colapsar todos esses casos na mesma exceção `PAIRING_CODE_INVALID`.

## `public.display_pairings`

Vínculo durável "este `auth.uid()` é um telão autorizado desta sessão".

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `session_id` | uuid | NOT NULL, FK → `public.sessions(id)` ON DELETE CASCADE |
| `auth_user_id` | uuid | NOT NULL, FK → `auth.users(id)` |
| `paired_at` | timestamptz | NOT NULL DEFAULT `now()`, atualizado a cada re-pareamento após revogação |
| `revoked_at` | timestamptz | NULL enquanto o pareamento está ativo |

```sql
CONSTRAINT display_pairings_session_identity_key UNIQUE (session_id, auth_user_id)

CREATE INDEX display_pairings_session_active_idx
  ON public.display_pairings (session_id)
  WHERE revoked_at IS NULL;
```

RLS: `ENABLE ROW LEVEL SECURITY`, uma única policy:

```sql
CREATE POLICY display_pairings_select_host ON public.display_pairings
FOR SELECT TO authenticated
USING (private.is_session_host(session_id));
```

`REVOKE SELECT ... FROM PUBLIC, anon, authenticated` antes do grant mínimo:

```sql
GRANT SELECT (id, session_id, paired_at, revoked_at) ON TABLE public.display_pairings TO authenticated;
```

(`session_id` precisa estar no grant: a assinatura Realtime do painel do DJ filtra por `filter: session_id=eq.<sessionId>`, e não é possível filtrar por uma coluna sem `SELECT` nela — mesmo precedente da migration 016, que concede `SELECT (id, code, status, closed_at)` em `sessions` justamente porque `id` é a coluna de filtro de `useSessionLifecycle`. `auth_user_id` continua fora do grant — a policy já filtra as linhas por sessão do Host, e expor `auth_user_id` não tem uso na UI e evitaria qualquer tentação futura de correlacionar telões entre sessões.)

Adicionada à publication `supabase_realtime` (mesmo bloco idempotente `DO $$ IF NOT EXISTS $$` usado para `sessions` na migration 016).

## Helpers RLS novos (schema `private`)

```sql
private.is_paired_display(p_session_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER PARALLEL UNSAFE SET search_path = ''
-- true sse existe display_pairings não revogado para (p_session_id, auth.uid())

private.is_paired_display_open(p_session_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER PARALLEL UNSAFE SET search_path = ''
-- is_paired_display(p_session_id) AND sessions.status IN ('active','paused')
```

Mesma forma dos três helpers existentes: owner `postgres`, `false` para entrada nula/sessão inexistente, `REVOKE ALL` + `GRANT EXECUTE TO authenticated`.

## Policies alteradas (DROP por nome exato + CREATE)

| Tabela | Policy removida | Policy nova | Mudança |
|---|---|---|---|
| `sessions` | `sessions_select_owned_or_member` | `sessions_select_owned_member_or_display` | `OR private.is_paired_display(id)`, sem exigir sessão aberta |
| `queue` | `queue_select_authorized_open_or_host` | `queue_select_authorized_open_host_or_display` | `OR private.is_paired_display_open(session_id)` |
| `participants` | — | — | **inalterada**; nenhuma referência a `is_paired_display` em nenhum lugar desta policy |

## Nenhuma coluna nova em tabelas existentes

`sessions`, `participants` e `queue` permanecem exatamente como definidas nas migrations 001–017. Esta feature não adiciona `is_display`, `display_count` ou qualquer coluna equivalente — a informação "quantos telões" é sempre derivada de `public.display_pairings` via `list_paired_displays`/Realtime, nunca desnormalizada em `sessions`.

## Estados e transições

**Código de pareamento**: `ativo` (`consumed_at IS NULL`, `expires_at > now()`) → `consumido` (resgate bem-sucedido, terminal) | `expirado` (`expires_at <= now()`, terminal, mas a linha continua com `consumed_at IS NULL` — distinguido só pela comparação de tempo na RPC, não por um novo status persistido).

**Pareamento**: `ativo` (`revoked_at IS NULL`) ↔ `revogado` (`revoked_at IS NOT NULL`) — a única transição de volta a `ativo` é um novo resgate bem-sucedido pela mesma identidade, nunca uma ação direta de "reativar".

**Efeito do encerramento da sessão**: `close_session` não toca em `display_pairing_codes` nem em `display_pairings` — a revogação de acesso a `queue`/`participants` é inteiramente efeito colateral de `is_paired_display_open` exigir `status IN ('active','paused')`, e `ON DELETE CASCADE` em `sessions_id` garante que nada sobrevive à exclusão física de uma sessão (que hoje o produto nunca faz, mas a constraint documenta a invariante).
