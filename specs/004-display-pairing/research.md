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

**Alternatives rejected**: expor uma leitura pública (sem RLS) de `sessions` por código só para resolver o `id` antes de chamar a RPC de resgate — criaria uma segunda forma pública de "entrar" numa sala por código, redundante com o que a própria RPC `SECURITY DEFINER` já faz internamente (mesmo padrão de `join_session`). Não é uma questão de esconder se a sala existe — o fluxo de entrada (`join_session`/`JoinForm`) já revela isso de propósito com `SESSION_NOT_FOUND` distinto (ver R11) — é evitar um segundo mecanismo de resolução de código quando o primeiro já resolve o mesmo problema sem superfície nova.

## R8. Indistinguibilidade de erro (FR-015) sem rate limit

**Decision**: `redeem_display_pairing_code` não mantém nenhum log de tentativas nem contador. A defesa contra sondagem é inteiramente a resposta indistinguível para o código de pareamento — o único dado secreto deste fluxo: código de pareamento inexistente, expirado e já consumido levantam todos a mesma exceção `PAIRING_CODE_INVALID`. Código de sala inexistente cai na mesma exceção também, mas isso não é defesa contra sondagem — existência de sala já é pública no fluxo de entrada por decisão de usabilidade (ver R11).

**Rationale**: os Edge Cases da spec exigem recusa indistinguível para código de pareamento inexistente/expirado/consumido — essa parte não depende de contar tentativa nenhuma. A feature originalmente incluía um rate limit por identidade/sessão sobre uma tabela `private.display_pairing_attempts`; ele foi removido — ver R13 para a decisão completa e o porquê (o espaço de códigos por si só já torna força bruta inviável, e a tentativa de "logar antes de rejeitar" esbarrava numa tensão transacional real que um `RAISE EXCEPTION` não permite contornar em PL/pgSQL puro).

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

**Rationale**: a razão **não é esconder se a sala existe** — o produto já revela isso de propósito em outro lugar. `join_session` levanta `SESSION_NOT_FOUND` distinto (`src/domain/errors.types.ts`), e `JoinForm`/`MarketingExperience` mostram "Sala não encontrada." literalmente para esse caso, sem rate limit e sem disfarce — é o caminho natural e correto de alguém que digitou um código errado num bar descobrir que errou. Esta própria RPC já resolve `v_session_id` internamente antes de decidir o que retornar (passo 1); distinguir os dois casos não exigiria nenhuma capacidade nova, só uma segunda mensagem de erro. A razão real para colapsar é outra: nenhuma consumidora da resposta usa a distinção. `DisplayPairingScreen` renderiza a mesma mensagem genérica em qualquer falha de resgate, então um segundo código de erro aqui seria um branch morto — complexidade sem consumidor. Colapsar mantém esta RPC com exatamente um caminho de falha, consistente com o resto do fluxo de resgate (código expirado, consumido ou de pareamento errado já produzem a mesma resposta — R8). As outras quatro RPCs da feature mantêm `SESSION_NOT_FOUND_OR_FORBIDDEN` normalmente porque só são alcançáveis por quem já tem vínculo com a sessão (Host ou telão pareado) — não têm o mesmo caminho de "resgate por qualquer um" que motivou simplificar esta RPC especificamente. Esta decisão vale por si só, independentemente de existir ou não um rate limit — ver R13.

**Alternatives rejected**: manter `SESSION_NOT_FOUND` distinto — tecnicamente possível sem custo, já que a RPC já sabe se a sessão existe, mas introduziria um segundo código de erro que nenhuma UI consome, fragmentando o contrato de falha desta RPC em duas formas para o mesmo efeito prático (a tela de pareamento mostra a mesma mensagem de qualquer forma).

## R12. Nota — códigos expirados não liberam o espaço de código (informativo, sem ação nesta feature)

`display_pairing_codes_active_code_idx` é único em `(code) WHERE consumed_at IS NULL`; um código gerado e nunca resgatado ocupa esse código para sempre e a tabela cresce sem limite. Irrelevante na escala real (33^6 combinações contra poucos códigos por noite por bar), e não há necessidade de limpeza agora — registrado aqui só para não ser redescoberto como surpresa. Se uma rotina de limpeza for adicionada no futuro, ela precisa preservar linhas consumidas (auditoria) e remover só as expiradas e nunca consumidas.

## R13. Rate limit removido — o espaço de códigos já é a defesa suficiente

**Decision**: `private.display_pairing_attempts` não existe. `redeem_display_pairing_code` não conta nem grava nenhuma tentativa; a única defesa contra sondagem é a resposta indistinguível (R8, R11).

