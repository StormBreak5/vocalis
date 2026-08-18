# Research: Pareamento de Telão

## R1. A rota do telão troca redirect por tela de pareamento

**Decision**: `app/sala/[code]/display/page.tsx` deixa de chamar `redirect(roomPath)` quando o visitante não é Host. Em vez disso, dois checks sequenciais (`getSessionStatusRowByCode` seguido de uma RPC de autorização nova, `get_display_session_details`) decidem entre três telas: pareamento, encerrada, ou telão ao vivo.

**Rationale**: FR-008 exige explicitamente esse comportamento. Um redirect indistinguível do fluxo de participante tornaria impossível a uma TV dedicada (que nunca deve virar participante) descobrir que precisa de um código de pareamento.

**Alternatives rejected**: manter o redirect e adicionar um link "sou uma TV" na visão de participante — empurraria uma decisão de identidade para dentro de uma tela pensada para cantores, violando a separação de superfícies do AGENTS.md.

## R2. Identidade de telão pareado é um vínculo durável, não um cookie/flag de sessão

**Decision**: `public.display_pairings (session_id, auth_user_id)` — mesma forma que `participants (session_id, auth_user_id)`, exceto que não carrega `display_name`. Um `auth.uid()` sobrevive no `localStorage`/IndexedDB do Supabase client do navegador da TV; o vínculo em si sobrevive no banco enquanto a sessão existir.

**Rationale**: a Clarification "o pareamento sobrevive ao encerramento da sessão? Não" já implica um vínculo por-sessão, e a Assumption "TV que limpa o armazenamento perde a identidade" confirma que a identidade em si mora só no `auth.uid()` do navegador — o banco não precisa (nem deve) tentar reconhecer uma TV por IP, user-agent ou qualquer fingerprint.

**Alternatives rejected**: reaproveitar a tabela `participants` com uma flag `is_display` — poluiria a tabela que hoje é lida pela lista de participantes do DJ e obrigaria toda policy/query de `participants` a filtrar essa flag para não vazar telões como se fossem cantores (e vice-versa).

## R3. Código de pareamento fica no schema `private`, não `public`

**Decision**: `private.display_pairing_codes` é criada no schema `private` já existente (introduzido na migration 016 para os helpers de RLS), sem nenhum GRANT a `PUBLIC`/`anon`/`authenticated`.

**Rationale**: PostgREST só expõe schemas na lista `db-schemas` (por padrão, só `public`). Nenhum cliente tem motivo legítimo para fazer `SELECT` direto nessa tabela — o código retorna ao Host como valor de retorno da RPC `generate_display_pairing_code`, nunca por leitura de tabela. Ficar fora do schema exposto é defesa em profundidade sem exigir policy "deny all" extra.

**Alternatives rejected**: `public` com RLS restritiva total — funciona, mas exige uma policy negativa só para recriar o que a ausência do schema já garante.

## R4. `is_session_open` não é estendido — dois helpers novos nascem ao lado dele

**Decision**: `private.is_paired_display(uuid)` e `private.is_paired_display_open(uuid)` são helpers novos, independentes de `private.is_session_open`. A policy de `queue` passa a aceitar `is_session_open(...) OR is_paired_display_open(...)`. A policy de `participants` **não muda**.

**Rationale**: `is_session_open` é hoje o único portão de leitura tanto de `participants` quanto de `queue`. Estendê-lo para reconhecer telões pareados os autorizaria automaticamente a ler a lista de participantes — exatamente o vazamento que a spec identifica como "o principal risco de implementação da feature" (última linha das Assumptions) e que FR-010/SC-004 proíbem taxativamente.

**Alternatives rejected**: estender `is_session_open` — rejeitada sem ambiguidade, quebra User Story 3 e SC-004.

## R5. Leitura de `sessions` para telão pareado não exige sessão aberta; leitura de `queue` exige

**Decision**: a policy de `sessions` libera telão pareado independentemente de `status`. A policy de `queue` só libera telão pareado quando `status IN ('active','paused')`.

**Rationale**: User Story 4, cenário 4, exige que uma TV recarregada após o encerramento veja o estado de encerramento (`DisplayClosedState`), não a tela de pareamento — isso exige ler `status`/`closed_at` de uma sessão fechada, o mesmo dado mínimo que o próprio Host já lê depois de fechar a sala hoje. SC-006 restringe explicitamente "nenhuma leitura de fila ou participantes daquela sessão" após o encerramento — o conteúdo real que a tela exibiria — deixando de fora o estado terminal em si, que é informação equivalente à que a página de participante já expõe para qualquer código de sala válido. (SC-006 foi corrigida nesta revisão para essa redação; a versão anterior era absoluta e conflitava diretamente com este item.)

**Alternatives rejected**: bloquear toda leitura de `sessions` no encerramento — obrigaria a tela de pareamento a reaparecer para uma TV que só recarregou a página, contradizendo literalmente o cenário 4 ("não solicita novo pareamento válido").

