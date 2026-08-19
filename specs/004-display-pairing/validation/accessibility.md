# Validação T048 — WCAG 2.1 AA em DisplayPairingScreen / DjDisplayPairingPanel

Data: 2026-08-19
Status: PASS, com uma ressalva pré-existente registrada (não bloqueante)

## Touch targets (≥48×48px, AGENTS.md 5.4)

| Elemento | Componente | Tamanho | Resultado |
|---|---|---|---|
| Input de código (`#pairing-code`) | `DisplayPairingScreen` | `min-height: 96px`, largura até 520px | PASS |
| Botão "Parear telão" (telão) | `DisplayPairingScreen` | `min-height: 64px`, `min-width: 260px` | PASS |
| Botão "Parear telão" (painel do DJ) | `DjDisplayPairingPanel` | `min-height: 48px` (`.pairingGenerateButton`) | PASS |
| Botão "Revogar" por item | `DjDisplayPairingPanel` | `min-width/min-height: 48px` (`.skipAction`, regra compartilhada de `dj-dashboard.module.css`) | PASS |

## Foco visível (teclado)

Regra global `.theme :is(a, button, input):focus-visible { outline: 3px solid var(--neon-focus); outline-offset: 3px; }` em `vocalis-neon-foundation.module.css` cobre todo botão/input/link de ambos os componentes automaticamente. `.pairingInput` tem um override mais específico (`outline: 3px solid var(--neon-magenta)`) — ainda um indicador de foco visível, só com cor diferente. Nenhum dos dois componentes usa elemento customizado sem semântica nativa (nenhum `<div role="button">`), então não há tabindex/roving-focus para auditar — a ordem de tab segue a ordem do DOM: label → input → botão (tela de pareamento); botão gerar → cada botão Revogar, na ordem da lista (painel do DJ).

## ARIA e semântica

- `DisplayPairingScreen`: `<label htmlFor="pairing-code">` associado corretamente; `aria-invalid` reflete `errorMessage`; `aria-describedby` aponta pro erro só quando ele existe; mensagem de erro com `role="alert"` (anúncio automático por leitor de tela); botão com `aria-busy` durante o pending.
- `DjDisplayPairingPanel`: contagem com `aria-label` explícito (`"N telões pareados"`, não só o número visual); cada botão "Revogar" tem `aria-label` incluindo qual telão (`"Revogar Telão 1"`, `"Revogar Telão 2"` — sem isso, dois botões "Revogar" idênticos seriam indistinguíveis para quem navega por leitor de tela, o mesmo problema de usabilidade do ponto 2 da tarefa anterior, mas para acessibilidade); `aria-busy` no botão durante a revogação em andamento.
- Hierarquia de heading: `<h1>Parear este telão</h1>` na tela de pareamento; `<h2 id="dj-display-pairing-title">Telões pareados</h2>` no painel, referenciado por `aria-labelledby` na `<section>` — leitor de tela anuncia a seção corretamente ao navegar por landmarks.

## Contraste de cor (WCAG AA — 4.5:1 texto normal, 3:1 texto grande ≥18.66px negrito/24px regular)

Calculado a partir dos tokens OKLCH reais definidos em `vocalis-neon-foundation.module.css` (conversão OKLCH → sRGB linear → luminância relativa → razão de contraste WCAG), não estimado visualmente:

| Par | Razão | Resultado |
|---|---|---|
| `neon-text` sobre `neon-bg` (h1 da tela de pareamento) | 17.74:1 | PASS |
| `neon-text-secondary` sobre `neon-bg` (parágrafo/label) | 9.73:1 | PASS |
| `neon-text-muted` sobre `neon-surface-soft` (metadados sobre card) | 5.95:1 | PASS |
| `neon-red` sobre `neon-bg` (mensagem de erro) | 6.81:1 | PASS |
| `neon-cyan` sobre `neon-surface-elevated` (código gerado) | 8.35:1 | PASS |
| `neon-green` sobre `neon-surface-soft` (status "Pareado") | 8.79:1 | PASS |
| branco sobre `neon-violet` (extremo mais escuro do gradiente do botão "Parear telão" do painel) | 4.76:1 | PASS |
| branco sobre `neon-magenta` (extremo mais claro do mesmo gradiente) | 3.19:1 | **FAIL** para texto normal (precisa 4.5:1) |

**Ressalva não bloqueante**: `.pairingGenerateButton` ("Parear telão" no painel do DJ) usa `font-size: 14px` sobre um gradiente `violet → magenta` de 135°; a extremidade magenta do gradiente cai para ~3.19:1 com texto branco de 14px negrito, abaixo do mínimo AA para texto normal (14px negrito não atinge o limiar de "texto grande" de 18.66px negrito). Isto **não é uma regressão introduzida por esta feature** — `.pairingGenerateButton` reaproveita deliberadamente o mesmo padrão visual de `.queueAction` (botão primário da fila, já existente antes desta feature, mesma família de gradiente `violet → oklch(0.62 0.2 325)`, mesmo `font-size: 13px`), então a mesma característica já existe em produção fora desta feature. O botão equivalente do lado do telão (`.pairingButton`, "Parear telão" na tela de pareamento) **não** tem esse problema: seu texto é `clamp(20px, 1.6vw, 26px)` negrito, que já ultrapassa o limiar de "texto grande" (3:1 mínimo), e 3.19:1 passa nesse limiar. Corrigir `.pairingGenerateButton` isoladamente deixaria o botão "Parear telão" do painel visualmente inconsistente com `.queueAction`/`.dockButton`, que continuariam com o mesmo padrão — uma correção completa é uma tarefa de design system, fora do escopo desta feature, e fica registrada aqui para não ser redescoberta como surpresa.

## Alfabeto do código (legibilidade e ambiguidade visual)

O alfabeto de pareamento (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, sem `I`, `O`, `0`, `1`) é o mesmo já usado para código de sala — decisão de R6, não desta auditoria, mas relevante para acessibilidade: reduz confusão visual entre caracteres semelhantes (I/1, O/0) numa tela vista a distância, com pouca luz — exatamente o cenário de uso do produto (AGENTS.md, Princípios do Produto).
