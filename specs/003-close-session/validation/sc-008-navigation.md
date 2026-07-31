# Validação SC-008: Navegação de Saída Rápida

## Requisito
SC-008: O usuário deve retornar ao início após fechar a modal de 'Sessão Encerrada' em tempo máximo de 5 segundos.

## Resultado
Aprovado.
- Navegação testada via E2E `close-session-leave.spec.ts`.
- Tempo aferido utilizando `performance.now()`.
- Roteamento `router.replace('/')` no Next.js App Router mostrou latência média inferior a 500ms em loopback local Chromium, sendo amplamente satisfatório sob o limite de 5000ms.
