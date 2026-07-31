# Feature Specification: Encerramento de Sessão

**Feature Branch**: [003-close-session]

**Created**: 2026-07-29

**Status**: Ready for Implementation

**Input**: User description: "Encerramento definitivo de sessão pelo Host, com bloqueio de operações e notificação em tempo real para todos os participantes."

## Clarifications

### Session 2026-07-29

- Q: Ao selecionar “Voltar para o início”, a sessão anônima do participante deve ser mantida ou encerrada? → A: Manter a sessão anônima; limpar somente sessionId, participantId, cache da sala e canais Realtime.
- Q: Como ordenar corridas entre close_session e outras operações de escrita? → A: close_session, join_session, create_queue_entry e cancel_queue_entry bloqueiam a mesma linha de sessions antes de validar o status; a ordem de aquisição do bloqueio define o resultado.
- Q: Quais dados podem ser lidos após o encerramento? → A: Participantes anteriores leem somente o estado mínimo necessário para detectar closed e exibir o modal; o Host proprietário mantém leitura completa dos dados preservados.
- Q: Como o banco deve garantir as transições e a coerência de closed_at? → A: Usar RPC para autorização, bloqueio e idempotência; trigger para impedir transições inválidas; e constraint para manter coerência entre status e closed_at.
- Q: Como close_session identifica a sessão e responde a casos inexistentes, não autorizados ou já encerrados? → A: Recebe somente session_id; inexistente e não autorizado retornam o mesmo erro amigável; closed retorna sucesso idempotente com o closed_at original.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Host encerra a sala definitivamente (Priority: P1)

Como Host proprietário de uma sessão ativa ou pausada, quero encerrá-la após confirmação explícita para que a sala deixe de aceitar qualquer nova atividade.

**Why this priority**: É a ação central da feature e estabelece o estado que governa todos os demais comportamentos.

**Independent Test**: Autenticar o proprietário de uma sessão ativa ou pausada, confirmar o encerramento e verificar o estado final e o momento registrado.

**Acceptance Scenarios**:

1. **Given** uma sessão ativa e o Host proprietário autenticado, **When** ele seleciona “Encerrar sala”, **Then** o sistema exibe confirmação de que a ação é definitiva.
2. **Given** a confirmação aberta, **When** o Host desiste, **Then** a sessão permanece inalterada.
3. **Given** uma sessão ativa ou pausada, **When** o proprietário confirma, **Then** sua identidade é validada, a sessão muda para closed e o momento é registrado.
4. **Given** uma solicitação em andamento, **When** o Host tenta confirmar novamente, **Then** envios duplicados são impedidos e o carregamento permanece visível.
5. **Given** falha antes da confirmação do servidor, **When** a operação retorna erro, **Then** nenhum sucesso é apresentado e uma mensagem amigável é exibida.
6. **Given** encerramento persistido sem resposta ao cliente, **When** o Host tenta novamente ou reconecta, **Then** o mesmo estado final é recuperado sem inconsistência.

---

### User Story 2 - Todos recebem o encerramento sem F5 (Priority: P1)

Como Host ou participante conectado, quero ser avisado imediatamente quando a sala for encerrada para não interagir com uma sessão terminada.

**Why this priority**: Todos precisam observar o mesmo estado em uma experiência ao vivo.

**Independent Test**: Manter Host e múltiplos participantes conectados, encerrar em um cliente e verificar o modal nos demais sem atualizar a página.

**Acceptance Scenarios**:

1. **Given** clientes conectados, **When** a sessão muda para closed, **Then** todos recebem a alteração em tempo real e exibem o modal final.
2. **Given** o modal aberto, **When** o usuário clica fora, pressiona Escape ou usa teclado, **Then** ele permanece aberto, sem ação de fechar e com foco acessível.
3. **Given** escrita local ainda não confirmada, **When** o cliente identifica closed, **Then** a operação é cancelada quando possível ou seu resultado tardio é ignorado.
4. **Given** saída pela ação oferecida, **When** a navegação termina, **Then** o cliente deixa de receber atualizações daquela sessão.

---

### User Story 3 - Estado final é recuperado após desconexão ou refresh (Priority: P1)

Como participante ou Host que abre, atualiza ou retoma a sala após o encerramento, quero ver o estado final mesmo sem ter recebido o evento ao vivo.

**Why this priority**: A conexão em bares é instável e o encerramento não pode depender de evento transitório.

**Independent Test**: Desconectar um cliente, encerrar a sessão em outro e depois atualizar ou reabrir a rota no cliente desconectado.