## R6. Código de pareamento reaproveita o alfabeto e o padrão de colisão de `create_session`

**Decision**: `private.display_pairing_codes.code` usa o mesmo alfabeto de 33 símbolos (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) e o mesmo loop de geração com até 5 tentativas + `CODE_GENERATION_FAILED`, contra um índice único parcial `WHERE consumed_at IS NULL` — mesma forma do índice anti-spam da fila.

**Rationale**: FR-002 pede explicitamente o mesmo alfabeto. Reaproveitar o padrão de colisão de `create_session` evita uma segunda estratégia de geração de código no mesmo projeto. Escopo de unicidade é global (não por sessão) porque simplifica para um único índice, e a probabilidade de colisão em 33^6 combinações é desprezível mesmo compartilhada entre todas as sessões simultâneas.

**Alternatives rejected**: unicidade só por sessão — exigiria índice composto e não reduz risco de forma perceptível dado o espaço de 33^6.

## R7. `redeem_display_pairing_code` recebe o código da sala, não `session_id`

**Decision**: a RPC de resgate tem assinatura `(p_room_code text, p_pairing_code text)` e resolve a sessão internamente.

**Rationale**: uma TV que nunca foi pareada não tem nenhuma linha de `sessions` visível via RLS — não há como o Server Component obter um `session_id` para ela antes do pareamento. `join_session(p_code, p_display_name)` já resolve exatamente esse mesmo problema para participantes; reaproveitar a forma evita uma segunda maneira de "entrar" numa sala por código.

**Alternatives rejected**: expor uma leitura pública (sem RLS) de `sessions` por código só para resolver o id antes do pareamento — reabriria a superfície pública de lookup que a migration 016 fechou deliberadamente ("não existe policy pública de lookup").

## R8. Indistinguibilidade de erro (FR-015) sem rate limit

**Decision**: `redeem_display_pairing_code` não mantém nenhum log de tentativas nem contador. A defesa contra sondagem é inteiramente a resposta indistinguível: código de pareamento inexistente, expirado, já consumido e código de sala inexistente levantam todos a mesma exceção `PAIRING_CODE_INVALID`.

**Rationale**: os Edge Cases da spec exigem recusa indistinguível para código inexistente/expirado/consumido — essa parte não depende de contar tentativa nenhuma. A feature originalmente incluía um rate limit por identidade/sessão sobre uma tabela `private.display_pairing_attempts`; ele foi removido — ver R13 para a decisão completa e o porquê (o espaço de códigos por si só já torna força bruta inviável, e a tentativa de "logar antes de rejeitar" esbarrava numa tensão transacional real que um `RAISE EXCEPTION` não permite contornar em PL/pgSQL puro).

**Alternatives rejected**: limitar por IP — Supabase não expõe IP de forma confiável dentro de uma função `SECURITY DEFINER` sem infraestrutura adicional (proxy headers), e seria um mecanismo novo para um risco que R13 já mostra ser desprezível.

## R9. Painel do DJ usa Realtime em `display_pairings`, não polling nem refetch manual

**Decision**: `public.display_pairings` entra na publication `supabase_realtime` (mesmo padrão de `sessions`, adicionado na 016), com policy `display_pairings_select_host`. Um hook novo, `useDisplayPairings`, replica a forma de `useSessionParticipants`.

**Rationale**: o resgate de um código acontece no navegador da TV, um cliente diferente do painel do Host — é exatamente o caso "estado compartilhado visível em múltiplos clientes" que a Constitution III obriga a resolver com Realtime, não com um refetch acionado por outro botão.

**Alternatives rejected**: o Host clicar em "atualizar" para ver telões pareados — tecnicamente simples, mas contraria a Constitution III e o Acceptance Scenario 1.5 ("o painel do DJ reflete que existe um telão pareado", sem menção a uma ação manual do Host).

## R10. Revogação é lógica (`revoked_at`), não `DELETE`

**Decision**: `revoke_display_pairing` faz `UPDATE ... SET revoked_at = now()`, nunca `DELETE`. Um re-pareamento da mesma identidade nessa mesma sessão faz `INSERT ... ON CONFLICT (session_id, auth_user_id) DO UPDATE SET revoked_at = NULL, paired_at = now() WHERE display_pairings.revoked_at IS NOT NULL`.

**Rationale**: mantém o mesmo estilo "terminal mas visível" que `sessions.closed_at` já estabelece no projeto — revogação vira parte do histórico consultável em vez de apagar a linha, e o `UPSERT` condicional evita um segundo caminho de código para "resgatar depois de revogado" vs. "resgatar pela primeira vez".

**Alternatives rejected**: `DELETE` — mais simples de escrever, mas exige tratar "nunca pareado" e "revogado" como o mesmo estado no `is_paired_display`, perdendo a distinção sem ganho real de simplicidade (o `UPSERT` condicional não é mais complexo que um `INSERT` simples).

