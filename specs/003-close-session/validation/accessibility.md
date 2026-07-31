# Auditoria de Acessibilidade (WCAG 2.1 AA)

- **Foco e Teclado**: 
  - Todos os diálogos usam `@radix-ui/react-alert-dialog`, garantindo `FocusTrap` e `aria-modal="true"`.
  - A tecla *Escape* tem `e.preventDefault()` bloqueando fechamento acidental na modal de encerramento, forçando ação pelo botão (Acessibilidade de erro-prevenção - WCAG 3.3.4).
- **Feedback**:
  - Mensagens de erro/offline usam alertas assertivos (`aria-live="polite"`). Toasts da Sonner reportam atualizações do Supabase sem exigir foco.
  - Indicadores de carregamento (Spinner / Loader2) foram atrelados ao estado interno, além da flag de `disabled` no botão, atendendo ao WCAG 1.4.1 (Uso de Cor).
- **Touch Targets**:
  - Refatorados `QueueItem`, `SessionStatusToggle`, `CloseSessionButton` para `min-h-[48px]` e padding, respeitando WCAG 2.5.5 (Target Size).