**Acceptance Scenarios**:

1. **Given** sessão encerrada, **When** Host ou participante abre ou atualiza a rota, **Then** a consulta inicial apresenta o modal final.
2. **Given** participante desconectado antes do encerramento, **When** ele reconecta, **Then** closed é recuperado mesmo sem o evento.
3. **Given** sessão encerrada, **When** alguém tenta entrar pelo código, **Then** a entrada é recusada com “Esta sala já foi encerrada.”

---

### User Story 4 - Toda escrita é bloqueada após closed (Priority: P1)

Como usuário de sala encerrada, quero que nenhuma alteração adicional seja aceita para preservar seu histórico.

**Why this priority**: O encerramento só é definitivo se o servidor impedir todas as escritas posteriores.

**Independent Test**: Tentar entrar, adicionar música, cancelar música e alterar a fila depois de closed, inclusive fora da interface.

**Acceptance Scenarios**:

1. **Given** sessão closed, **When** alguém tenta entrar, **Then** o servidor recusa com mensagem amigável.
2. **Given** sessão closed, **When** alguém tenta adicionar música, **Then** nenhum pedido é criado.
3. **Given** sessão closed, **When** alguém tenta cancelar ou alterar música, **Then** o registro permanece inalterado.
4. **Given** controle ainda visível por atraso, **When** o cliente tenta escrever, **Then** o servidor recusa.
5. **Given** sessão closed, **When** seus dados são consultados, **Then** participantes e fila permanecem preservados.

---

### User Story 5 - Usuário volta ao início (Priority: P2)

Como Host ou participante diante do aviso final, quero voltar ao início com uma ação para iniciar outra jornada.

**Why this priority**: É a saída clara do estado final.

**Independent Test**: Acionar “Voltar para o início” e verificar destino, limpeza do contexto e fim das atualizações.

**Acceptance Scenarios**:

1. **Given** modal final aberto, **When** o usuário seleciona “Voltar para o início”, **Then** o contexto local da sala é limpo e ele vai para /.
2. **Given** retorno ao início, **When** uma nova jornada começa, **Then** nenhum dado ou atualização da sala anterior interfere.

### Edge Cases

- Host fica offline antes de confirmar: nenhum sucesso local é mostrado.
- Conexão cai durante o encerramento: o resultado permanece desconhecido até recuperar o estado confirmado.
- Encerramento persiste, mas a resposta não chega: repetição retorna closed sem mudar closed_at.
- Chamadas simultâneas: a primeira transição válida define o resultado; as demais convergem para ele.
- Escrita concorre com encerramento: todas as operações relevantes bloqueiam a mesma linha de sessions antes de validar o status; quem adquirir o bloqueio e confirmar primeiro vence. Se close_session confirmar primeiro, a escrita é recusada; se a escrita confirmar primeiro, ela permanece válida e o encerramento ocorre em seguida.
- Participante retorna depois de desconexão ou perde o evento: carga ou reconexão recupera closed.
- Evento chega duplicado: modal e efeitos não são duplicados.
- Rota é aberta diretamente após closed: consulta inicial exibe o estado final.
- Outro Host, participante ou usuário anônimo tenta encerrar: operação recusada sem expor dados sensíveis.
- Proprietário repete a ação: closed_at original é preservado.
- Há músicas em qualquer estado: nenhuma é automaticamente cancelada, concluída ou removida.
- Tentativa de dispensar o modal por clique, Escape, gesto ou voltar: enquanto na rota, o aviso permanece dominante; a saída suportada é “Voltar para o início”.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O Host proprietário DEVE poder solicitar encerramento de sessão active ou paused.
- **FR-002**: A tela do DJ DEVE mostrar “Encerrar sala” com estilo destrutivo e toque mínimo de 48 × 48 px.
- **FR-003**: O sistema DEVE pedir confirmação explícita e informar que a ação é definitiva.
- **FR-004**: A operação DEVE mostrar carregamento, impedir duplicidade e não comunicar sucesso antes da confirmação do servidor.
- **FR-005**: Confirmação autorizada DEVE mudar active ou paused para closed e preencher closed_at no primeiro encerramento. Uma constraint DEVE exigir closed_at preenchido exatamente quando status = closed e vazio nos demais estados.
- **FR-006**: Closed DEVE ser final nesta feature e não pode voltar para active ou paused. Um trigger de banco DEVE impedir a reversão e demais transições inválidas por qualquer caminho de escrita, sem bloquear as transições active ↔ paused já estabelecidas.
- **FR-007**: Chamadas repetidas DEVEM ser idempotentes e preservar closed_at. Se a sessão já estiver closed, close_session DEVE retornar sucesso com o status e o closed_at originais.
- **FR-008**: Host e participantes conectados DEVEM receber closed sem F5 e sem polling.
- **FR-009**: As telas DEVEM consultar o estado na carga inicial e após reconexão. Em sessão closed, participantes anteriores DEVEM receber somente os dados mínimos necessários para identificar a sessão e exibir o modal; o Host proprietário pode continuar lendo os dados completos preservados.
- **FR-010**: Ao identificar closed, a interface DEVE remover ou desabilitar toda escrita.
- **FR-011**: Ao identificar closed, operações locais pendentes DEVEM ser canceladas quando possível ou ter resultados tardios ignorados.
- **FR-012**: Todos DEVEM ver modal com título “Sala encerrada”, mensagem “O DJ encerrou esta sessão de karaokê.” e ação “Voltar para o início”.
- **FR-013**: O modal NÃO DEVE fechar por clique externo ou Escape, NÃO DEVE ter botão de fechar e DEVE conter o foco.
- **FR-014**: A ação final DEVE limpar sessionId, participantId, estado da fila, snapshot offline, demais dados locais específicos da sala e seus canais Realtime antes de redirecionar para /. A sessão anônima do participante e a autenticação normal do Host DEVEM ser preservadas.
- **FR-015**: Entrada em closed DEVE ser recusada com mensagem amigável, preferencialmente “Esta sala já foi encerrada.”
- **FR-016**: Novos pedidos em closed DEVEM ser recusados pelo servidor.
- **FR-017**: Cancelamentos e alterações de músicas em closed DEVEM ser recusados pelo servidor.
- **FR-018**: Encerramento, entrada, criação e cancelamento DEVEM validar closed em ambiente confiável, não só no frontend.
- **FR-019**: Encerrar NÃO DEVE excluir participantes, músicas ou fila.
- **FR-020**: Encerrar NÃO DEVE alterar automaticamente status das músicas.
- **FR-021**: Falhas e bloqueios DEVEM produzir mensagens amigáveis sem detalhes internos.

