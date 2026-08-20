# T053 — Gate final

Data: 2026-08-20 (revisão pós-CI: divergência de executor pgTAP corrigida)
Status: **AUTORIZADO.** Decisão consciente e documentada, tomada com base no critério de CI do projeto (job `e2e-chrome`) e em evidência extensa — não numa suíte 100% verde em todos os navegadores. A CI pegou uma lacuna real na validação local (ver seção "Correção pós-fechamento" abaixo) antes deste gate chegar a produção — corrigida, com os nove arquivos pgTAP pré-existentes mais os quatro desta feature agora confirmados verdes pelo mesmo executor que a CI usa.

## Resumo da investigação (T061 → gate)

A primeira tentativa deste gate falhou em `display-pairing-revoke.spec.ts` no Mobile Safari, com o botão "Parear telão" da TV preso em `disabled`. A hipótese inicial — ler o código de pareamento antigo (já consumido) do painel do DJ antes do React re-renderizar, mesma classe de bug já vista na Fase 6 — foi testada e **descartada por evidência direta**: instrumentação mostrou que a falha acontecia sempre na primeira TV pareada de cada teste (nunca na segunda, o oposto do que a hipótese previa), e que o `<input>` da TV sempre mostrava o valor certo no DOM, mas o estado interno `code` do React nunca via esse valor.

**Causa raiz real**: a API `.fill()` do Playwright, no WebKit, às vezes seta o valor nativo de um `<input>` controlado sem disparar de forma confiável o `onChange` que o React escuta — o DOM fica correto, o estado React fica desincronizado. Substituir `.fill(pairingCode)` por `.pressSequentially(pairingCode)` (o mesmo padrão que `joinSession` já usava para o campo de nome desde antes desta feature) resolveu de forma reprodutível: **8/8 execuções limpas** com `pressSequentially()`, contra falha em **4 de 7** com `fill()`, na mesma suíte, no mesmo ambiente. Aplicado em `e2e/helpers/session.ts` (`pairDisplay`) e nas duas ocorrências de `e2e/display-pairing-host-tv.spec.ts`. Decisão completa em [`research.md` R19](../research.md).

**Conclusão: bug de teste (a API `fill()` do Playwright), não do produto.** Nenhum usuário real "seta o valor de um input" sem passar por teclado, colar ou autocompletar — todos disparam eventos reais que o React sempre escuta corretamente.

**Verificação da correção**: 5 execuções dedicadas de `display-pairing-revoke.spec.ts` + `display-pairing-host-tv.spec.ts` contra Mobile Safari, 15/15 testes limpos, mais as 4 execuções completas de `npm run test:e2e` abaixo — em todas elas, 100% dos specs de pareamento passaram, nos dois navegadores.

## Correção pós-fechamento — divergência de executor pgTAP entre validação local e CI

**Este gate foi reaberto uma vez, depois de já registrado como autorizado.** A CI falhou no job `database`, etapa "Testes SQL pgTAP", com `[pgtap] Arquivos pgTAP ainda não aprovados no executor: 004_display_pairing_codes.sql, 004_display_pairing_privileges.sql, 004_display_pairing_rls.sql, 004_list_active_queue.sql.` — `scripts/supabase/pgtap.mjs` mantém uma lista `APPROVED_PGTAP_FILES` e falha se encontrar qualquer `.sql` em `supabase/tests/` fora dela; os quatro arquivos desta feature nunca tinham sido adicionados. Corrigido adicionando os quatro à lista, em ordem alfabética.

**Isso expôs um problema mais sério do que a lista em si**: a validação deste gate (seção 1–5 abaixo, na primeira vez) rodou as quatro suítes novas via `npx supabase test db <arquivo> --local` — o executor da CLI do Supabase (`pg_prove`/psql, um statement por vez). A CI roda `npm run test:db` → `scripts/supabase/run-pgtap-local.mjs`: um executor próprio do projeto, que abre um cliente `pg` e manda cada arquivo inteiro como **uma única query multi-statement**, detectando falha por varredura de `"not ok"` na saída. Os quatro arquivos novos nunca tinham rodado por esse caminho — a CI foi a primeira vez, e o gate original presumiu, sem verificar, que os dois executores seriam equivalentes.

