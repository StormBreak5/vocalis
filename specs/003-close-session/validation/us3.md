# Validação US3 — recuperação após desconexão ou refresh

Data: 2026-08-04
Status: PASS

## Cenários executados

- Refresh após `closed` mantém a modal final.
- Abertura direta da rota encerrada recupera o snapshot final.
- Cliente offline durante o encerramento converge ao voltar online e receber `pageshow`.
- Retomada de aba suspensa, `visibilitychange` e cenário compatível com BFCache fazem point-read.
- Reload após retomada mantém `closed` como estado terminal.
- Nova tentativa de entrada por código encerrado é recusada com mensagem amigável.
- Escritas posteriores — entrada, pedido, cancelamento, pause/resume e alteração de status — são recusadas e os dados permanecem inalterados.

## Rede lenta e resposta incerta

- Perfil: Slow 3G, 400 kbps download, 200 kbps upload, RTT de 400 ms.
- Resposta da ação atrasada em 9000 ms; timeout de incerteza do cliente em 8000 ms.
- Houve uma única chamada, loading contínuo e nenhum sucesso prematuro.
- O estado foi recuperado por point-read em 10116 ms.
- Veredito: PASS.

Evidência detalhada: `validation/slow-network-e2e.json`.