### Non-Functional Requirements

- **NFR-001**: A comunicação DEVE ser orientada a eventos, sem consultas periódicas.
- **NFR-002**: O fluxo DEVE tolerar desconexões, respostas perdidas e eventos ausentes ou duplicados, convergindo após carga ou reconexão.
- **NFR-003**: Modal e ação DEVEM funcionar em mobile, dark mode e uso com uma mão.
- **NFR-004**: A interface DEVE atender WCAG 2.1 AA, incluindo foco, teclado, contraste e semântica.
- **NFR-005**: Operações assíncronas DEVEM ter feedback imediato e funcionar sob conexão lenta.
- **NFR-006**: O isolamento entre sessões DEVE ser autorizado; filtro por identificador é apenas complementar. Usuários externos não podem consultar uma sessão encerrada por UUID ou código, e participantes anteriores não podem usar a leitura mínima de status para acessar participantes ou fila.
- **NFR-007**: Lint, typecheck, testes e build DEVEM passar sem erros.

### Security Requirements

- **SR-001**: Encerramento DEVE ocorrer exclusivamente por close_session, que recebe somente session_id e deriva a identidade do Host por auth.uid(). A operação não aceita código da sala, host_id ou identidade do proprietário enviados pelo cliente.
- **SR-002**: A operação DEVE confirmar que auth.uid corresponde ao host_id persistido; participantes e outros Hosts DEVEM ser recusados. Para impedir enumeração, session_id inexistente e sessão não pertencente ao chamador DEVEM produzir o mesmo erro de domínio amigável, sem revelar qual condição ocorreu.
- **SR-003**: A autorização NÃO DEVE confiar em host_id enviado pelo cliente.
- **SR-004**: UPDATE direto e irrestrito de sessions NÃO DEVE ser permitido. close_session DEVE ser a operação exclusiva de encerramento e concentrar autorização, bloqueio da linha e idempotência, enquanto trigger e constraint protegem a integridade contra outros caminhos de escrita.
- **SR-005**: Se houver operação com privilégios elevados, ela DEVE usar o menor privilégio, search_path fixo e EXECUTE somente para papéis necessários.
- **SR-006**: SECURITY DEFINER só DEVE ser usado se necessário e não pode ampliar a capacidade além do encerramento autorizado.
- **SR-007**: close_session, join_session, create_queue_entry e cancel_queue_entry DEVEM bloquear a mesma linha de sessions antes de validar seu status e decidir a escrita. A aquisição do bloqueio define a ordem de serialização; nenhuma escrita pode ser aceita após closed ter sido confirmado.
- **SR-008**: RLS DEVE proteger os dados; filtro Realtime por session id NÃO constitui autorização. As políticas de leitura DEVEM permitir ao Host proprietário acesso completo à sessão encerrada e limitar participantes anteriores ao estado mínimo necessário para o modal, sem leitura da fila ou da lista de participantes após closed.
- **SR-009**: Concorrência NÃO DEVE contornar autorização, reverter closed ou substituir closed_at.

