# Contexto do Projeto: Aplicativo de Fila de Karaokê (PWA)

Nome da Aplicação: Vocalis

## 1. Visão Geral
Este é um aplicativo web voltado para mobile (Mobile-First / PWA) projetado para gerenciar filas de karaokê em tempo real. O foco é a usabilidade em ambientes de bar: internet instável, baixa luminosidade e usuários que precisam de interfaces extremamente simples e botões grandes.

Três superfícies consomem o mesmo backend Supabase:
- **Participante** (`/`, `/entrar`, `/sala/[code]`) — entra com código de 6 caracteres, pede música, acompanha a posição na fila.
- **Host/DJ** (`/sala/[code]/dj`) — cria a sala, avança o status das músicas, pausa/retoma pedidos, encerra a sessão, vê participantes online.
- **Telão** (`/sala/[code]/display`) — tela host-only para TV/projetor: "cantando agora", "próximo", fila resumida, QR code de entrada.

## 2. Stack Tecnológico
- **Runtime:** Node.js `24.13.1`, npm `11.8.0` (versões exatas fixadas em `.nvmrc`, `engines` e na CI — a CI falha se não baterem).
- **Framework:** Next.js 16 (App Router, Turbopack).
- **Banco de Dados & Backend:** Supabase (PostgreSQL, Realtime, RLS).
- **Estilização:** Tailwind CSS 4 nas primitivas e telas simples; **CSS Modules** (`*.module.css`) nas telas "neon" de cada superfície.
- **Componentes UI:** shadcn/ui (estilo "new-york") + Radix + `@base-ui/react` (usado para `Tabs` no painel do DJ).
- **Ícones:** Lucide React.
- **Toasts:** `sonner` (NÃO o `use-toast` legado do shadcn).
- **Formulários:** react-hook-form + resolver Zod.
- **PWA:** manifest via `app/manifest.ts` (API nativa do Next) e **service worker escrito à mão** em `public/sw.js`, registrado por `src/components/pwa/ServiceWorkerManager.tsx`. **Não usa `serwist` nem `next-pwa`** — não introduza nenhuma das duas.
- **Testes:** Vitest + Testing Library (unitários), Playwright (E2E), pgTAP via Supabase CLI (banco).

## 3. Regras de Negócio Core
- **Perfis de Usuário:**
    - **Host (DJ):** Cria a sessão, controla a fila, avança o status das músicas, pausa novos pedidos, encerra a sessão.
    - **Cantor (Convidado):** Entra via código da sala (ex: `KARA89`), adiciona música, vê sua posição na fila.
- **A Regra Anti-Spam (Microfone Justo):** Um cantor SÓ PODE TER UMA MÚSICA ATIVA na fila. Ele só pode pedir outra quando a anterior receber o status de `completed` ou `cancelled`. Essa regra é garantida via banco de dados (Partial Unique Index no PostgreSQL), não apenas no frontend.
- **Sessão encerrada é terminal:** uma sessão `closed` nunca reabre. Essa garantia está replicada em três lugares (trigger SQL `private.enforce_session_state_transition`, o reducer `src/hooks/session-lifecycle.reducer.ts` e as checagens em `useSessionLifecycle.ts`) — alterar um sem os outros quebra a invariante.

## 4. Estrutura do Banco de Dados

> Fonte de verdade: `supabase/migrations/*.sql` + `src/infrastructure/supabase/database.types.ts` (gerado pela Supabase CLI). Este resumo reflete o estado após a migration `017`.

### sessions

- `id` — uuid PK
- `code` — char(6) UNIQUE, alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sem `I`, `O`, `0`, `1`)
- `host_id` — uuid NOT NULL, FK → `auth.users(id)`. **Definido exclusivamente como `auth.uid()` dentro da RPC `create_session()`** — o cliente nunca escolhe o host.
- `status` — text CHECK IN (`active`, `paused`, `closed`), transições validadas por trigger
- `max_participants` — smallint DEFAULT 50
- `max_queue_entries` — smallint DEFAULT 200
- `created_at` — timestamptz
- `closed_at` — timestamptz NULL, com CHECK `(status = 'closed') = (closed_at IS NOT NULL)`

### participants

- `id` — uuid PK
- `session_id` — uuid FK → `sessions(id)` ON DELETE CASCADE
- `display_name` — text
- `disambiguation_index` — smallint DEFAULT 1 (desempate de nomes duplicados na mesma sala)
- `auth_user_id` — uuid FK → `auth.users(id)`
- `joined_at`, `last_seen`, `created_at` — timestamptz

**NÃO existe coluna `is_online`.** Quem está online é resolvido em runtime via Supabase Presence (canal efêmero, ver seção 5.2) — essa informação nunca é persistida.

Constraints: UNIQUE `(session_id, display_name, disambiguation_index)`; UNIQUE `(session_id, auth_user_id)`; UNIQUE `(id, session_id)` (existe para viabilizar a FK composta da `queue`).

### queue

- `id` — uuid PK
- `session_id` — uuid FK → `sessions(id)` ON DELETE CASCADE
- `participant_id` — uuid, com **FK composta** `(participant_id, session_id)` → `participants(id, session_id)`
- `song_title`, `artist` — varchar(100)
- `status` — varchar(20) CHECK IN (`pending`, `preparing`, `singing`, `completed`, `cancelled`)
- `position` — integer NOT NULL
- `created_at`, `updated_at` — timestamptz

