<div align="center">
  <h1>🎤 Vocalis</h1>
  <p><strong>Um aplicativo PWA / Mobile-First para gerenciar filas de karaokê em tempo real, feito para bares e eventos.</strong></p>
</div>

---

Vocalis permite que um **Host (DJ)** crie uma sala e controle a ordem das músicas, enquanto os **Participantes** entram por um código, acompanham a fila e fazem seus pedidos pelo próprio celular. 

Foi projetado com foco absoluto na usabilidade em ambientes noturnos: **interface em modo escuro**, **botões com grande área de toque**, **feedback imediato** e **recuperação inteligente de estado** (mesmo com internet instável).

## ✨ Principais Funcionalidades

- **🎭 Múltiplos Perfis:**
  - **Host (DJ):** Cria a sala, avança a fila, pausa os pedidos, encerra sessões.
  - **Cantor:** Entra por código de acesso, adiciona seu pedido, acompanha a vez na fila.
- **⚡ Fila em Tempo Real:** Atualizações instantâneas usando Supabase Realtime. Não é necessário recarregar a página.
- **⚖️ Regra "Microfone Justo":** Um sistema de prevenção contra spam direto no banco de dados, que permite apenas **1 música ativa por participante**. Uma nova música só pode ser solicitada após a anterior ser concluída ou cancelada.
- **📱 PWA & Mobile-First:** Experiência pensada para uso no smartphone, instalável como PWA na tela inicial.
- **🌙 Interface Noturna:** Design voltado para o uso no escuro (tema *dark* por padrão).

## 🚀 Tecnologias (Stack)

O projeto usa ferramentas modernas para garantir alta performance e resiliência:

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router) + [React 19](https://react.dev/)
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/)
- **Backend/Database:** [Supabase](https://supabase.com/) (PostgreSQL, Auth, Realtime, RLS)
- **Estilização:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Componentes:** [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/)
- **Ícones:** [Lucide React](https://lucide.dev/)
- **Testes:** [Vitest](https://vitest.dev/) (Unitários) e [Playwright](https://playwright.dev/) (E2E)

## 🛠️ Como executar localmente

### 1. Pré-requisitos
Você precisará ter instalado em sua máquina:
- Node.js (v20+)
- NPM, pnpm ou yarn
- Uma conta no [Supabase](https://supabase.com/) ou [Supabase CLI](https://supabase.com/docs/guides/cli) para executar o banco local

### 2. Configuração do ambiente
Faça uma cópia do arquivo de variáveis de ambiente:
```bash
cp .env.example .env.local
```
*Preencha as credenciais do Supabase no `.env.local`.*

### 3. Instalação e Execução
Instale as dependências:
```bash
npm install
```

Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

A aplicação estará disponível em: **[http://localhost:3000](http://localhost:3000)**

## 🗄️ Estrutura de Dados Resumida

O Vocalis é baseado em três tabelas principais, protegidas por **Row Level Security (RLS)** do Supabase:

- `sessions`: Armazena a sala (ex: código "KARA89", status, host_id).
- `participants`: Pessoas que entraram em uma sessão específica.
- `queue`: A fila de músicas com uma regra rigorosa no banco (*Partial Unique Index*) para evitar o registro de mais de uma música com status "na fila" para o mesmo usuário.

---
<div align="center">
Desenvolvido com 🎶 e ❤️.
</div>