# Revisão externa do plano 004 — pareamento de telão

Revisão dos artefatos gerados (`plan.md`, `data-model.md`, `research.md`, `contracts/`) conferidos contra o código real das migrations 015–017 e do `session.queries.ts`.

## Avaliação geral

O plano está bem construído. Dois pontos merecem confirmação explícita porque foram verificados e procedem:

- **A separação dos helpers RLS está certa.** Confirmei na migration 016 que `private.is_session_open` é usado tanto pela policy de `participants` quanto pela de `queue`. Estendê-lo teria liberado a lista de participantes para telões pareados, violando FR-010/SC-004. Criar `is_paired_display`/`is_paired_display_open` separados é a decisão correta e está bem justificada no Complexity Tracking.
- **O gate da página do telão foi resolvido corretamente.** O passo 3 (`plan.md:101`) renderiza `DisplayPairingScreen` em vez de `redirect`, o que cobre o caso da TV não pareada — que hoje seria expulsa para a visão de participante já no `getSessionStatusRowByCode`.

Os pontos abaixo são o que falta ajustar.

---

## 1. BLOQUEANTE — o grant por coluna de `display_pairings` impede a assinatura Realtime

**Contradição entre dois artefatos.**

`data-model.md` define:

```sql
GRANT SELECT (id, paired_at, revoked_at) ON TABLE public.display_pairings TO authenticated;
```

e justifica excluir `session_id` porque "a policy já filtra por sessão do Host".

Mas `plan.md:112` especifica:

> `useDisplayPairings(sessionId)` — snapshot inicial via `listPairedDisplays` + **assinatura Realtime em `display_pairings` filtrada por `session_id`**

Não dá para filtrar por uma coluna sobre a qual o papel não tem `SELECT`. A assinatura falha ou não entrega nada, e o payload do evento também não traria `session_id` para o cliente rotear o evento.

**A evidência mais forte está no próprio projeto.** A migration 016 faz exatamente o oposto ao conceder `sessions`:

```sql
GRANT SELECT (id, code, status, closed_at) ON TABLE public.sessions TO authenticated;
```

`id` está incluída — e é justamente a coluna pela qual `useSessionLifecycle` filtra (`filter: id=eq.<id>`). O precedente do projeto é conceder a coluna de filtro. `display_pairings` seria a única tabela a fugir disso, e é a única que quebraria.

**Correção:** incluir `session_id` no grant. O risco é nulo: a policy `display_pairings_select_host` já restringe as linhas às sessões do próprio Host, que obviamente conhece o `session_id` daquela sala. A justificativa original ("evitar correlacionar telões entre sessões") continua valendo para `auth_user_id`, que deve permanecer fora do grant.

```sql
GRANT SELECT (id, session_id, paired_at, revoked_at) ON TABLE public.display_pairings TO authenticated;
```

Alternativa, se preferir manter o grant estreito: abrir mão do Realtime nessa tabela e refazer `list_paired_displays` sob demanda (após parear ou revogar). Custa uma atualização menos fluida no painel do DJ, mas simplifica.

---

## 2. Conflito entre SC-006 da spec e o comportamento projetado — erro meu na spec

`data-model.md` estende a policy de `sessions` com `OR private.is_paired_display(id)` **sem exigir sessão aberta**, deliberadamente, para que a TV consiga renderizar `DisplayClosedState`. `plan.md:135` confirma nos testes: *"`sessions`/`queue` liberadas para telão pareado (aberto e, no caso de `sessions`, também fechado)"*.

Isso está correto e é necessário — sem ler `sessions.status` após o encerramento, a User Story 4, cenário 3 ("a TV exibe o estado de encerramento") não tem como funcionar.

Mas a spec que eu escrevi diz, em SC-006:

> Após o encerramento da sessão, nenhuma identidade previamente pareada consegue ler dados daquela sessão.

