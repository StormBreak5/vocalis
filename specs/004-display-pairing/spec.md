# Feature Specification: Pareamento de Telão

**Feature Branch**: [004-display-pairing]

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "Permitir que uma TV do bar, com navegador próprio, exiba o telão de uma sessão sem ser o dispositivo do Host, por meio de um código de pareamento de uso único gerado no painel do DJ."

## Contexto do problema

O telão (`/sala/[code]/display`) autoriza exclusivamente pelo proprietário: `get_host_session_details` levanta exceção se `auth.uid()` não for o `host_id`, e a página redireciona para a visão de participante. Como a autenticação é anônima e vinculada ao armazenamento local de cada navegador, **uma TV com navegador próprio nunca consegue ser o Host** — ela é sempre outro usuário anônimo.

Na prática, hoje o telão só funciona espelhando a tela do próprio aparelho do Host. Em um bar com TV ou mini-PC dedicado, a rota é inacessível. Esta feature elimina essa limitação sem introduzir autenticação permanente.

## Clarifications

### Session 2026-08-17

- Q: Uma sessão pode ter mais de um telão pareado simultaneamente? → A: Sim. Bares com TV no salão e no balcão são o cenário previsto; o modelo de dados suporta N telões por sessão.
- Q: O pareamento sobrevive ao encerramento da sessão? → A: Não. O pareamento é escopado à sessão e desaparece com ela; cada noite exige novo pareamento, o que também limita a janela de exposição.
- Q: O telão pareado pode ver a lista de participantes? → A: Não. O telão lê apenas o que já exibe hoje: estado da sessão, fila e código de entrada. Nomes fora da fila não são expostos em uma tela pública de bar.
- Q: O telão pareado pode escrever alguma coisa? → A: Não, em nenhuma hipótese. É estritamente somente leitura; nenhuma RPC de escrita aceita a identidade de um telão.
- Q: Qual a validade do código de pareamento? → A: 5 minutos, tempo suficiente para o Host gerar o código e caminhar até a TV, e curto o bastante para que um código visto por terceiros perca valor rapidamente.
- Q: O código de pareamento pode ser usado mais de uma vez? → A: Não. É consumido no primeiro resgate bem-sucedido; parear uma segunda TV exige gerar outro código.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Host pareia a TV do bar (Priority: P1)

Como Host de uma sessão ativa, quero gerar um código no meu celular e digitá-lo na TV do bar para que a TV passe a exibir o telão daquela sessão.

**Why this priority**: É a razão de existir da feature. Sem ela o telão já construído permanece inutilizável no cenário real de uso.

**Independent Test**: Com uma sessão ativa, gerar o código no painel do DJ em um navegador e resgatá-lo em um navegador distinto, verificando que o segundo passa a exibir o telão.

**Acceptance Scenarios**:

1. **Given** uma sessão ativa e o Host autenticado, **When** ele aciona "Parear telão", **Then** o sistema exibe um código de 6 caracteres e o tempo restante de validade.
2. **Given** um navegador que não é o Host abrindo a rota do telão, **When** a página carrega, **Then** ela apresenta a tela de pareamento em vez de redirecionar para a visão de participante.
3. **Given** a tela de pareamento aberta, **When** o código válido é informado, **Then** aquele navegador passa a exibir o telão da sessão correspondente.
4. **Given** um telão já pareado, **When** a página é recarregada, **Then** o telão é exibido diretamente, sem pedir o código novamente.
5. **Given** o Host visualizando o código, **When** o código é resgatado por uma TV, **Then** o painel do DJ reflete que existe um telão pareado.

---

### User Story 2 - Bar com mais de uma TV (Priority: P2)

Como Host de um bar com telas no salão e no balcão, quero parear mais de uma TV na mesma sessão para que todas exibam a mesma fila.

**Why this priority**: Amplia o alcance da feature sem alterar seu núcleo, e o modelo de dados precisa suportá-la desde o início para evitar migration futura.

**Independent Test**: Parear dois navegadores distintos na mesma sessão e verificar que ambos exibem o telão e recebem atualizações simultaneamente.

**Acceptance Scenarios**:

1. **Given** uma TV já pareada, **When** o Host gera um novo código e pareia uma segunda TV, **Then** ambas exibem o telão da mesma sessão.
2. **Given** duas TVs pareadas, **When** a fila muda, **Then** ambas recebem a atualização em tempo real.
3. **Given** múltiplos telões pareados, **When** o Host consulta o painel, **Then** ele vê quantos telões estão pareados naquela sessão.

---