## R11. `redeem_display_pairing_code` colapsa sala inexistente em `PAIRING_CODE_INVALID`

**Decision**: o passo que resolve `p_room_code → session_id` não levanta `SESSION_NOT_FOUND`. Sala inexistente deixa `session_id` `NULL`, e a função só recusa mais adiante com `PAIRING_CODE_INVALID` — o mesmo erro de código de pareamento errado, expirado ou consumido.

**Rationale**: uma resposta que distinguisse "sala não existe" de "código de pareamento errado" permitiria sondar códigos de sala válidos por essa RPC, já que ela é alcançável por qualquer identidade autenticada sem nenhum vínculo prévio — inconsistente com a postura do resto do desenho (R8, Edge Cases da spec), que colapsa deliberadamente toda falha de pareamento num erro único. A tela de pareamento (`DisplayPairingScreen`) renderiza a mesma mensagem genérica nos dois casos, então nada na UI perde informação. As outras quatro RPCs da feature mantêm `SESSION_NOT_FOUND_OR_FORBIDDEN` normalmente — elas só são alcançáveis por quem já tem algum vínculo (Host ou telão pareado) com a sessão, então não há superfície de sondagem por código de sala para fechar ali. Esta decisão vale por si só, independentemente de existir ou não um rate limit — ver R13.

**Alternatives rejected**: manter `SESSION_NOT_FOUND` distinto — mais simétrico com as outras quatro RPCs, mas reabriria exatamente a sondagem de existência de sala que colapsar o erro existe para fechar.

## R12. Nota — códigos expirados não liberam o espaço de código (informativo, sem ação nesta feature)

`display_pairing_codes_active_code_idx` é único em `(code) WHERE consumed_at IS NULL`; um código gerado e nunca resgatado ocupa esse código para sempre e a tabela cresce sem limite. Irrelevante na escala real (33^6 combinações contra poucos códigos por noite por bar), e não há necessidade de limpeza agora — registrado aqui só para não ser redescoberto como surpresa. Se uma rotina de limpeza for adicionada no futuro, ela precisa preservar linhas consumidas (auditoria) e remover só as expiradas e nunca consumidas.

## R13. Rate limit removido — o espaço de códigos já é a defesa suficiente

**Decision**: `private.display_pairing_attempts` não existe. `redeem_display_pairing_code` não conta nem grava nenhuma tentativa; a única defesa contra sondagem é a resposta indistinguível (R8, R11).

**Rationale**: o código de pareamento tem 6 caracteres num alfabeto de 32 símbolos — 32⁶ ≈ 1,07 bilhão de combinações — e expira em 5 minutos. Um ataque de força bruta dentro dessa janela precisaria de ordem de 10⁸–10⁹ tentativas, inviável mesmo muitas ordens de grandeza acima do que a plataforma permite. O rate limit protegia contra um cenário que a própria matemática do espaço de códigos já torna impraticável, e seu custo era real e concreto: uma tabela inteira, um log de identidade e horário por tentativa (dado sensível por si só), e — o motivo decisivo — uma tensão transacional que se mostrou, na prática, impossível de resolver corretamente em PL/pgSQL puro. Um diagnóstico direto confirmou que `RAISE EXCEPTION` desfaz qualquer escrita feita antes dele na mesma chamada de função, mesmo com `BEGIN/EXCEPTION` interno relançando o erro — ou seja, a tentativa registrada antes da rejeição nunca sobrevivia à própria rejeição, e o mecanismo não limitava ninguém. A metade de FR-015 que efetivamente protege contra sondagem — respostas indistinguíveis — não depende desse log e permanece integralmente.

**Alternatives rejected**:
- **Transação autônoma via `dblink`/`pg_background`**: resolveria a tensão transacional (a escrita do log ocorreria numa conexão/transação separada, sobrevivendo ao `RAISE` da transação principal), mas introduz uma dependência de infraestrutura nova — não prevista em nenhum artefato desta feature — para defender contra um ataque que o espaço de códigos já torna inviável. Custo desproporcional ao risco.
- **`redeem_display_pairing_code` retornar um status de falha em vez de lançar exceção**: permitiria logar a tentativa e ainda assim persistir o log, já que a função retornaria normalmente (sem `RAISE`, sem rollback). Rejeitada porque muda o contrato de erro desta RPC para um formato diferente de todas as outras RPCs do projeto — que sinalizam falha por `RAISE EXCEPTION`, consumida por `mapSessionError`/`session-error.mapper.ts` via correspondência de substring na mensagem — exigindo um caminho de tratamento de erro só para esta função na camada de aplicação.
- **Manter o log sabendo que tentativas rejeitadas nunca persistem**: é o que o desenho anterior fazia de fato, mesmo sem essa ser a intenção documentada — mantém o custo (tabela, dado de identidade/horário) sem entregar a proteção que o log deveria fornecer. Rejeitada por não ter benefício real algum.
