# Auditoria Mobile & UX em Bares

- **Contexto (Pouca Iluminação)**: 
  - A aplicação já implementa Tailwind Dark Mode (`bg-background` invertido) compatível com OLEDs. Nossas modais Radix tem overlay com `backdrop-blur-sm` e fundos escuros (`bg-zinc-900`) nas zonas críticas, provendo contraste adequado.
- **Uso com Uma Mão**:
  - Os botões no `QueueItem` estão organizados com `flex-wrap gap-2` e `min-h-[48px]`, facilitando o acionamento via polegar. O layout evita elementos agrupados na ponta superior da tela.
- **Conectividade Intermitente**:
  - O fallback *fail-closed* testado pelas US3/US4 preserva o app renderizando um Dialog por cima caso a rede retorne sem websocket (BFCache block via `sw.js` exclusão). Botões que interagem com Server Actions monitoram `navigator.onLine` para bloquear imediatamente cliques offline, sem gerar spinners infinitos.
