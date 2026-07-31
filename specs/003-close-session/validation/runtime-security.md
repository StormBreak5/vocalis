# Auditoria de Runtime Security

- **Escopo do Realtime**: A publication limita a escuta estritamente à tabela `sessions` e no React limitamos ao ID, minimizando volume de dados. A view reflete apenas quatro colunas seguras, excluindo `host_id` (prevenindo UUID leak do usuário hospedeiro).
- **Service Worker e Tokens**: O SW foi reconfigurado de forma customizada para excluir interceptação em rotas dinâmicas `/sala/` e rotas de Supabase/RPCs (`Next-Action`), garantindo que não existam instâncias estáticas privadas oxidadas num device offline que já encerrou a festa. Não houve modificação em JWTs nem remoção de autenticação persistida.
