# Validação T049 — ausência de polling de servidor (Constitution III)

Data: 2026-08-19
Status: PASS

## Método

`grep` recursivo por `setInterval`/`setTimeout` em toda a superfície tocada por esta feature: `src/components/display/*`, `src/components/dj/DjDisplayPairingPanel.tsx`, `src/hooks/useDisplayPairings.ts`, `src/application/display-pairing/*`, e nos três hooks que efetivamente buscam dado (`useActiveQueue.ts`, `useSessionLifecycle.ts`, `useDisplayPairings.ts`). Cada ocorrência foi lida individualmente para confirmar se busca dado do servidor ou não.

## Ocorrências encontradas

| Arquivo | Timer | O que faz | É polling de dado? |
|---|---|---|---|
| `DjDisplayPairingPanel.tsx:57` | `setInterval(tick, 1000)` | Recalcula `expiresAtMs - Date.now()` localmente e atualiza o texto "Expira em M:SS" | **Não** — nenhum `fetch`/RPC dentro de `tick()`; `expiresAtMs` já foi buscado uma única vez, na resposta de `generate_display_pairing_code` |
| `DisplayExperience.tsx:78` *(arquivo protegido, pré-existente)* | `window.setTimeout(...)` | Janela de graça para sair do estado "recuperando" após voltar a ficar online | Não — não busca dado, só um timer de UI |
| `DisplayFullscreenButton.tsx` | `setTimeout(...)` ×2 | Esconde o botão de tela cheia após inatividade | Não — comportamento de UI, pré-existente, não desta feature |

Nenhum `setInterval`/`setTimeout` em `useDisplayPairings.ts`, `useActiveQueue.ts` ou `useSessionLifecycle.ts` — os três hooks que efetivamente carregam dado do servidor para as telas desta feature. Toda atualização de dado (contagem de telões pareados, conteúdo da fila, estado da sessão) chega exclusivamente por assinatura Realtime (`postgres_changes`) ou pela leitura inicial feita no Server Component.

## Conclusão

O único timer novo desta feature (`DjDisplayPairingPanel`'s contador regressivo) é cosmético por construção — resulta de uma subtração de datas em memória, nunca de uma chamada de rede — exatamente como a nota já registrada em `plan.md`: *"setInterval puramente cosmético sobre um expires_at já buscado — não é polling de servidor, constitution III não se aplica"*. Esta auditoria confirma essa nota lendo o código linha a linha, não apenas repetindo a intenção original.