### User Story 3 - Telão pareado é estritamente somente leitura (Priority: P1)

Como responsável pela integridade do sistema, quero que um telão pareado jamais consiga alterar dados, para que uma tela exposta ao público não se torne um vetor de escrita.

**Why this priority**: A feature introduz um novo caminho de autorização. Se ele vazar permissão de escrita, o custo supera qualquer benefício.

**Independent Test**: Autenticado como telão pareado, tentar cada RPC de escrita fora da interface e verificar recusa em todas.

**Acceptance Scenarios**:

1. **Given** um telão pareado, **When** ele tenta avançar o status de uma música, **Then** o servidor recusa.
2. **Given** um telão pareado, **When** ele tenta pausar, retomar ou encerrar a sessão, **Then** o servidor recusa.
3. **Given** um telão pareado, **When** ele tenta criar ou cancelar uma entrada na fila, **Then** o servidor recusa.
4. **Given** um telão pareado, **When** ele tenta ler os dados de outra sessão, **Then** o servidor recusa.
5. **Given** um telão pareado, **When** ele consulta os dados da própria sessão, **Then** obtém apenas estado da sessão, fila e código de entrada — nunca a lista de participantes.

---

### User Story 4 - Telão acompanha o ciclo de vida da sessão (Priority: P1)

Como Host, quero que a TV reflita pausa, queda de conexão e encerramento exatamente como já faz hoje, para que a experiência do telão não regrida.

**Why this priority**: O telão já implementa esses estados. A feature não pode introduzir um caminho de acesso que os perca.

**Independent Test**: Com uma TV pareada, pausar, derrubar a rede e encerrar a sessão, verificando que os estados aparecem como no telão do Host.

**Acceptance Scenarios**:

1. **Given** uma TV pareada, **When** o Host pausa a sessão, **Then** a TV exibe o estado de pausa em tempo real.
2. **Given** uma TV pareada, **When** a conexão cai e volta, **Then** a TV recupera o estado autoritativo sem intervenção.
3. **Given** uma TV pareada, **When** o Host encerra a sessão, **Then** a TV exibe o estado de encerramento.
4. **Given** uma sessão encerrada, **When** a TV recarrega a página, **Then** ela não retoma o telão nem solicita novo pareamento válido.

---

### User Story 5 - Host revoga um telão (Priority: P3)

Como Host, quero remover um telão pareado para encerrar o acesso de uma tela que não deve mais exibir a sessão.

**Why this priority**: Desejável para controle, mas o encerramento da sessão já revoga tudo; sem esta história a feature continua viável.

**Independent Test**: Parear uma TV, revogá-la pelo painel do DJ e verificar que ela perde o acesso.

**Acceptance Scenarios**:

1. **Given** um telão pareado, **When** o Host o revoga, **Then** aquele navegador deixa de exibir o telão e volta à tela de pareamento.
2. **Given** dois telões pareados, **When** o Host revoga um, **Then** o outro permanece funcionando.

### Edge Cases