**Índice Crítico (Anti-Spam):** índice único parcial em `(session_id, participant_id)` onde `status IN ('pending','preparing','singing')`.

**Sobre `position`:** é atribuído uma única vez no INSERT, como `COALESCE(MAX(position),0)+1` dentro da própria RPC. **Nunca é reescrito por UPDATE** em lugar nenhum do código. Não há reordenação nem reindexação ao cancelar/completar. Leitura sempre com `ORDER BY position ASC`.

## 5. Diretrizes de Arquitetura e Código

### 5.1 Arquitetura em camadas (NÃO NEGOCIÁVEL)
Regra de ouro do projeto: **toda escrita no banco passa por RPC `SECURITY DEFINER` no Postgres.** Nunca faça INSERT/UPDATE/DELETE direto do cliente — os grants de DML foram revogados de propósito.

```
src/domain/          tipos, schemas Zod, validadores, regras puras (sem I/O)
src/application/     Server Actions ('use server') — orquestram RPC e mapeiam erros
src/infrastructure/  Supabase, QR, config, env
src/hooks/           estado de cliente + assinatura Realtime ('use client')
src/components/      apresentação, separada por superfície: participant/, dj/, display/
app/                 App Router — rotas finas que buscam dados e delegam
```

Rotas: `/`, `/entrar`, `/sala/[code]`, `/sala/[code]/dj`, `/sala/[code]/display`.

Use **Server Components** por padrão. `"use client"` apenas onde há interatividade ou Realtime.

### 5.2 Interações com Supabase
- **Auth é 100% anônima** (`supabase.auth.signInAnonymously()`). Não existe senha, e-mail ou OAuth em lugar nenhum. Quem chama `create_session()` vira host daquela sala; quem chama `join_session()` vira participante.
- **Não há rotas REST/`app/api/*`.** A superfície é Server Actions chamando RPCs.
- **RPCs disponíveis:** `create_session()`, `join_session(p_code, p_display_name)`, `create_queue_entry(p_session_id, p_song_title, p_artist)`, `cancel_queue_entry(p_queue_id)`, `update_queue_status(p_queue_id, p_new_status)`, `update_session_status(p_session_id, p_new_status)`, `close_session(p_session_id)`, `get_host_session_details(p_session_id)`.
- **Toda RPC nova** precisa de `SECURITY DEFINER`, `SET search_path` explícito, e `REVOKE ALL ... GRANT EXECUTE TO authenticated` explícito. Nunca dependa do grant padrão a `PUBLIC` — a migration `017` existe justamente para corrigir uma falha causada por essa omissão.
- **Realtime:** `postgres_changes` em `sessions`, `participants` e `queue`; canais de **Presence** para quem está online. Polling (`setInterval`) é PROIBIDO.
- **Resultado de RPC** que retorna `TABLE(...)` é validado com Zod `z.strictObject` e passa por `expectSingleRpcRow` — cardinalidade diferente de 1 é contrato quebrado, não erro de negócio.

### 5.3 Erros
Server Actions retornam sempre a união `AppSuccess<T> | AppError` (`{ ok: true, ... }` ou `{ ok: false, code, userMessage }`) — nunca lançam em fluxo esperado. Os `ErrorCode` espelham literalmente as mensagens `RAISE EXCEPTION` do Postgres. Ao adicionar uma exceção nova no banco, adicione o código correspondente em `DOMAIN_CODES` e `USER_MESSAGES` (`src/application/session/session-error.mapper.ts`).

### 5.4 Interface e UI
- **Tema:** Dark Mode é o padrão e não é opcional (o app é usado em bares).
- **Touch Targets:** mínimo 48x48 px em todo elemento interativo.
- **Feedback Visual:** toda operação assíncrona precisa de loading state (spinner ou skeleton) e toast de erro. Nunca tela em branco ou congelada.
- **Acessibilidade:** WCAG 2.1 AA mínimo — ARIA correto, navegação por teclado, contraste suficiente.
- Ao violar a regra anti-spam, a mensagem é: *"Você já tem uma música na fila! Aguarde sua vez."*

### 5.5 Testes
Um arquivo `__tests__/NomeDoComponente.test.tsx` por componente relevante, mocks de hooks via `vi.mock`. Testes de domínio puro em `src/domain/__tests__/`. Testes que exigem Supabase local usam sufixo `.integration.test.ts` e ficam fora do `test:unit`.

Commits seguem Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`).

## 6. Instruções para o Assistente de IA
Ao gerar código para este projeto:
1. Verifique se um componente de UI pode ser importado via shadcn/ui antes de criá-lo do zero.
2. Dados no client vêm de um hook que escuta o Supabase Realtime — nunca de polling.
3. Toda escrita no banco passa por uma RPC. Se a feature precisa escrever algo novo, a migration vem antes do TypeScript.
4. Todo o código deve ser tipado em TypeScript (strict).
5. Antes de descrever o schema, leia `database.types.ts` — este documento é um resumo e pode ficar defasado.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