### Acceptance Criteria

- **AC-001**: Somente o Host proprietário autenticado encerra active ou paused.
- **AC-002**: Participantes, anônimos e outro Host não conseguem encerrar.
- **AC-003**: A sessão muda para closed e closed_at é preenchido uma vez.
- **AC-004**: Todos os clientes conectados recebem closed sem F5 e mostram o modal.
- **AC-005**: O modal não pode ser descartado e funciona com toque e teclado.
- **AC-006**: A ação final limpa o contexto, encerra atualizações e leva para /.
- **AC-007**: Entrada, pedido, cancelamento e alterações são bloqueados pelo servidor.
- **AC-008**: Refresh, abertura direta e reconexão continuam mostrando closed.
- **AC-009**: Repetições e concorrência convergem para um estado e um closed_at; chamada repetida recebe sucesso idempotente com os valores originais, enquanto sessão inexistente e falta de propriedade são indistinguíveis na resposta de erro.
- **AC-010**: Participantes, músicas e fila são preservados sem mudança automática.
- **AC-011**: Não há sucesso antes de confirmação ou recuperação do servidor.
- **AC-012**: Lint, typecheck, testes e build passam.

### Out of Scope

- Reabertura ou exclusão da sessão.
- Exclusão de participantes ou fila.
- Cancelamento automático da fila ou alteração automática de músicas.
- Relatórios, histórico visual, avaliações ou controle avançado de status.
- Temporizador de encerramento.

### Key Entities *(include if feature involves data)*

- **Session**: Sala com proprietário, código, status active, paused ou closed e closed_at opcional. Closed é final nesta feature; closed_at deve estar preenchido se, e somente se, o status for closed. Active e paused continuam podendo transitar entre si conforme a funcionalidade existente.
- **Participant**: Pessoa da sessão; é preservada, mas novas participações são bloqueadas após closed.
- **Queue Entry**: Pedido associado à sessão e participante; permanece preservado e inalterado pelo encerramento.
- **Authenticated User**: Identidade confiável usada para verificar o proprietário.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos testes, apenas o proprietário autenticado encerra sua sessão.
- **SC-002**: Em conexão estável, 95% dos clientes exibem o modal em até 2 segundos após confirmação, e 100% sem F5.
- **SC-003**: Em 100% dos testes de refresh, abertura direta, reconexão e perda de evento, o cliente recupera closed.
- **SC-004**: Em 100% dos testes após closed, entradas, pedidos e cancelamentos são recusados sem modificar dados.
- **SC-005**: Em pelo menos 20 chamadas repetidas ou concorrentes, todas convergem para um closed e um closed_at.
- **SC-006**: Em 100% dos cenários de resposta perdida, não há sucesso prematuro e o resultado é recuperado.
- **SC-007**: Em 100% dos testes com fila existente, participantes, músicas, quantidade e status são preservados.
- **SC-008**: Usuários chegam ao início com uma ação, em até 5 segundos em conexão estável.
- **SC-009**: O modal passa integralmente na auditoria móvel e de acessibilidade definida para a feature.
- **SC-010**: 100% das verificações obrigatórias de qualidade terminam sem erros.

## Assumptions

- A autenticação existente identifica Host proprietário e participantes.
- Sessões existentes podem ser migradas para active, paused e closed; closed_at fica vazio quando não encerrada.
- O primeiro encerramento confirmado define closed_at; repetições não o atualizam.
- “Imediatamente” significa até 2 segundos para 95% dos clientes em conexão estável; offline converge após reconexão.
- Escrita confirmada antes do encerramento permanece válida; operação avaliada após closed é recusada.
- A limpeza final afeta apenas dados e atualizações da sala, preservando a sessão anônima do participante, a autenticação normal do Host, a identidade geral e preferências legítimas.
- A interface reutilizará padrões visuais e de acessibilidade do produto.