**Rationale**: o código de pareamento tem 6 caracteres num alfabeto de 32 símbolos — 32⁶ ≈ 1,07 bilhão de combinações — e expira em 5 minutos. Um ataque de força bruta dentro dessa janela precisaria de ordem de 10⁸–10⁹ tentativas, inviável mesmo muitas ordens de grandeza acima do que a plataforma permite. O rate limit protegia contra um cenário que a própria matemática do espaço de códigos já torna impraticável, e seu custo era real e concreto: uma tabela inteira, um log de identidade e horário por tentativa (dado sensível por si só), e — o motivo decisivo — uma tensão transacional que se mostrou, na prática, impossível de resolver corretamente em PL/pgSQL puro. Um diagnóstico direto confirmou que `RAISE EXCEPTION` desfaz qualquer escrita feita antes dele na mesma chamada de função, mesmo com `BEGIN/EXCEPTION` interno relançando o erro — ou seja, a tentativa registrada antes da rejeição nunca sobrevivia à própria rejeição, e o mecanismo não limitava ninguém. A metade de FR-015 que efetivamente protege contra sondagem — respostas indistinguíveis — não depende desse log e permanece integralmente.

**Alternatives rejected**:
- **Transação autônoma via `dblink`/`pg_background`**: resolveria a tensão transacional (a escrita do log ocorreria numa conexão/transação separada, sobrevivendo ao `RAISE` da transação principal), mas introduz uma dependência de infraestrutura nova — não prevista em nenhum artefato desta feature — para defender contra um ataque que o espaço de códigos já torna inviável. Custo desproporcional ao risco.
- **`redeem_display_pairing_code` retornar um status de falha em vez de lançar exceção**: permitiria logar a tentativa e ainda assim persistir o log, já que a função retornaria normalmente (sem `RAISE`, sem rollback). Rejeitada porque muda o contrato de erro desta RPC para um formato diferente de todas as outras RPCs do projeto — que sinalizam falha por `RAISE EXCEPTION`, consumida por `mapSessionError`/`session-error.mapper.ts` via correspondência de substring na mensagem — exigindo um caminho de tratamento de erro só para esta função na camada de aplicação.
- **Manter o log sabendo que tentativas rejeitadas nunca persistem**: é o que o desenho anterior fazia de fato, mesmo sem essa ser a intenção documentada — mantém o custo (tabela, dado de identidade/horário) sem entregar a proteção que o log deveria fornecer. Rejeitada por não ter benefício real algum.

## R14. Página do telão trata "código de sala inexistente" e "sala existe mas visitante não autorizado" de forma idêntica

**Decision**: `app/sala/[code]/display/page.tsx` renderiza `DisplayPairingScreen` sempre que `getSessionStatusRowByCode` **ou** `getDisplaySessionDetails` falhar — sem distinguir "esse código não corresponde a nenhuma sessão" de "a sessão existe, mas essa identidade não é Host nem telão pareado dela". As duas situações levam exatamente à mesma tela. O único caso que continua fazendo `redirect(roomPath)` é falha de formato (`validateSessionCode` — 6 caracteres, alfabeto inválido), porque isso é erro de input do usuário, não uma pergunta de autorização.

**Rationale**: a razão **não é esconder se a sala existe** — isso já é público em outro fluxo do produto: entrar por `/entrar` com um código errado mostra "Sala não encontrada." (`join_session` levanta `SESSION_NOT_FOUND` distinto, `USER_MESSAGES.SESSION_NOT_FOUND`), de propósito, para que quem errou o código num bar saiba que errou — ver R11 para a mesma nota aplicada à RPC de resgate. A razão real aqui é técnica: a única ferramenta que a página tem para resolver `code → session_id` é `getSessionStatusRowByCode`, uma leitura gated pela policy de `sessions` — para um visitante sem vínculo (anônimo, participante de outra sessão, Host de outra sessão), ela retorna `NULL` tanto para "essa sala não existe" quanto para "essa sala existe, mas RLS nega esta identidade", e não há como diferenciar os dois sem introduzir uma nova capacidade de leitura pública de `sessions` por código que hoje não existe em lugar nenhum do projeto — a mesma capacidade que R7 recusa introduzir na RPC de resgate, ali por evitar um segundo mecanismo de resolução redundante, não por sigilo. Como a página não tem essa ferramenta, ela trata os dois casos de forma idêntica: qualquer falha em resolver uma sessão autorizada mostra a tela de pareamento, nunca um redirect. Isso alterou o comportamento esperado de um teste E2E pré-existente (`e2e/public-room-display.spec.ts`), que assumia redirect para um código de sala genuinamente inexistente — o teste foi atualizado para refletir esta invariante técnica, não uma decisão de sigilo.

