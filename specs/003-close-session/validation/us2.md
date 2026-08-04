# Validação US2 — encerramento em tempo real

Data: 2026-08-04
Status: PASS

## Cobertura executada

- Host cancela a confirmação sem alterar a sala e depois confirma o encerramento.
- Host e participantes exibem a modal `Sala encerrada` sem reload.
- A modal usa a mensagem `O DJ encerrou esta sessão de karaokê.` e a ação `Voltar para o início`.
- A assinatura Realtime usa `UPDATE/public/sessions`, filtro por Session e projeção `id`, `code`, `status`, `closed_at`.
- Payloads inválidos entram em modo fail-closed e fazem resync por point-read, sem polling.
- A saída aguarda o cleanup específico da sala e preserva a autenticação.

## Métrica automatizada

- Ambiente: Supabase local, Chromium mobile, loopback sem throttling.
- Amostras: 20 entregas na mesma sessão.
- Resultado: 20/20 modais visíveis.
- p95 nearest-rank: 1744 ms.
- Limite: 2000 ms.
- Veredito: PASS.

Evidência detalhada: `validation/realtime-p95/automated-local.json`.