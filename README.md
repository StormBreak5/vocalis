<div align="center">
  <h1>🎤 Vocalis</h1>
  <p><strong>Um aplicativo PWA / Mobile-First para gerenciar filas de karaokê em tempo real, feito para bares e eventos.</strong></p>
</div>

---

Vocalis permite que um **Host (DJ)** crie uma sala e controle a ordem das músicas, enquanto os **Participantes** entram por um código, acompanham a fila e fazem seus pedidos pelo próprio celular. Uma terceira superfície, o **Telão**, pode ser aberta numa TV/projetor para mostrar quem está cantando e quem vem a seguir.

Foi projetado com foco absoluto na usabilidade em ambientes noturnos: **interface em modo escuro**, **botões com grande área de toque**, **feedback imediato** e **recuperação inteligente de estado** (mesmo com internet instável).

## ✨ Principais Funcionalidades

- **🎭 Três superfícies, um backend só:**
  - **Host (DJ):** Cria a sala, avança a fila, reordena quem está aguardando por drag-and-drop, pausa os pedidos, encerra sessões e consulta o histórico de sessões anteriores.
  - **Cantor:** Entra por código de acesso (ou QR Code), adiciona seu pedido — mesmo sem saber ainda o que vai cantar — e pode editar título/artista depois, a qualquer momento antes de subir ao palco.
  - **Telão:** Tela para TV/projetor com "cantando agora", "próximo" e a fila resumida. O Host abre direto, ou qualquer outra tela pode ser pareada via um código de uso único gerado no painel do DJ.
- **⚡ Fila em Tempo Real:** Atualizações instantâneas usando Supabase Realtime. Não é necessário recarregar a página, em nenhuma das três superfícies.
- **⚖️ Regra "Microfone Justo":** Um sistema de prevenção contra spam direto no banco de dados, que permite apenas **1 música ativa por participante**. Uma nova música só pode ser solicitada após a anterior ser concluída ou cancelada.
- **🔀 Fila reordenável:** O Host pode arrastar (mouse, toque ou teclado) para reorganizar quem está aguardando, sem afetar quem já foi chamado ou está cantando.
- **📱 PWA & Mobile-First:** Experiência pensada para uso no smartphone, instalável como PWA na tela inicial — inclusive o painel do Host, para operar a fila com uma mão só.
- **🌙 Interface Noturna:** Design voltado para o uso no escuro (tema *dark* por padrão, não configurável — o app é pensado para uso em bares).

## 🚀 Tecnologias (Stack)