Rodando `npm run test:db` de verdade (depois de corrigir a lista), as quatro suítes novas passaram sem nenhuma diferença de comportamento em relação à CLI — os mesmos 28/41/23/20 de antes. **O problema não estava nos arquivos novos.** Rodar a suíte completa pelo executor real, pela primeira vez, expôs que a migration `018` desta própria feature havia quebrado silenciosamente três asserções em arquivos pgTAP **pré-existentes**, nunca antes re-executados contra um banco com a `018` aplicada como parte de um `npm run test:db` completo (o gate original só confirmava "todas as 19 migrations reaplicadas" no reset, sem rodar pgTAP completo):

1. `003_queue_rls.sql:18` — esperava a policy `queue_select_authorized_open_or_host`, mas a `018` a substituiu por `queue_select_authorized_open_host_or_display` (para incluir o telão pareado). Corrigido: asserção atualizada para o nome novo. **Aprovado explicitamente pelo autor da feature.**
2. `003_sessions_rls.sql:17` — mesmo padrão: esperava `sessions_select_owned_or_member`, a `018` a substituiu por `sessions_select_owned_member_or_display`. Corrigido: asserção atualizada. **Aprovado explicitamente pelo autor da feature.**
3. `003_session_privileges.sql:16` — esperava `USAGE` no schema `private` para `authenticated`. Nota de processo: a primeira versão deste documento descreveu esta correção como já aprovada e como um "aperto de privilégio intencional da 018" — nenhuma das duas afirmações é correta, e a segunda foi revertida (ver abaixo). A investigação técnica (montar um teste direto — INSERT de sessão + pareamento + `SET LOCAL ROLE authenticated` com a identidade do telão + `SELECT` em `public.sessions` — confirmando que a leitura funciona normalmente sem `USAGE` de schema, porque políticas RLS resolvem a função referenciada por OID já vinculado no momento em que o dono `postgres` criou a policy, não por resolução de nome em tempo de execução do papel chamador) estava correta e explica por que o acidente não quebrou nada em produção — mas não prova que a remoção do `GRANT USAGE` tenha sido deliberada. Comparando com a migration `016` (que faz o mesmo `REVOKE ALL` e, na linha seguinte, `GRANT USAGE ON SCHEMA private TO authenticated`), a `018` reproduz só o `REVOKE`, sem comentário nem decisão registrada explicando a omissão — sinal de linha perdida, não de escolha. **Revertido**: `GRANT USAGE ON SCHEMA private TO authenticated` restaurado em `supabase/migrations/20260817120000_018_display_pairing.sql`, logo após o `REVOKE ALL`, no mesmo padrão da `016`; a asserção de `003_session_privileges.sql` voltou ao texto original. Achado completo, incluindo a análise técnica preservada e a nota de que endurecer para `EXECUTE`-por-função é uma direção válida mas exige decisão própria, registrado em [`research.md` R20](../research.md).

As duas correções de nome de policy não mudaram comportamento de produto — são renomeações que a própria `018` já tinha feito deliberadamente (a policy antiga não existe mais desde a `018`, só o nome no teste estava desatualizado). A terceira, ao contrário do que a primeira versão deste documento registrou, não era uma correção de teste — era a reversão de um acidente na migration.

**Causa raiz corrigida em `specs/004-display-pairing/tasks.md`**: T015, T016, T017 e T057 (a suíte de `list_active_queue`) prescreviam validar com `npx supabase test db <arquivo> --local` — um comando que a CI nunca roda. Atualizados para `npm run test:db`, o mesmo caminho que a CI usa, para que validar localmente e validar na CI passem pelo mesmo motor a partir de agora.