**Alternatives rejected**:
- **Manter redirect para código inexistente e mostrar pareamento só quando a sessão existe mas está sem autorização**: exigiria uma nova leitura pública de sessão por código que a página hoje não tem, duplicando — com uma segunda superfície — uma resolução que já existe dentro de uma RPC `SECURITY DEFINER` (R7). Rejeitada pelo mesmo motivo de R7: evitar um mecanismo redundante, não medo de revelar existência de sala, que já é pública em outro fluxo.
- **RPC pública dedicada "essa sala existe?"**: resolveria a distinção sem tocar RLS de `sessions`, mas seria uma superfície nova só para esta página, quando o fluxo de entrada já expõe a mesma informação por um caminho existente (`join_session`/`JoinForm`). O ganho de UX (uma mensagem "sala não encontrada" na tela do telão em vez da tela de pareamento) não compensa manter duas RPCs fazendo a mesma checagem de existência.

## R15. `list_active_queue` vira RPC `SECURITY DEFINER`; FR-010 corrigida para não proibir o nome do cantor na fila

**Decision**: FR-010 foi reescrita — proíbe a leitura da lista/relação de participantes da sessão (quem está presente, com ou sem música na fila), não o nome do cantor já associado a uma entrada da fila que o telão está autorizado a ler por FR-009. `src/application/queue/list-active-queue.action.ts` deixa de fazer `.from('queue').select('*, participants(display_name)')` (um JOIN do PostgREST que exige RLS simultâneo em `queue` e `participants`) e passa a chamar uma RPC nova, `public.list_active_queue(p_session_id)`, `SECURITY DEFINER`, que resolve `display_name` internamente e a devolve já embutida em cada linha da fila. Autoriza Host, participante da própria sessão, ou telão pareado — as três identidades que FR-009 já cobre para ler a fila — reaproveitando os helpers `private.is_session_host`/`is_session_member`/`is_paired_display` já existentes. A policy de `participants` **não muda em nada**.

**Rationale**: a versão original de FR-010 era absoluta demais e a spec se contradizia — FR-009 manda o telão ler a fila, e a Assumption "o telão pareado exibe exatamente o mesmo conteúdo que o telão do Host exibe hoje" exige que esse conteúdo inclua o nome de quem está cantando, já que é isso que o telão do Host sempre mostrou. A causa técnica raiz: `list-active-queue.action.ts` é código pré-existente, compartilhado por Host, participante e (a partir da Fase 3 desta feature) telão pareado — e sempre dependeu de um JOIN embutido do PostgREST que só resolve quando o chamador tem RLS simultaneamente em `queue` e em `participants`. Host e participante sempre tiveram as duas; telão pareado é a primeira identidade do projeto com acesso a `queue` sem nenhum acesso a `participants` (por desenho deliberado desta própria feature, provado por `004_display_pairing_rls.sql`/SC-004). Para essa identidade o JOIN sempre retornava `null`, e o código caía num fallback `|| 'Cantor'` que converteu uma falha de permissão em dado plausível — por isso o defeito ficou invisível até T042 (a primeira cobertura de teste a colocar uma música na fila enquanto uma TV pareada observa). O fallback foi eliminado; um nome ausente na resposta da RPC agora é tratado como contrato quebrado, não como dado substituível. Resolver o nome via `SECURITY DEFINER` (em vez de estender RLS de `participants`) mantém a garantia já testada e protegida de "telão pareado nunca lê `participants`, em nenhum estado" (T015/T016/T040) intacta — o acesso ao nome passa a ser uma concessão pontual e auditável dentro de uma função, não uma abertura na policy que qualquer outra query poderia explorar.

**Alternatives rejected**:
- **Estender a policy de `participants` para reconhecer telão pareado**: resolveria o JOIN, mas é exatamente o vazamento que R4 já rejeitou — daria ao telão acesso à relação completa de participantes (quem está presente, mesmo sem pedir música), quebrando SC-004/FR-010 tal como permanecem definidas após esta correção. FR-010 foi reescrita para ser mais precisa, não para permitir isso.
- **RPC de leitura de fila separada, só para o telão pareado**: evitaria tocar no caminho já usado por Host/participante, mas deixaria duas rotas de leitura da mesma tabela para manter iguais indefinidamente — cada futura coluna ou regra de negócio na fila precisaria ser replicada nos dois lugares, e a primeira vez que alguém esquecesse de fazer isso reintroduziria exatamente este tipo de defeito (comportamento correto em um caminho, quebrado silenciosamente no outro). Unificar em uma única RPC usada por todo mundo elimina essa categoria de risco.
- **Manter o fallback `'Cantor'` e apenas documentá-lo como aceitável**: rejeitada sem ambiguidade — contradiz FR-009 (corrigida) e a Assumption de paridade de conteúdo com o telão do Host; um "Cantor" genérico para todo mundo não é uma degradação aceitável, é a funcionalidade central do produto não funcionando.
