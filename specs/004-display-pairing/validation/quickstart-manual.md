# Validação T051 — Verificação manual (equivalente a SC-001)

Data: 2026-08-19
Status: PASS — todos os 10 passos do quickstart.md §8 executados manualmente, com sucesso

## Ambiente

Executado contra Supabase local (`npm run test:db:prepare` seguido de `npm run app:local:production`), **não** `npm run dev` — `.env.local` deste repositório aponta para um projeto Supabase de produção, e o quickstart original (§8, passo 1) sugere `npm run dev`, que teria usado essa configuração por engano. `npm run app:local:production` é o script já existente no projeto (`scripts/app/run-local-production.mjs`) desenhado exatamente para isto: valida que o Supabase local está de pé, sobrescreve as variáveis de ambiente nos processos filhos, faz build de produção e sobe o servidor em `127.0.0.1:3000`. Navegação feita via Browser tool (Chromium controlado por CDP).

## Nota de metodologia — identidades simultâneas numa única aba de navegador

O Browser tool usado para esta verificação abre várias ABAS, mas todas compartilham o mesmo perfil/cookie jar do navegador — diferente do Playwright (`browser.newContext()`) que a suíte E2E automatizada usa, que isola cookies por contexto. Isso significa que **duas abas do mesmo navegador não são duas identidades diferentes** por padrão: a segunda aba herda o cookie de sessão anônima da primeira.

Descobri isso na prática ao tentar pausar a fila pelo painel do Host depois de já ter limpado `localStorage`/cookies de uma segunda aba para simular a TV — a ação de pausa falhou com "Sala não encontrada ou indisponível" porque o cookie compartilhado já não era mais o do Host, e sim o da TV (a limpeza de cookie de uma aba afeta o jar inteiro, todas as abas). Not a bug do produto — é uma característica da ferramenta de automação usada para esta verificação manual, não do app.

**Correção de método**: capturei o valor de `document.cookie` de cada identidade logo após ela ser estabelecida (Host, TV) e alternei entre os dois valores manualmente antes de cada ação que exigia uma identidade específica, em vez de confiar em abas simultâneas. Deixado registrado aqui para quem repetir esta verificação no futuro não tropeçar na mesma coisa.

## Passos executados (quickstart.md §8)

| # | Passo | Resultado |
|---|---|---|
| 1 | Criar sessão como Host | Sessão `Z6J33Y` criada |
| 2 | Painel do DJ → "Parear telão", anotar código | Código `C575P5` gerado, "Expira em 4:58" |
| 3 | Identidade nova → `/sala/Z6J33Y/display` | Tela de pareamento exibida — sem redirect |
| 4 | Digitar o código | Telão ao vivo passou a ser exibido imediatamente |
| 5 | Recarregar a aba da TV | Telão continuou ao vivo, sem pedir código de novo |
| 6 | Conferir contagem no painel do DJ | "1 pareado" / "Telão 1" / "Pareado às 21:50" — atualizou sozinho, sem reload do painel |
| 7 | Pedido de música por um terceiro participante | Nome real do cantor (`Cantor Manual`) e música apareceram na TV ao vivo, sem reload — confirma visualmente a correção do `list_active_queue` (R15): nada de fallback `"Cantor"` genérico |
| 8 | Pausar a sessão no painel | TV mostrou "Novas entradas e pedidos estão pausados." ao vivo, sem reload |
| 9 | Revogar o telão no painel | Painel foi a "0 pareados" ao vivo; a TV, **sem reload**, continuou mostrando o conteúdo normalmente (confirma R16 na prática: revogação não é instantânea) — só depois de recarregar a página da TV é que a tela de pareamento reapareceu |
| 10 | Encerrar a sessão | A TV (re-pareada com um código novo para este passo — ver nota abaixo) mostrou `Sala encerrada` **ao vivo, sem reload**; um reload adicional confirmou que o estado permanece encerrado e não volta a pedir pareamento |

**Nota sobre o passo 10**: como o passo 9 já tinha revogado a única TV pareada, pareei a mesma identidade de novo com um código novo antes de encerrar a sessão — isso teve o benefício extra de confirmar manualmente que re-parear a mesma identidade depois de revogada funciona (R10, `ON CONFLICT ... DO UPDATE SET revoked_at = NULL`), algo que só estava coberto por pgTAP e não por observação direta na UI até agora.

## Relação com a suíte automatizada

Esta verificação manual não substitui T039/T041/T042/T047 (Playwright, identidades genuinamente isoladas, já executados e verdes) — ela confirma que o que os testes automatizados provam também **parece e se comporta corretamente para um humano operando a UI real**, com foco no que só um teste manual pega: se a mensagem certa aparece na hora certa, se a contagem "sente" instantânea, se a tela de pareamento é legível. As únicas duas coisas que o teste automatizado prova com mais rigor do que esta verificação manual — duas TVs simultâneas genuinamente isoladas (T042) e a TV revogada permanecendo inalterada enquanto a outra continua funcionando (T047) — não foram repetidas aqui por causa da limitação de identidade compartilhada descrita acima; ficam cobertas pela suíte automatizada, não por esta verificação.
