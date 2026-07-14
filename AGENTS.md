# Contexto do Projeto: Aplicativo de Fila de Karaokê (PWA)

Nome da Aplicação: Vocalis

## 1. Visão Geral
Este é um aplicativo web voltado para mobile (Mobile-First / PWA) projetado para gerenciar filas de karaokê em tempo real. O foco é a usabilidade em ambientes de bar: internet instável, baixa luminosidade e usuários que precisam de interfaces extremamente simples e botões grandes.

## 2. Stack Tecnológico
- **Framework:** Next.js (App Router).
- **Banco de Dados & Backend:** Supabase (PostgreSQL, Realtime, RLS).
- **Estilização:** Tailwind CSS.
- **Componentes UI:** shadcn/ui (Radix UI).
- **Ícones:** Lucide React.
- **PWA:** Bibliotecas modernas (ex: serwist ou next-pwa) para instalação mobile.

## 3. Regras de Negócio Core
- **Perfis de Usuário:**
    - **Host (DJ):** Cria a sessão, controla a fila, dá play nas músicas, pula cantores ou pausa novos pedidos.
    - **Cantor (Convidado):** Entra via código da sala (ex: `KARA89`), adiciona música, vê sua posição na fila.
- **A Regra Anti-Spam (Microfone Justo):** Um cantor SÓ PODE TER UMA MÚSICA ATIVA na fila. Ele só pode pedir outra quando a anterior receber o status de `completed` ou `cancelled`. Essa regra é garantida via banco de dados (Partial Unique Index no PostgreSQL), não apenas no frontend.

## 4. Estrutura do Banco de Dados

### sessions

- id
- code
- host_id
- status
- created_at

### participants

- id
- session_id
- display_name
- joined_at
- last_seen
- is_online
- created_at

### queue

- id
- session_id
- participant_id
- song_title
- artist
- status
- position
- created_at

**Índice Crítico (Anti-Spam):**
Existe um índice único parcial em:

(session_id, participant_id)

Onde

status IN ('pending','preparing','singing')

## 5. Diretrizes de Arquitetura e Código

### 5.1 Next.js (App Router)
- Use **Server Components** por padrão para carregamento inicial rápido e SEO nulo (é um app privado).
- Use **Client Components** (`"use client"`) APENAS para telas que precisam de interatividade ou conexão com Supabase Realtime (ex: a tela que renderiza a fila atualizada).
- Estrutura de rotas sugerida:
    - `/` (Landing/Entrada via código).
    - `/sala/[code]` (Visão do Cantor).
    - `/sala/[code]/dj` (Visão do Host/DJ).

### 5.2 Interações com Supabase
- Utilize `@supabase/ssr` para gerenciar a autenticação e cookies no servidor (se necessário).
- Para a fila, utilize os listeners do **Supabase Realtime** nos Client Components para escutar mudanças na tabela `queue` e atualizar o estado do React imediatamente.

### 5.3 Interface e UI (shadcn/ui + Tailwind)
- **Tema:** Priorize e configure o Dark Mode (fundo escuro, textos claros) como padrão, pois o app será usado em bares.
- **Tamanho (Touch Targets):** Os botões devem ser grandes (min-h de 48px). Use os componentes do shadcn/ui modificados para um padding generoso.
- **Feedback Visual:** Como a internet pode ser lenta, forneça sempre um *loading state* (spinners ou skeleton loaders) ao adicionar músicas ou alterar status. Mostre Toasts (usando o `use-toast` do shadcn) para erros, especialmente se o usuário violar a regra anti-spam.

## 6. Instruções para o Assistente de IA
Ao gerar código para este projeto:
1. Sempre verifique se um componente de UI pode ser importado via shadcn/ui antes de criá-lo do zero.
2. Certifique-se de que os dados consumidos no Client venham de um *hook* que escuta o Supabase Realtime, evitando *polling* (setInterval).
3. Ao lidar com exceções do Supabase (como a restrição do índice único parcial sendo acionada), trate o erro e retorne uma mensagem amigável: *"Você já tem uma música na fila! Aguarde sua vez."*
4. Todo o código deve ser tipado em TypeScript.

## 7. Princípios do Produto

Este projeto prioriza:

- Simplicidade acima de quantidade de funcionalidades.
- O fluxo principal deve exigir o menor número possível de toques.
- Toda funcionalidade deve ser pensada para uso em bares, com pouca iluminação e internet instável.
- O usuário nunca deve perder seu estado devido à queda de conexão.
- O sistema deve ser resiliente e recuperar automaticamente sessões e presença quando possível.
- O Host deve conseguir operar todo o sistema com apenas uma mão.
- O aplicativo deve parecer instantâneo, utilizando feedback visual em todas as operações.
- O modelo de domínio deve privilegiar evolução futura sem necessidade de grandes refatorações.