# Validação da US5 (Usuário volta ao início)

1. **Cleanup Seguro**:
   - `session-room-cleanup.ts` e `SessionClosedDialog.tsx` se integram corretamente.
   - O cleanup não quebra tokens nem remove chaves de Auth Supabase. Ele apenas faz teardown da sala ativa.
   
2. **Navegação `replace`**:
   - Para evitar que o usuário tente "Voltar" (Back button) e acesse uma página zumbi da sala, o método utilizado foi `router.replace('/')` ao invés de `router.push('/')`. Testes no Vitest validaram a chamada desse stub, e o E2E endossou o comportamento sem resquícios.
   
3. **Múltiplas abas / Ausência de BFCache Preso**:
   - Como implementamos o Service Worker para *ignorar* rotas `/sala/*`, ao tentar utilizar botões nativos do navegador o usuário sempre engatilha uma requisição ao Server Component, onde a nossa `getSessionStatus` intercepta o estado `closed` e reativa imediatamente o bloqueio.

Conclusão: A US5 está executada com sucesso.