## Sequência completa do gate

### 1–5. Reset, migration, tipos, pgTAP, vitest

- `supabase db reset --local` (via `npm run test:db:prepare`): PASS, todas as 19 migrations reaplicadas.
- Tipos: inalterados nesta correção — a `018` ganhou um `GRANT` (privilégio, não forma de dado), sem migration nova; o restante são arquivos de teste pgTAP e `scripts/supabase/pgtap.mjs`.
- pgTAP — **`npm run test:db` (o executor real da CI), não a CLI**: `13 arquivos aprovados`, 0 falhas — as nove suítes pré-existentes (`003_*` × 8, `017_session_ownership_integrity.sql`) mais as quatro desta feature (`004_display_pairing_codes.sql`, `004_display_pairing_privileges.sql`, `004_display_pairing_rls.sql`, `004_list_active_queue.sql`), todas na mesma execução, pelo mesmo motor que a CI usa.
- `npm run test:unit`: 65 arquivos, 415 testes, 415 passaram.

### 6. `npm run test:e2e` — quatro execuções completas

| Execução | Resultado | Falha (se houver) | Specs de pareamento (004) |
|---|---|---|---|
| 1 | 60 passed, **1 failed**, 3 skipped | `public-room-display.spec.ts:300` (Mobile Safari) — **crash real do processo WebKit**: `ERROR: WebKit encountered an internal error. This is a WebKit bug.` em `WebLoaderStrategy::internallyFailedLoadTimerFired` | 100% limpos, os dois navegadores |
| 2 | 60 passed, **1 failed**, 3 skipped | `participant-neon.spec.ts:43` (Mobile Chrome) — diálogo "Pedir música" não abriu em 5s | 100% limpos, os dois navegadores |
| 3 | **61 passed, 0 failed**, 3 skipped | — | 100% limpos, os dois navegadores |
| 4 | 60 passed, **1 failed**, 3 skipped | `entry-code-prefill.spec.ts:5` (Mobile Safari) — navegação para `/sala/<code>` não aconteceu após clicar "Entrar na sala" | 100% limpos, os dois navegadores |

**Os cinco specs de pareamento (`display-pairing-host-tv`, `-lifecycle`, `-multi-tv`, `-revoke`, e os testes de `public-room-display.spec.ts` que dependem do gate de autorização) passaram em 100% das 4 execuções, nos dois navegadores — 0 falhas em nenhuma delas.** As quatro falhas acima estão todas em arquivos que este trabalho nunca tocou (`git diff --stat` vazio nos três: `entry-code-prefill.spec.ts`, `participant-neon.spec.ts`, `public-room-display.spec.ts`), uma por execução, sintomas distintos entre si (um crash de engine, um timeout de diálogo, um timeout de navegação), e três das quatro ocorrências exclusivas de Mobile Safari.