O projeto usa ferramentas modernas para garantir alta performance e resiliência:

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Turbopack) + [React 19](https://react.dev/)
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/) (strict)
- **Backend/Database:** [Supabase](https://supabase.com/) (PostgreSQL, Auth anônima, Realtime, RLS) — toda escrita passa por RPC `SECURITY DEFINER`, nunca INSERT/UPDATE/DELETE direto do cliente
- **Estilização:** [Tailwind CSS v4](https://tailwindcss.com/) nas primitivas + **CSS Modules** nas telas "neon" de cada superfície
- **Componentes:** [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) + [Base UI](https://base-ui.com/) (Dialog, Tabs)
- **Drag-and-drop:** [@dnd-kit](https://dndkit.com/) (reordenar a fila do Host — mouse, toque e teclado)
- **Formulários:** [react-hook-form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- **Toasts:** [sonner](https://sonner.emilkowal.ski/)
- **Ícones:** [Lucide React](https://lucide.dev/)
- **PWA:** manifest nativo do Next.js + service worker escrito à mão (sem `serwist`/`next-pwa`)
- **Testes:** [Vitest](https://vitest.dev/) (unitários), [Playwright](https://playwright.dev/) (E2E) e [pgTAP](https://pgtap.org/) via Supabase CLI (regras de banco/RLS/RPC)

## 🛠️ Como executar localmente

### 1. Pré-requisitos
Você precisará ter instalado em sua máquina:
- **Node.js `24.13.1`** e **npm `11.8.0`** — versões exatas, fixadas em `.nvmrc` e `engines` no `package.json`; a CI falha se não baterem. Com [nvm](https://github.com/nvm-sh/nvm), `nvm use` já pega a versão certa a partir do `.nvmrc`.
- **Docker Desktop** — necessário para rodar o Supabase local (`supabase start`), usado pelos testes de banco/pgTAP e para desenvolvimento sem depender de um projeto remoto.
- O [Supabase CLI](https://supabase.com/docs/guides/cli) já vem como devDependency (`npx supabase ...`); não precisa instalar globalmente.

### 2. Configuração do ambiente
Faça uma cópia do arquivo de variáveis de ambiente:
```bash
cp .env.example .env.local
```
Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `APP_PUBLIC_URL` — são as únicas variáveis que o app lê em runtime (e as únicas que vão para a Vercel, além das do Sentry). `SUPABASE_SERVICE_ROLE_KEY` só é usada pelos testes de banco/integração e normalmente vem de `supabase status`; preencha no `.env.local` apenas se for rodar esses testes contra um projeto remoto — **nunca** configure essa chave na Vercel. Essas credenciais podem apontar tanto para um projeto Supabase remoto (via `supabase link`) quanto para a instância local do Docker (`http://127.0.0.1:54321` depois de `supabase start`) — **confira qual das duas está configurada** antes de rodar migrations ou testar mudanças de banco: `supabase db reset`/`db push` sem `--linked` afeta só o Docker local, enquanto o app com `.env.local` apontando pro projeto remoto não vai enxergar essa mudança até um `supabase db push --linked` explícito.

### 3. Instalação e Execução
Instale as dependências:
```bash
npm install
```

Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

Para auditorias visuais com build de produção, use `npm run app:local:production`. Não use `npm run build` seguido de `npm run start` para inspeção local: o executor dedicado valida e injeta exclusivamente o Supabase local, sem resetar os dados existentes.

A aplicação estará disponível em: **[http://localhost:3000](http://localhost:3000)**

### 4. Banco de dados local (Supabase)
Para desenvolver ou rodar os testes de banco sem depender de um projeto remoto:
```bash
npm run test:db:prepare   # sobe os containers do Supabase local via Docker e aplica todas as migrations (supabase/migrations/*.sql)
npm run test:db           # roda a suíte pgTAP (regras de RLS, RPCs, ACL) contra o banco local
npm run test:db:stop      # encerra os containers quando terminar
```
Toda migration nova precisa ser adicionada ao allowlist `APPROVED_PGTAP_FILES` em `scripts/supabase/pgtap.mjs` se vier acompanhada de um arquivo de teste em `supabase/tests/` — é um gate de segurança deliberado, não um esquecimento. Depois de alterar `supabase/migrations/`, regenere os tipos TypeScript com `npx supabase gen types typescript --local > src/infrastructure/supabase/database.types.ts`.

### 5. Scripts disponíveis
| Script | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento (Turbopack) |
| `npm run build` / `npm run start` | Build e execução de produção |
| `npm run app:local:production` | Build de produção para auditoria visual local, usando o Supabase local sem resetar dados |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | Testes unitários (Vitest + Testing Library) |
| `npm run test:integration` | Testes de integração contra o Supabase local |
| `npm run test:db:prepare` / `test:db` / `test:db:stop` | Sobe o Supabase local, roda a suíte pgTAP, encerra os containers |
| `npm run test:e2e` | Testes E2E funcionais (Playwright) |
| `npm run test:e2e:chrome` / `test:e2e:webkit` | E2E num browser específico |
| `npm run test:e2e:performance` | Cenário de performance (Playwright) |

## 🗄️ Estrutura de Dados Resumida

O Vocalis é baseado em quatro tabelas principais (mais uma no schema `private`, nunca exposta via API), protegidas por **Row Level Security (RLS)** do Supabase — toda escrita passa por RPC, nunca por INSERT/UPDATE/DELETE direto do cliente:

- `sessions`: a sala (código de 6 caracteres tipo "KARA89", status `active`/`paused`/`closed`, host_id).
- `participants`: pessoas que entraram em uma sessão específica.
- `queue`: a fila de músicas. Título e artista são **opcionais** (dá pra entrar na fila sem saber ainda o que vai cantar, e editar depois). Tem uma regra rigorosa no banco (*Partial Unique Index*) para evitar mais de uma música ativa por participante ("Microfone Justo"), e a posição só é reescrita pela RPC de reordenação do Host — nunca por qualquer outra escrita.
- `display_pairings`: vínculo durável entre uma tela pareada (Telão) e uma sessão.
- `private.display_pairing_codes`: código de pareamento de uso único e curta duração, nunca exposto via API — só alcançável por RPC.

Para o schema completo, campo a campo, e as regras de arquitetura/RPC do projeto, veja [`AGENTS.md`](AGENTS.md) — é o documento vivo que o time (e os agentes de IA) usam como fonte de verdade.

---
<div align="center">
Desenvolvido com 🎶 e ❤️.
</div>
