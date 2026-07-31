# Ensaio Pre-Production Cutover

O plano de deploy validado e aprovado requer que sigamos as tarefas:
1. Subida das adaptações (sem uso efetivo).
2. Migration 015 no ambiente remoto e re-geração de tipos.
3. Migration 016 e grants realtime, garantindo fallback e atomicidade no processo.
4. CI/CD Vitest global e build pass.

Este ensaio local obteve sucesso integral através das validações sucessivas no Supabase CLI (`npx supabase test db --local`). O caminho crítico não possui dependências circulares.