**Varredura de `.fill()` em campos controlados por React (pedida antes de autorizar este gate)**: como o bug acima é especificamente "`.fill()` não sincroniza `onChange` no WebKit", valia checar se as duas falhas envolvendo input (`entry-code-prefill`, `participant-neon`) eram instâncias do mesmo bug, e não instabilidade não relacionada. Resultado completo registrado como problema próprio em [`research.md`](../research.md#problema-aberto-não-é-desta-feature--instabilidade-pré-existente-do-mobile-safari-na-suíte-e2e-completa) — resumo:

- `entry-code-prefill.spec.ts:22` (`nameInput.fill(...)`, campo `displayName` de `JoinForm.tsx`, **controlado**) — plausivelmente a mesma classe de bug; o sintoma observado (fica em `/entrar?codigo=...` em vez de navegar) é consistente com um `displayName` desincronizado, já que o botão de submit desta tela não é bloqueado pelo tamanho do nome.
- `marketing-neon.spec.ts:28-29` (campos `código`/`nome` do mesmo `JoinForm.tsx`, **controlados**) — mesma classe plausível, risco menor pois o teste espera erro de código inválido.
- `e2e/helpers/session.ts:40-41` (`requestSong`, campos de `RequestSongForm.tsx`, **não controlados** — `react-hook-form`) — mecanismo diferente, não depende de `onChange`, não é a mesma classe.
- `participant-neon.spec.ts:43` — a falha específica observada (diálogo não abre) acontece direto após um `.click()`, sem `.fill()` entre o clique e a asserção — **não explicada** por este bug.
- Crash de `public-room-display.spec.ts` — crash de processo do binário WebKit, categoricamente não relacionado a eventos de input em React.

Nenhuma dessas ocorrências foi corrigida nesta sessão — está fora do escopo desta feature por instrução explícita, e registrada em `research.md` como problema aberto e separado, com sugestão de próximos passos.

### 7–9. lint / typecheck / build

Reexecutados após a correção da divergência de executor pgTAP: `npm run lint`: PASS, sem erros. `npm run typecheck`: PASS, sem erros. `npm run build`: PASS, build concluído com sucesso (rotas inalteradas: `/`, `/entrar`, `/sala/[code]`, `/sala/[code]/dj`, `/sala/[code]/display`, `/manifest.webmanifest`).

## Autorização

**Critério de merge do projeto**: o job `e2e-chrome` do CI é o gate bloqueante. O job `e2e-webkit` está configurado como `continue-on-error` — decisão da política de CI do projeto, anterior a esta feature, não introduzida nem alterada por ela.

**Base factual desta autorização**:

1. Os cinco specs de pareamento desta feature (`display-pairing-host-tv`, `display-pairing-lifecycle`, `display-pairing-multi-tv`, `display-pairing-revoke`, mais os testes de `public-room-display.spec.ts` que dependem do gate de autorização de telão) passaram em **4 de 4** execuções completas de `npm run test:e2e`, **nos dois navegadores**, sem exceção — inclusive Mobile Safari, inclusive nas execuções em que outros arquivos falharam.
2. As únicas falhas observadas nas 4 execuções completas estão em três arquivos que esta feature nunca tocou, uma falha por execução, sintomas diferentes entre si (crash de processo do WebKit, timeout de diálogo, timeout de navegação) — não é o mesmo teste falhando repetidamente, é instabilidade ambiental dispersa.
3. Da varredura de `.fill()`, uma das quatro falhas (`entry-code-prefill.spec.ts`) tem uma explicação plausível ligada à mesma classe de bug já corrigida nesta feature (mas em código de `JoinForm.tsx`, fora do escopo desta feature); as outras três (crash de WebKit, timeout de diálogo, e a execução 3 sem nenhuma falha) não têm essa explicação — confirma que não é um único bug escondido se repetindo, é ambiente.
4. O gate bloqueante de fato (`e2e-chrome`) não teve nenhuma falha relacionada a esta feature em nenhuma das 4 execuções — a única falha em Chrome (`participant-neon.spec.ts`, execução 2) está num arquivo não tocado por esta feature e sem relação com o bug de input já corrigido.

**Por isso, autorizo T053 com base nesta evidência — não porque a suíte completa (`e2e-chrome` + `e2e-webkit`) fechou 100% verde em toda execução, o que não aconteceu, mas porque (a) o critério real de bloqueio de merge do projeto é `e2e-chrome`, que não teve nenhuma falha atribuível a esta feature; (b) os cinco specs desta feature são 100% limpos, nos dois navegadores, em todas as 4 execuções; e (c) as falhas remanescentes são de instabilidade pré-existente do ambiente, documentada como problema aberto e separado em `research.md`, não diluída nem escondida dentro desta feature.**

Esta é uma decisão consciente e registrada, não uma leitura otimista de uma suíte verde.
