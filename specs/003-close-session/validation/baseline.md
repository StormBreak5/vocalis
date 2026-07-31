# Baseline da implementação

- Branch verificada: `003-close-session`.
- Feature pointer verificado: `.specify/feature.json` aponta para `specs/003-close-session`.
- O comando de pré-requisitos retornou `D:\workspace\vocalis\specs\003-close-session` e encontrou `tasks.md`.
- As migrations históricas `001–014` permanecem imutáveis.
- A baseline já contém `sessions.status = closed` e `sessions.closed_at`, mas os writers históricos ainda comparam `ended`; a correção será feita somente pelas migrations novas 015 e 016.