Absoluto demais, e em conflito direto com o desenho. Deixado como está, quem escrever o pgTAP a partir da spec vai codificar uma asserção que falha contra uma implementação correta.

**Correção — substituir SC-006 por:**

> **SC-006**: Após o encerramento da sessão, nenhuma identidade previamente pareada consegue ler a fila ou os participantes daquela sessão; a leitura permanece restrita ao estado da sessão, o mínimo necessário para exibir a tela de encerramento.

---

## 3. `data-model.md` se contradiz sobre `display_pairing_attempts.session_id`

A tabela declara:

| `session_id` | uuid | **NOT NULL** — sessão resolvida a partir de `p_room_code`, **ou NULL se o código de sala nem existia** |

NOT NULL e "ou NULL" não podem coexistir. Quem implementar vai ter que escolher, e a escolha muda o comportamento.

Pelo contrato de `redeem_display_pairing_code`, o passo 1 levanta `SESSION_NOT_FOUND` **antes** do INSERT do passo 2 — então o caso NULL nunca ocorre e `NOT NULL` é o correto. A prosa é que está errada.

Mas veja o item 4: essa prosa sugere que o autor *pretendia* registrar também as tentativas com código de sala inexistente. Os dois documentos discordam sobre a mesma decisão de desenho, e vale decidir conscientemente qual vence.

---

## 4. O rate limit não cobre código de sala inexistente, e isso vaza existência de sala

Consequência da ordem de passos do contrato: como `SESSION_NOT_FOUND` é levantado antes de qualquer registro de tentativa, é possível varrer códigos de sala por essa RPC **sem nenhum limite**, e a resposta distingue "sala não existe" (`SESSION_NOT_FOUND`) de "código de pareamento errado" (`PAIRING_CODE_INVALID`).

Isso destoa da postura do resto do desenho, que colapsa deliberadamente todas as falhas de pareamento num erro único e indistinguível justamente para não permitir sondagem.

**Severidade: baixa.** O espaço de códigos é 32⁶ ≈ 1,07 bilhão e as salas são efêmeras. Mas a correção é barata:

- Colapsar `SESSION_NOT_FOUND` em `PAIRING_CODE_INVALID` nesta RPC (a página do telão renderiza a tela de pareamento nos dois casos, então nada na UI depende da distinção).
- Registrar a tentativa mesmo quando a sala não resolve, com `session_id` nulo, contando o limite por `auth_user_id` nesse caso.

Isso torna `session_id` legitimamente nullable e resolve o item 3 na direção oposta — daí a importância de decidir os dois juntos.

---

## 5. Observação menor — códigos expirados nunca liberam o espaço de código

`display_pairing_codes_active_code_idx` é UNIQUE em `(code) WHERE consumed_at IS NULL`, e o documento afirma que não há rotina de limpeza. Um código gerado e nunca resgatado permanece ocupando aquele código para sempre, e a tabela cresce sem limite.

Irrelevante na escala real (bilhão de combinações contra alguns códigos por noite), e não vale complicar a feature agora. Registro apenas para não ser redescoberto como surpresa: se um dia houver limpeza, ela precisa preservar as linhas consumidas por auditoria e remover só as expiradas não consumidas.

---

## Resumo

| # | Gravidade | O que fazer |
|---|---|---|
| 1 | **Bloqueante** | Incluir `session_id` no `GRANT SELECT` de `display_pairings`, ou abandonar o Realtime nessa tabela |
| 2 | Alta | Reescrever SC-006 na spec antes de gerar tasks — senão vira teste errado |
| 3 | Média | Resolver a contradição NOT NULL / NULL em `display_pairing_attempts` |
| 4 | Baixa | Decidir junto com o 3: colapsar `SESSION_NOT_FOUND` e registrar tentativas não resolvidas |
| 5 | Informativa | Só registrar; não agir agora |

Os itens 1 a 4 devem ser corrigidos **antes** de rodar a geração de tasks, porque todos os quatro se propagam para testes que seriam escritos errados.