- Código expirado é informado: recusa com mensagem amigável e possibilidade de tentar outro código.
- Código já consumido é informado: mesma recusa amigável, sem revelar se o código existiu.
- Código inexistente é informado: resposta indistinguível da de código expirado ou consumido, para não permitir sondagem.
- Código de outra sessão é informado na rota de uma sessão diferente: recusado; o pareamento vale apenas para a sessão que o gerou.
- Tentativas repetidas de adivinhar códigos: a recusa não distingue os motivos (código inexistente, expirado ou já consumido produzem a mesma resposta); o espaço de códigos (6 caracteres em alfabeto de 32, ≈1,07 bilhão de combinações) e a validade de 5 minutos tornam a sondagem exaustiva inviável sem necessidade de um limite de tentativas por identidade.
- Host gera vários códigos sem resgatar: códigos anteriores não resgatados permanecem válidos até expirar, mas cada um só pareia uma TV.
- Sessão é encerrada enquanto a tela de pareamento está aberta: o resgate é recusado.
- Sessão é encerrada com telões pareados: todos os pareamentos deixam de conceder acesso.
- TV limpa o armazenamento local (modo quiosque): perde a identidade e precisa parear novamente.
- Duas TVs tentam resgatar o mesmo código simultaneamente: apenas uma vence; a outra recebe a recusa de código consumido.
- TV pareada abre a rota do painel do DJ: continua sem acesso; o pareamento concede apenas o telão.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o Host proprietário de uma sessão não encerrada gere um código de pareamento de uso único.
- **FR-002**: O código de pareamento MUST ter 6 caracteres do mesmo alfabeto legível já usado nos códigos de sala (sem `I`, `O`, `0`, `1`).
- **FR-003**: O código de pareamento MUST expirar em 5 minutos a partir da geração.
- **FR-004**: O código de pareamento MUST ser consumido no primeiro resgate bem-sucedido e recusado em resgates posteriores.
- **FR-005**: Somente o Host proprietário MUST conseguir gerar códigos para uma sessão.
- **FR-006**: O sistema MUST permitir que um navegador que não é o Host resgate um código válido e, com isso, torne-se um telão autorizado daquela sessão.
- **FR-007**: Uma sessão MUST suportar múltiplos telões pareados simultaneamente.
- **FR-008**: A rota do telão MUST apresentar a tela de pareamento quando o visitante não for nem o Host nem um telão autorizado, em vez de redirecionar.
- **FR-009**: Um telão autorizado MUST conseguir ler estado da sessão, fila e código de entrada da sessão pareada.
- **FR-010**: Um telão autorizado MUST NOT conseguir ler a lista de participantes.
- **FR-011**: Um telão autorizado MUST NOT conseguir executar qualquer operação de escrita, em nenhuma tabela, por nenhum caminho.
- **FR-012**: Um telão autorizado MUST NOT obter acesso a qualquer sessão além daquela para a qual foi pareado.
- **FR-013**: Um telão autorizado MUST receber atualizações de sessão e de fila em tempo real, com a mesma resiliência de reconexão do telão do Host.
- **FR-014**: O encerramento da sessão MUST revogar todos os pareamentos associados a ela.
- **FR-015**: O sistema MUST responder de forma indistinguível a código de pareamento inexistente, expirado ou já consumido, e a código de sala inexistente informado nesse mesmo fluxo.
- **FR-016**: O Host MUST conseguir visualizar quantos telões estão pareados na sessão corrente.
- **FR-017**: O Host SHOULD conseguir revogar individualmente um telão pareado.
- **FR-018**: Toda concessão e todo consumo de pareamento MUST ser decidido no banco, por RPC `SECURITY DEFINER`, nunca por lógica de cliente.

### Key Entities

- **Código de pareamento**: credencial efêmera de uso único emitida pelo Host, vinculada a uma sessão, com validade curta e marcação de consumo.
- **Telão pareado**: vínculo durável entre uma identidade anônima de navegador e uma sessão, concedendo leitura restrita ao subconjunto de dados que o telão exibe. Existe enquanto a sessão existir.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um Host consegue pôr uma TV de navegador próprio exibindo o telão em menos de 60 segundos, sem instalar nada e sem espelhamento de tela.
- **SC-002**: Um telão pareado exibe alterações de fila com a mesma latência percebida do telão do Host.
- **SC-003**: Nenhuma operação de escrita executada com identidade de telão pareado é aceita, verificado por teste automatizado no nível do banco para todas as RPCs de escrita existentes.
- **SC-004**: Nenhuma leitura de dados de participantes é possível com identidade de telão pareado, verificado por teste automatizado no nível do banco.
- **SC-005**: Duas TVs pareadas na mesma sessão exibem o mesmo estado simultaneamente.
- **SC-006**: Após o encerramento da sessão, nenhuma identidade previamente pareada consegue ler a fila ou os participantes daquela sessão; a leitura permanece restrita ao estado da sessão, o mínimo necessário para exibir a tela de encerramento.

## Assumptions

- A TV do bar possui um navegador capaz de executar a aplicação e de manter armazenamento local entre recarregamentos durante a noite. TVs que limpam o armazenamento a cada abertura exigirão novo pareamento, o que é aceitável.
- O pareamento não pretende ser um mecanismo de identidade durável do Host. A conta permanente continua sendo trabalho separado, motivada pelo histórico de sessões, e não é pré-requisito desta feature.
- O telão pareado exibe exatamente o mesmo conteúdo que o telão do Host exibe hoje; esta feature não altera o que a tela mostra, apenas quem pode abri-la.
- Digitar um código de 6 caracteres é viável no controle remoto ou teclado disponível na TV. Caso se mostre penoso na prática, um fluxo alternativo pode ser avaliado depois, sem alterar o modelo de dados.
- As políticas de leitura em vigor precisarão reconhecer a identidade de telão pareado para `sessions` e `queue`, já que o tempo real também respeita RLS. Um telão que passe na autorização da rota mas não nas políticas de leitura ficaria com a tela permanentemente vazia — este é o principal risco de implementação da feature.
