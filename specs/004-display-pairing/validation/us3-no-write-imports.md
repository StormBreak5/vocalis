# Validação US3 — telão pareado é estritamente somente leitura (T040)

Data: 2026-08-18
Status: PASS

## Escopo auditado

Todos os arquivos não-teste de `src/components/display/*` e `src/application/display-pairing/*`:

- `src/components/display/DisplayClosedState.tsx`
- `src/components/display/DisplayConnectionBanner.tsx`
- `src/components/display/DisplayEmptyState.tsx`
- `src/components/display/DisplayExperience.tsx`
- `src/components/display/DisplayFullscreenButton.tsx`
- `src/components/display/DisplayHeader.tsx`
- `src/components/display/DisplayJoinPanel.tsx`
- `src/components/display/DisplayNextUp.tsx`
- `src/components/display/DisplayNowSinging.tsx`
- `src/components/display/DisplayPairingScreen.tsx`
- `src/components/display/DisplayQueuePreview.tsx`
- `src/components/display/DisplayShell.tsx`
- `src/components/display/display-queue-presentation.ts`
- `src/application/display-pairing/generate-display-pairing-code.action.ts`
- `src/application/display-pairing/get-display-session-details.ts`
- `src/application/display-pairing/list-paired-displays.ts`
- `src/application/display-pairing/redeem-display-pairing-code.action.ts`

## Método

`grep` recursivo pelos cinco identificadores de RPC de escrita pré-existentes em todo o escopo acima: `create-queue-entry.action`, `cancel-queue-entry.action`, `update-queue-status.action`, `update-session-status.action`, `close-session.action`. Em seguida, listagem de **todo** import `@/src/application/*` no mesmo escopo, para conferir manualmente cada resultado (não só os cinco proibidos).

## Resultado

Zero ocorrências dos cinco identificadores proibidos.

Os únicos imports de `@/src/application/*` em todo o escopo são:

- `DisplayPairingScreen.tsx` → `redeem-display-pairing-code.action` (RPC desta própria feature; cria o vínculo de pareamento, não escreve em `sessions`/`queue`/`participants`)
- `generate-display-pairing-code.action.ts` → `expect-single-rpc-row` (utilitário compartilhado) e `session-error.mapper` (mapeador de erro compartilhado)
- `get-display-session-details.ts` → `expect-single-rpc-row`
- `redeem-display-pairing-code.action.ts` → `expect-single-rpc-row` e `session-error.mapper`

Nenhum dos quatro é uma RPC de escrita em dados de negócio (fila, status de sessão ou participantes). `generate_display_pairing_code` e `revoke_display_pairing` — as duas RPCs de escrita host-only desta própria feature — não são chamadas de lugar nenhum deste escopo (são chamadas apenas por `DjDisplayPairingPanel.tsx`, fora de `src/components/display/`, e sua recusa a identidade de telão pareado já é coberta por `supabase/tests/004_display_pairing_privileges.sql`, gate de SC-003).

Este resultado estático é reforçado por um teste automatizado equivalente, `src/components/display/__tests__/display-architecture.test.ts`, que falha a suíte de unidade se qualquer import de `@/src/application/*` fora da whitelist (`redeem-display-pairing-code.action`) aparecer em `src/components/display/*`.

## Cobertura combinada de US3

US3 (`nenhuma identidade de telão pareado consegue escrever em nenhuma tabela nem ler a lista de participantes`) fica satisfeita pela combinação de três evidências independentes, nenhuma delas dependente de código de aplicação novo além do já auditado aqui:

- **T015 / SC-003** (`supabase/tests/004_display_pairing_privileges.sql`): identidade de telão pareado chamando diretamente as sete RPCs de escrita do projeto (as cinco pré-existentes mais `generate_display_pairing_code` e `revoke_display_pairing`) — todas recusadas.
- **T016 / SC-004** (`supabase/tests/004_display_pairing_rls.sql`): identidade de telão pareado tentando `SELECT * FROM participants` diretamente — zero linhas, em qualquer estado da sessão.
- **T040** (este documento): a superfície de aplicação que a UI do telão pareado efetivamente usa nunca invoca nenhuma RPC de escrita, então não há caminho de UI que sequer tente o que T015 já prova estar bloqueado no banco.
