# CONTEXTO.md — Vocalis

> Documento de engenharia reversa do repositório, produzido sem histórico da conversa anterior — apenas com base no código, migrations, specs, testes e `git log` no momento da análise (2026-08-14, branch `fix/session-ownership-integrity`, working tree limpo). Nenhum arquivo do projeto foi alterado para produzir este documento.

---

## 1. Resumo executivo

Vocalis é um PWA mobile-first para gerenciar filas de karaokê em bares/eventos em tempo real. Três superfícies consomem o mesmo backend Supabase:

- **Participante** (`/`, `/entrar`, `/sala/[code]`): entra com um código de 6 caracteres, pede música, acompanha a posição na fila.
- **Host/DJ** (`/sala/[code]/dj`): cria a sala, avança o status das músicas (`pending → preparing → singing → completed`), pausa/retoma novos pedidos, encerra a sessão, vê participantes online.
- **Telão** (`/sala/[code]/display`): tela somente para o host, pensada para TV/projetor — mostra "cantando agora", "próximo", fila resumida, QR code de entrada, e reage a pausa/offline/encerramento.

**Estado real, verificado nesta auditoria**: o projeto está bem mais avançado do que o roadmap reportado sugeria. Pause/resume, CI/testes/segurança, a renovação visual das três telas e o telão host-only estão **de fato concluídos e testados**. A **presença online dos participantes**, reportada como "não iniciada", está **implementada e em uso real** no painel do DJ. Em contrapartida, **histórico de sessões** (o item dito "em andamento") **não tem nenhum código, migration, tipo ou UI** — o roadmap reportado não bate com o repositório neste ponto específico (ver seção 9 e 10 para evidência linha a linha).

O que um dev novo precisa saber nos primeiros 5 minutos:
- Toda escrita no banco passa por **RPCs `SECURITY DEFINER`** no Postgres (nunca INSERT/UPDATE direto do cliente) — a regra "Microfone Justo" e a integridade de posse de sessão são garantidas no banco, não no frontend.
- Autenticação é **100% anônima** via Supabase Auth (`signInAnonymously`) — não há login de host com senha; quem cria a sessão vira `host_id` automaticamente via `auth.uid()`.
- Tempo real é **Supabase Realtime** (Postgres CDC via `postgres_changes` + canais de **Presence**) — não há polling nem websocket customizado.
- A branch atual (`fix/session-ownership-integrity`) contém uma correção de segurança real e recente (migration `017`), já mesclada com `main`. O working tree está limpo — não há trabalho não commitado.
- `npm run typecheck`, `npm run lint`, `npm run test:unit` (340 testes) e `npm run build` foram executados nesta auditoria e **passam sem erros**. Testes de integração/pgTAP/E2E não foram executados (exigem Docker, indisponível no ambiente desta análise).

---

## 2. Stack e infraestrutura

Versões exatas conforme `package.json` e `.nvmrc` (VERIFICADO):

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js | `24.13.1` (fixado em `.nvmrc` e `engines`) |
| Package manager | npm | `11.8.0` (fixado em `packageManager` e CI) |
| Framework | Next.js (App Router, Turbopack) | `16.3.0` |
| UI | React / React DOM | `19.2.4` |
| Linguagem | TypeScript | `^5` (strict mode) |
| Estilização | Tailwind CSS | `^4` (via `@tailwindcss/postcss`) |
| Componentes | shadcn/ui (estilo "new-york") + Radix (`@radix-ui/react-alert-dialog`) + `@base-ui/react` (usado para `Tabs` no painel do DJ) | — |
| Ícones | lucide-react | `^1.24.0` |
| Formulários/validação | react-hook-form + `@hookform/resolvers` + zod | `^7.81` / `^5.4` / `^4.4.3` |
| Toasts | sonner | `^2.0.7` |
| QR Code | `qr` | `^0.6.0` |
| Backend/DB | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) | `^2.110.5` / `^0.12.3` |
| Testes unitários | Vitest + Testing Library + jsdom | `^4.1.10` |
| Testes E2E | Playwright | `^1.61.1` |
| Testes de banco | pgTAP (via Supabase CLI local) | Supabase CLI `2.111.0` |
| CLI Supabase local | `supabase` (devDependency) | `2.111.0` |

**Banco de dados**: PostgreSQL via Supabase, com Row Level Security (RLS) em todas as tabelas públicas, funções `SECURITY DEFINER` no schema `public` para toda escrita e um schema `private` (criado na migration `015`) com funções auxiliares de autorização não expostas a `anon`/`authenticated`.

**Auth**: Supabase Auth, exclusivamente **anônima** (`supabase.auth.signInAnonymously()`). Não há cadastro, senha, e-mail ou OAuth em nenhum lugar do código.

**Tempo real**: Supabase Realtime.
- `postgres_changes` (CDC baseado em replicação lógica) nas tabelas `sessions`, `participants` e `queue` (publicadas em `supabase_realtime` nas migrations `011`, `013`, `016`).
- **Presence** (canais efêmeros, não persistidos) para saber quais participantes estão online — ver [`useSessionPresence.ts`](src/hooks/useSessionPresence.ts).
- Não há polling (`setInterval`) em nenhum hook de dados — confirmado por leitura direta de `src/hooks/*`.

**Hospedagem/serviços externos**: **INCERTO**. Não há `vercel.json`, `Dockerfile`, `fly.toml`, `netlify.toml` ou qualquer config de deploy no repositório. O README e a CI mencionam apenas ambiente local (Supabase local via Docker). Não há evidência de onde a aplicação roda em produção hoje, se é que roda.

**PWA**: manifest gerado via `app/manifest.ts` (Next.js `MetadataRoute.Manifest` nativo) e um **service worker escrito à mão** em [`public/sw.js`](public/sw.js), registrado por [`ServiceWorkerManager.tsx`](src/components/pwa/ServiceWorkerManager.tsx) — **não usa** `serwist` nem `next-pwa` (nenhuma das duas está em `package.json`, apesar de citadas como sugestão em `AGENTS.md`). O SW só faz cache-first do "shell" (manifest + ícones) e network-first do resto, excluindo explicitamente `/sala/*` e domínios `supabase.co` do cache.

---

## 3. Como rodar localmente

Passo a passo, com o que foi **VERIFICADO** nesta sessão e o que ficou **INFERIDO** do README/scripts.

### 3.1 Pré-requisitos
- Node.js `24.13.1` e npm `11.8.0` (a CI falha se as versões não baterem exatamente — ver `.github/workflows/ci.yml:42-45`).
- Docker (para Supabase local — necessário para `test:db*`, `test:integration`, `test:e2e*`). **INCERTO/VERIFICADO NEGATIVO**: nesta análise, Docker não estava disponível (`docker info` falhou), então os testes de integração, pgTAP e E2E não puderam ser executados.
- Conta Supabase (produção) ou apenas Supabase CLI para tudo local.

### 3.2 Instalação (VERIFICADO)
```bash
npm install
```
Rodado nesta sessão via `node_modules` já presente; não foi necessário reinstalar, mas o comando é o documentado no README.

### 3.3 Variáveis de ambiente
Arquivo `.env.example` na raiz (VERIFICADO, conteúdo integral — sem valores reais):
```
NEXT_PUBLIC_SUPABASE_URL=       # URL do projeto Supabase (pública)
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Chave anônima do Supabase (pública)
SUPABASE_SERVICE_ROLE_KEY=      # Chave de service role (privada, servidor)
APP_PUBLIC_URL=                 # URL pública canônica usada em links/QR codes (absoluta, sem credenciais/query/fragmento)
SUPABASE_URL=                   # URL do emulador Supabase local, usada pelos testes de integração (padrão http://127.0.0.1:54321 se vazio)
```
Existe também um `.env.local` no repositório (não versionado — presente apenas na máquina local desta análise; **não foi lido o conteúdo** por conter potenciais segredos).

### 3.4 Banco de dados
- Migrations em `supabase/migrations/*.sql` (17 arquivos, aplicadas via Supabase CLI local ou linkado a um projeto remoto).
- Não há script de "seed" de dados de exemplo — **INCERTO** se isso é intencional (app não precisa de dados de demonstração) ou uma lacuna.
- `npm run test:db:prepare` sobe o Supabase local (Docker) e aplica as migrations; `npm run test:db:stop` derruba.

### 3.5 Comandos (status de execução nesta auditoria)

| Comando | O que faz | Executado agora? | Resultado |
|---|---|---|---|
| `npm run dev` | `next dev` | Não executado (evitar processo em segundo plano sem necessidade) | INFERIDO: inicia em `http://localhost:3000` |
| `npm run app:local:production` | Roda `scripts/app/run-local-production.mjs`; build de produção validando/injetando Supabase local **sem resetar dados** | Não executado | INFERIDO pelo README: alternativa recomendada a `build` + `start` para auditoria visual local |
| `npm run build` | `next build` | **Executado** com `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` placeholders (iguais aos da CI) | ✅ Sucesso — compilou, gerou 6 rotas (`/`, `/entrar`, `/sala/[code]`, `/sala/[code]/display`, `/sala/[code]/dj`, `/manifest.webmanifest`) |
| `npm run typecheck` | `tsc --noEmit` | **Executado** | ✅ Sem erros |
| `npm run lint` | `eslint` | **Executado** | ✅ Sem erros/avisos |
| `npm run test:unit` | Vitest (config `vitest.unit.config.ts`, exclui testes de integração) | **Executado** | ✅ 55 arquivos, 340 testes, todos passando (26.77s) |
| `npm run test:integration` | Testes de integração contra Supabase local | Não executado (Docker indisponível) | INCERTO |
| `npm run test:db` | pgTAP contra Supabase local | Não executado (Docker indisponível) | INCERTO |
| `npm run test:db:race` | Testes de concorrência no banco | Não executado (Docker indisponível) | INCERTO |
| `npm run test:e2e` / `test:e2e:chrome` / `test:e2e:webkit` | Playwright | Não executado (Docker indisponível) | INCERTO |

Porta padrão: `3000` (Next.js default, não há override em `next.config.ts`).

---

## 4. Arquitetura e organização do código

Estrutura em camadas dentro de `src/`, com `app/` só como roteador fino (Server Components por padrão, conforme `AGENTS.md`):

```
app/                          # App Router — rotas finas, buscam dados e delegam a componentes
  page.tsx                    # Home/marketing
  entrar/page.tsx             # Entrada por código
  sala/[code]/page.tsx        # Visão do participante
  sala/[code]/dj/page.tsx     # Visão do host/DJ
  sala/[code]/display/page.tsx # Telão (host-only)
  manifest.ts                 # PWA manifest

src/
  domain/                     # Tipos, schemas Zod, validadores e regras puras (sem I/O)
    session.types.ts, queue.types.ts, participant.types.ts, errors.types.ts
    session-lifecycle.ts      # Parsing/normalização de payloads Realtime de sessão
    validators/               # session-code.validator.ts, display-name.validator.ts

  application/                # Server Actions ('use server') — orquestram RPC + mapeiam erros
    session/                  # create-session, close-session, update-session-status, get-session-status
    participant/join-session.action.ts
    queue/                    # create-queue-entry, cancel-queue-entry, update-queue-status, list-active-queue
    shared/expect-single-rpc-row.ts  # normaliza RETURNS TABLE de RPC para cardinalidade 1

  infrastructure/             # Acesso a serviços externos
    supabase/
      client.ts, server.ts    # Browser client vs. Server client (@supabase/ssr)
      database.types.ts       # Tipos gerados pela Supabase CLI a partir do schema real (não editar à mão — ignorado no ESLint)
      queries/                # session.queries.ts, participant.queries.ts (leituras tipadas)
    realtime/session-realtime.integration.test.ts
    qr/room-entry-qr.ts, room-entry-qr.server.ts   # Geração do QR code de entrada (lib `qr`)
    config/app-public-url.ts, app-public-url.server.ts
    env.ts

  hooks/                      # Estado de cliente + assinatura Realtime ('use client')
    useSessionLifecycle.ts    # Máquina de estado da sessão (status, reconexão, epoch)
    session-lifecycle.reducer.ts
    useActiveQueue.ts         # Fila ativa em tempo real (postgres_changes + leitura autoritativa)
    useSessionParticipants.ts # Lista de participantes em tempo real
    useSessionPresence.ts     # Presence (quem está online) — track + subscribe
    useOnlineStatus.ts        # navigator.onLine
    session-room-cleanup.ts   # Registro de limpeza de canais ao trocar de sala

  components/
    session/                  # Provider de ciclo de vida, botões de criar/fechar sessão, modal de sessão encerrada
    participant/               # Superfície do cantor (ParticipantQueueExperience e afins)
    dj/                        # Superfície do host (DjDashboardExperience e afins)
    display/                   # Superfície do telão (DisplayExperience e afins)
    queue/                     # Componentes legados da fila (ver seção 11 — parcialmente código morto)
    vocalis/                   # Marca, hero da home, shell "neon"
    ui/                        # Primitivas shadcn/ui (button, card, input, badge, alert, skeleton, sonner)
    pwa/ServiceWorkerManager.tsx

  lib/utils.ts, lib/browser-navigation.ts
```

**Onde vive o quê:**
- **Lógica da fila**: regra de negócio no banco (`supabase/migrations/*queue*`), leitura/mutação em `src/application/queue/*.action.ts`, tempo real em `src/hooks/useActiveQueue.ts`, apresentação em `src/components/dj/DjQueuePanels.tsx` (host), `src/components/participant/*QueueCard*`/`CompactQueueRow.tsx` (participante) e `src/components/display/DisplayQueuePreview.tsx`/`display-queue-presentation.ts` (telão).
- **Estado da sessão** (ativa/pausada/encerrada): `src/domain/session.types.ts` + `src/hooks/session-lifecycle.reducer.ts` (máquina de estados pura) + `src/hooks/useSessionLifecycle.ts` (efeito com Realtime/reconexão) + `src/components/session/SessionLifecycleProvider.tsx` (Context React compartilhado pelas 3 superfícies).
- **Componentes por superfície**: `src/components/participant/`, `src/components/dj/`, `src/components/display/` — cada um com seu próprio CSS Module "neon" (`*.module.css`) e sem compartilhar componentes visuais entre si (só a `SessionLifecycleProvider` é comum).
- **Tipos compartilhados**: `src/domain/*.types.ts` (a única camada importada tanto por `application/` quanto por `components/` e `infrastructure/`).

---

## 5. Convenções do código

Observadas por leitura direta (não há um guia de estilo explícito no repo além de `AGENTS.md`):

- **Server Actions**: arquivo com `'use server'` no topo, um export nomeado por ação, retorno sempre `Promise<AppSuccess<T> | AppError>` (união discriminada por `ok`). Nunca lançam para o chamador em fluxo normal — erros de RPC são convertidos por `mapSessionError` (`src/application/session/session-error.mapper.ts`), que casa a mensagem de exceção do Postgres com um `ErrorCode` conhecido via substring match.
- **Nomenclatura de erros de domínio**: códigos em `SCREAMING_SNAKE_CASE` que **espelham literalmente** as mensagens `RAISE EXCEPTION` das funções SQL (ex.: `'ACTIVE_SONG_EXISTS'` no banco ↔ `ACTIVE_SONG_EXISTS` em `errors.types.ts`). Ao adicionar uma nova exceção no banco, é preciso adicionar o código correspondente em `DOMAIN_CODES` (`session-error.mapper.ts`) e em `USER_MESSAGES`.
- **Validação de RPC**: todo resultado de RPC que retorna `RETURNS TABLE(...)` é validado com um schema Zod `z.strictObject` (`*RpcRowSchema`) e passado por `expectSingleRpcRow` (`src/application/shared/expect-single-rpc-row.ts`), que lança `RpcResultContractError` se a cardinalidade não for exatamente 1. Isso é tratado como "contrato quebrado", não como erro de negócio.
- **Domínio em `snake_case` (banco) → `camelCase` (TS)**: todo mapeamento de linha do banco para tipo de domínio é feito manualmente, campo a campo (não há um mapper genérico/automático).
- **Gerenciamento de estado de UI em tempo real**: hooks customizados com `useReducer` (não Redux/Zustand). Cada hook Realtime implementa manualmente: autenticação do canal (`realtime.setAuth`), reconexão com backoff exponencial fixo (`[250, 750, 1500, 3000]` ms), detecção de payload incompatível com fallback para leitura autoritativa via Server Action, e limpeza (`removeChannel`) idempotente. Esse padrão se repete quase identicamente em `useSessionLifecycle.ts` e `useActiveQueue.ts` — é intencional (resiliência é princípio de produto), mas é bastante código duplicado (ver seção 11).
- **Estilo de componente**: componentes de apresentação recebem dados prontos via props; hooks fazem toda a busca/assinatura. CSS Modules por superfície (`*.module.css`), não Tailwind puro nas telas "neon" (Tailwind é usado nas primitivas `ui/` shadcn e nas telas mais simples).
- **Formulários**: `react-hook-form` + resolver Zod (`@hookform/resolvers`).
- **Teste de componente**: Testing Library + Vitest, um arquivo `__tests__/NomeDoComponente.test.tsx` por componente relevante, mocks de hooks via `vi.mock`. Testes de domínio puro em `src/domain/__tests__/`. Testes de infraestrutura têm sufixo `.integration.test.ts` e ficam fora de `test:unit` (excluídos em `vitest.unit.config.ts`).
- **Formato de commit**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`), com referência a PR entre parênteses quando vindo de merge (`feat: add host-only public room display (#7)`). Alguns commits antigos fogem do padrão (`"bug fix"`, `"Lint fixes"`) — mais comuns no início do projeto.
- **SQL**: migrations idempotentes com `DROP ... IF EXISTS` antes de recriar funções, sempre `BEGIN; ... COMMIT;`, `SECURITY DEFINER` + `SET search_path = ''` (ou `public`) explícito, `REVOKE ALL ... GRANT EXECUTE` explícito por função (nunca depende do grant padrão a `PUBLIC`). A migration `017` é um exemplo direto de correção de uma falha exatamente por não ter feito esse `REVOKE` em uma função anterior.

---

## 6. Modelo de dados

Três tabelas em `public`, todas com RLS habilitado. Estado atual reconstituído a partir de todas as 17 migrations (não apenas do schema inicial).

### `sessions`
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `code` | `char(6)` UNIQUE | alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sem `I`, `O`, `0`, `1` — migration `014`) |
| `host_id` | `uuid` NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | Desde a migration `017`, só pode ser definido como `auth.uid()` dentro da própria RPC `create_session()` — o cliente não escolhe mais o host |
| `status` | `text` CHECK IN `('active','paused','closed')` | Transições validadas por trigger (`private.enforce_session_state_transition`, migration `015`) |
| `max_participants` | `smallint` DEFAULT 50 | |
| `max_queue_entries` | `smallint` DEFAULT 200 | |
| `created_at` | `timestamptz` | |
| `closed_at` | `timestamptz` NULL | CHECK: `(status = 'closed') = (closed_at IS NOT NULL)` (migration `015`) |

Índices: `sessions_host_id_idx`, `sessions_status_idx` (parcial, `WHERE status != 'closed'`).

### `participants`
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK → `sessions(id)` ON DELETE CASCADE | |
| `display_name` | `text` | |
| `disambiguation_index` | `smallint` DEFAULT 1 | Para nomes duplicados na mesma sala |
| `auth_user_id` | `uuid` FK → `auth.users(id)` | Adicionado na migration `005`, substitui o modelo original de `recovery_token_hash` (removido na mesma migration) |
| `joined_at`, `last_seen`, `created_at` | `timestamptz` | `last_seen` é atualizado a cada `join_session` bem-sucedido (não há heartbeat periódico — ver seção 9, item Presença) |

Índices/constraints: `participants_session_name_idx` UNIQUE `(session_id, display_name, disambiguation_index)`; `participants_session_auth_user_unique` UNIQUE `(session_id, auth_user_id)` (migration `005`); `participants_id_session_id_key` UNIQUE `(id, session_id)` (migration `017`, existe só para viabilizar a FK composta abaixo).

### `queue`
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK → `sessions(id)` ON DELETE CASCADE | |
| `participant_id` | `uuid` | Desde a migration `017`, FK **composta** `(participant_id, session_id)` → `participants(id, session_id)` — antes era uma FK simples só em `participant_id`, o que permitia (em teoria) um `queue.session_id` divergente do `session_id` real do participante |
| `song_title`, `artist` | `varchar(100)` | |
| `status` | `varchar(20)` CHECK IN `('pending','preparing','singing','completed','cancelled')` | |
| `position` | `integer` NOT NULL | Ver "ordem da fila" abaixo |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` mantido por trigger `handle_updated_at` |

Índice crítico "Microfone Justo": `queue_active_participant_idx` — UNIQUE parcial em `(session_id, participant_id) WHERE status IN ('pending','preparing','singing')`. Índice de ordenação: `queue_session_position_idx (session_id, position)`.

### Como a ordem da fila é representada e persistida (crítico para reordenação manual futura)

- `position` é um **inteiro monotonicamente crescente por sessão**, atribuído **uma única vez**, no momento do `INSERT`, como `COALESCE(MAX(position), 0) + 1` dentro da própria RPC `create_queue_entry` (migration `016`, função final). Não há gap-filling, não há reindexação ao cancelar/completar uma música, e **não existe nenhuma RPC, coluna ou trigger de reordenação** — `position` nunca é escrito por `UPDATE` em nenhum lugar do código ou das migrations.
- A leitura ordenada é sempre `ORDER BY position ASC` — tanto na Server Action `list-active-queue.action.ts` quanto na query inicial de `useActiveQueue.ts`.
- Em runtime, `useActiveQueue.ts` reordena defensivamente com `position`, depois `createdAt`, depois `id` como desempate (`orderQueue()`), mas isso é só para exibição — não altera o banco.
- **Implicação direta para a feature de reordenação manual (roadmap, não iniciada)**: hoje não há conceito de "mover" um item. Qualquer implementação de drag-and-drop pelo DJ vai precisar de (a) uma nova RPC `SECURITY DEFINER` que reescreva `position` de forma transacional e coerente com a trigger/índice existentes, e (b) decidir se `position` continua sendo um inteiro denso recalculado a cada movimento ou se passa a ser um valor fracionário/flutuante (mais comum em filas reordenáveis, evita reescrever todas as linhas). Nenhuma dessas decisões está tomada no código atual.

### RPCs (funções `SECURITY DEFINER`, todas com `REVOKE ALL` + `GRANT EXECUTE TO authenticated` explícitos)
Estado final após a migration `017` (a versão anterior de cada função foi substituída, não coexiste):

| Função | Assinatura atual | Propósito |
|---|---|---|
| `create_session()` | sem parâmetros | Cria sessão com `host_id = auth.uid()`; gera código de 6 chars com até 5 tentativas |
| `join_session(p_code text, p_display_name text)` | retorna `jsonb` | Cria ou recupera o participante do `auth.uid()` atual na sessão |
| `create_queue_entry(p_session_id uuid, p_song_title varchar, p_artist varchar)` | retorna `TABLE(...)` | Valida sessão/participante/regra "microfone justo"/limite de fila; insere |
| `cancel_queue_entry(p_queue_id uuid)` | retorna `void` | Participante dono ou host cancela item `pending` |
| `update_queue_status(p_queue_id uuid, p_new_status text)` | retorna `TABLE(id,status,updated_at,changed)` | Só o host; valida transição de estado (`pending→preparing→singing→completed`, qualquer um → `cancelled`) |
| `update_session_status(p_session_id uuid, p_new_status text)` | retorna `TABLE(id,status,changed)` | Só o host; alterna `active`↔`paused` |
| `close_session(p_session_id uuid)` | retorna `TABLE(session_id,status,closed_at,changed)` | Só o host; idempotente (retorna `changed=false` se já fechada) |
| `get_host_session_details(p_session_id uuid)` | retorna `TABLE(...)` | Só o host proprietário; usado pelo DJ e pelo telão |
| ~~`recover_participant`~~ | **removida na migration `017`** | Referenciava uma coluna (`recovery_token_hash`) já removida na migration `005`; ficava exposta e quebrada |

---

## 7. Superfície de API e eventos

Não há rotas REST/`app/api/*` — toda a superfície é **Server Actions do Next.js** (RPC via `'use server'`, chamadas diretamente do cliente como função) mais **RPCs do Postgres** por baixo.

### Server Actions
| Função | Arquivo | Auth exigida | Entrada | Saída |
|---|---|---|---|---|
| `createSessionAction()` | `src/application/session/create-session.action.ts` | Nenhuma prévia — cria usuário anônimo se preciso | — | `{ session: Session }` \| `AppError` |
| `joinSessionAction(code, displayName)` | `src/application/participant/join-session.action.ts` | Nenhuma prévia — cria usuário anônimo se preciso | `code: string, displayName: string` | `{ participant, isRecovered }` \| `AppError` |
| `getSessionStatus(sessionId)` | `src/application/session/get-session-status.ts` | RLS (autenticado, membro ou host) | `sessionId: uuid` | `{ snapshot: SessionStatusSnapshot }` \| `AppError` |
| `updateSessionStatusAction(sessionId, newStatus)` | `src/application/session/update-session-status.action.ts` | Autenticado + host da sessão (via RPC) | `sessionId: uuid`, `newStatus: 'active'\|'paused'` | `{ result }` \| `AppError` |
| `closeSessionAction(sessionId)` | `src/application/session/close-session.action.ts` | Autenticado + host da sessão (via RPC) | `sessionId: uuid` | `{ result: CloseSessionResult }` \| `AppError` |
| `createQueueEntryAction(sessionId, input)` | `src/application/queue/create-queue-entry.action.ts` | Autenticado + participante da sessão (via RPC) | `sessionId: uuid`, `{ songTitle, artist }` | `{ queueEntry }` \| `AppError` |
| `cancelQueueEntryAction(queueId)` | `src/application/queue/cancel-queue-entry.action.ts` | Autenticado + dono da música ou host (via RPC) | `queueId: uuid` | `AppSuccess<void>` \| `AppError` |
| `updateQueueStatusAction(queueId, newStatus)` | `src/application/queue/update-queue-status.action.ts` | Autenticado + host (via RPC) | `queueId: uuid`, `newStatus: QueueStatus` | `{ result }` \| `AppError` |
| `listActiveQueueAction(sessionId)` | `src/application/queue/list-active-queue.action.ts` | Autenticado (RLS filtra por participação/host) | `sessionId: uuid` | `{ queue: ActiveQueueEntry[] }` \| `AppError` |

Todas retornam a união `AppSuccess<T> | AppError` (`{ ok: true, ... }` ou `{ ok: false, code, userMessage }`), nunca lançam para o chamador em fluxo esperado.

### Eventos de tempo real (Supabase Realtime)
| Canal/tópico | Tipo | Payload | Quem emite | Quem consome |
|---|---|---|---|---|
| `session-{sessionId}-{uuid}` | `postgres_changes` `UPDATE` em `public.sessions` (`filter: id=eq.<id>`) | Linha completa de `sessions` (`id,code,status,closed_at`) | Postgres (trigger de replicação) após `update_session_status`/`close_session` | `useSessionLifecycle.ts` — todas as 3 superfícies via `SessionLifecycleProvider` |
| `queue:{sessionId}:{uuid}` | `postgres_changes` `*` em `public.queue` (`filter: session_id=eq.<id>`) | INSERT/UPDATE/DELETE da linha `queue` | Postgres, após qualquer RPC de fila | `useActiveQueue.ts` — DJ, participante, telão |
| `participants:{sessionId}:{uuid}` | `postgres_changes` `*` em `public.participants` (`filter: session_id=eq.<id>`) | INSERT/UPDATE/DELETE da linha `participants` | Postgres, após `join_session` | `useSessionParticipants.ts` — usado pelo painel do DJ |
| `presence:session:{sessionId}` | Supabase **Presence** (`track`/`untrack`, evento `sync`) | `{ participantId, onlineAt }` | Cliente do participante (`useTrackParticipantPresence`, montado em `ParticipantQueueExperience`) | `useSessionPresence.ts` — painel do DJ (contagem/lista de online) |

Todos os canais fazem `supabase.realtime.setAuth(accessToken)` antes de assinar (RLS também se aplica a Realtime) e têm lógica de reconexão com backoff próprio (ver seção 5).

---

## 8. Autenticação e permissões

- **Autenticação**: Supabase Auth anônima para **todos os papéis**, sem distinção de UI entre "criar sessão como host" e "entrar como participante" no nível de auth — a única diferença é *o que* a pessoa faz com o `auth.uid()` resultante.
  - Quem chama `create_session()` vira `host_id` daquela sessão (derivado no servidor via `auth.uid()`, nunca enviado pelo cliente — corrigido na migration `017`).
  - Quem chama `join_session(code, nome)` vira um `participants` row com `auth_user_id = auth.uid()` daquela sessão.
  - A mesma pessoa (mesmo `auth.uid()`, persistido via cookie de sessão do Supabase) pode ser host de uma sala e participante de outra.
- **Entrada do participante**: código de 6 caracteres (`/entrar?codigo=...` ou digitado em `/sala/[code]`), validado por `validateSessionCode` (`src/domain/validators/session-code.validator.ts`) contra o mesmo alfabeto do gerador SQL.
- **QR Code**: gerado no servidor (`src/infrastructure/qr/room-entry-qr.server.ts`, lib `qr`) apontando para a URL pública canônica (`APP_PUBLIC_URL`) + `/sala/{code}`, exibido no telão (`DisplayJoinPanel`).
- **Restrição host-only do telão**: `app/sala/[code]/display/page.tsx` chama `getHostSessionDetails(sessionId)`, que por sua vez chama a RPC `get_host_session_details` — essa RPC **lança exceção se `auth.uid()` não for o `host_id`**. Se `getHostSessionDetails` retornar `null` (erro/RLS/não-owner), a página faz `redirect` para `/sala/{code}` (visão de participante). Não há verificação adicional de sessão/role fora dessa chamada — a autorização é **inteiramente delegada ao banco**.
- **Matriz de permissões** (reconstituída das RPCs e políticas RLS):

| Ação | Participante (dono do recurso) | Participante (outro) | Host da sessão | Anônimo não autenticado |
|---|---|---|---|---|
| Ver status da sessão (`sessions`) | ✅ (membro) | ✅ (membro) | ✅ | ❌ (RLS bloqueia `SELECT` para não-autenticado desde a migration `016`) |
| Ver fila (`queue`) | ✅ | ✅ (mesma sessão) | ✅ | ❌ |
| Ver participantes | ✅ (sessão aberta) | ✅ (sessão aberta) | ✅ | ❌ |
| Criar sessão | — | — | (torna-se host) | ❌ (precisa autenticar, mesmo que anonimamente) |
| Entrar na sessão | — | — | — | ❌ (idem) |
| Pedir música | ✅ | ❌ (só o próprio) | ✅ (host também pode cantar) | ❌ |
| Cancelar música | ✅ (a própria, `pending`/`preparing`) | ❌ | ✅ (qualquer uma) | ❌ |
| Avançar status da música (`preparing`/`singing`/`completed`) | ❌ | ❌ | ✅ | ❌ |
| Pausar/retomar sessão | ❌ | ❌ | ✅ | ❌ |
| Encerrar sessão | ❌ | ❌ | ✅ | ❌ |
| Ver telão (host-only) | ❌ | ❌ | ✅ | ❌ |

---

## 9. Verificação do roadmap

Roadmap reportado (fornecido pelo usuário) confrontado item a item com o código.

### Pause/resume da sessão — **CONCLUÍDO**
Evidência: RPC `update_session_status` (migrations `015`→`016`); Server Action `updateSessionStatusAction`; componente `src/components/session/SessionStatusToggle.tsx` (com timeout de confirmação de 8s e recuperação de estado); testes `src/components/__tests__/SessionStatusToggle.test.tsx`, `src/components/__tests__/HostDashboardPauseControl.test.tsx`, `src/application/__tests__/session-status-writers.test.ts`; E2E `e2e/pause-resume.spec.ts`. Sem divergência.

### CI, testes e segurança — **CONCLUÍDO**
Evidência: `.github/workflows/ci.yml` com 4 jobs (`quality` → typecheck/lint/build/`npm audit`; `database` → pgTAP + integração + concorrência via Supabase local em Docker; `e2e-chrome` obrigatório; `e2e-webkit` informativo/`continue-on-error`); `.github/workflows/realtime-performance.yml` (benchmark agendado diário). Nesta auditoria: typecheck, lint, unit (340 testes/55 arquivos) e build **passaram**; testes que dependem de Docker não puderam ser confirmados aqui (ambiente sem Docker), mas o pipeline e os arquivos de teste (`supabase/tests/*.sql`, `*.integration.test.ts`) existem e são substanciais. A branch atual corrigiu uma falha de segurança real (migration `017`, ver seção 11). Sem divergência relevante — apenas a ressalva de que a checagem de segurança é um processo contínuo (bugs de RLS/RPC continuam aparecendo e sendo corrigidos, o que é esperado, não uma falha do item do roadmap).

### Renovação visual completa (participante, home/entrada, painel do DJ) — **CONCLUÍDO**
Evidência: commits `c47e370 feat: redesign participant queue experience (#3)`, `f1be38a feat: redesign home and entry experience (#4)`, `345c5ce feat: redesign DJ dashboard (#5)`; branches remotas correspondentes (`feat/participant-visual-refresh`, `feat/home-entry-visual-refresh`, `feat/dj-dashboard-visual-refresh`) já mescladas; CSS modules "neon" dedicados (`vocalis-neon-foundation.module.css`, `participant-neon.module.css`, `dj-dashboard.module.css`); testes de estilo (`ParticipantNeonStyles.test.ts`, `DjDashboardStyles.test.ts`). Sem divergência.

### Telão para TV/projetor — **CONCLUÍDO**
Evidência: `app/sala/[code]/display/page.tsx` + `src/components/display/*` (10 componentes); acesso host-only via `get_host_session_details` (seção 8); fila em tempo real via `useActiveQueue`; QR code via `generateRoomEntryQr`; tela cheia via `DisplayFullscreenButton.tsx`; estados de pausa (`DisplayConnectionBanner`), offline (idem) e encerramento (`DisplayClosedState.tsx`) todos implementados e com teste próprio (`DisplayExperience.test.tsx`, `DisplayFullscreenButton.test.tsx`, `display-architecture.test.ts`, `display-queue-presentation.test.ts`); E2E `e2e/public-room-display.spec.ts`; commits `651ee2f feat: add public display technical foundation (#6)` e `c9ee3ca feat: add host-only public room display (#7)`. Sem divergência.

### Histórico das sessões — **NÃO ENCONTRADO** (reportado como "em andamento")
Nenhuma evidência de código: sem tabela/coluna de histórico ou arquivamento nas 17 migrations; sem tipo `SessionHistory`/`HistoryEntry` em `src/domain`; sem Server Action, hook, componente, rota ou teste com "history"/"histórico" no nome (busca por regex `hist(o|ó)ric|history` no código-fonte retornou zero ocorrências fora de `specs/003-close-session/` e do relatório do Playwright); sem pasta `specs/004-*`. **Divergência confirmada com o roadmap reportado** — ver seção 10 para detalhamento e hipóteses.

### Presença online dos participantes — **CONCLUÍDO** (reportado como "não iniciado")
Evidência direta: `src/hooks/useSessionPresence.ts` implementa `useTrackParticipantPresence` (o participante anuncia presença via canal Presence `presence:session:{sessionId}`) e `useSessionPresence` (quem lê quem está online). Ambos **estão em uso real**, não são código órfão:
- `src/components/participant/ParticipantQueueExperience.tsx:31` chama `useTrackParticipantPresence(sessionId, participant.id)`.
- `src/components/dj/DjDashboardExperience.tsx:117` chama `useSessionPresence(sessionId)` e usa o resultado para contar participantes online (`DjSessionMetrics`) e destacar quem está online em `DjParticipantsPanel`.
- Testes dedicados existem e mockam esses hooks (`DjDashboardExperience.test.tsx`, `ParticipantQueueExperience.test.tsx`).
**Divergência confirmada com o roadmap reportado** — o item está pronto, não "não iniciado". Nota: a implementação é via Presence (efêmero, em memória do Realtime), não persiste `is_online` no banco — a coluna `is_online` mencionada em `AGENTS.md` (seção 4, schema idealizado) **não existe** na tabela real `participants`; a informação de "online" nunca é durável, só existe enquanto há clientes conectados ao canal.

### Reordenação manual da fila pelo DJ — **NÃO ENCONTRADO**
Nenhuma RPC de reordenação, nenhum handler de drag-and-drop, nenhuma escrita em `position` fora do `INSERT` inicial. Ver seção 6 para o que já existe (o campo `position`) e o que falta. Consistente com o roadmap reportado ("não iniciado").

### Snapshot e experiência offline mais completa — **PARCIAL**
O que já existe: banner de offline (`src/components/ui/OfflineBanner.tsx`, com teste), hook `useOnlineStatus`, lógica de reconexão com backoff e leitura autoritativa em `useSessionLifecycle`/`useActiveQueue` (seção 5), Service Worker cacheando o "shell" do PWA (manifest + ícones). O que falta: o SW **exclui explicitamente** `/sala/*` e o domínio Supabase do cache (`public/sw.js:54-61`) — ou seja, não há nenhum snapshot de dados de sessão/fila para uso offline real; se a rede cair, a UI mostra estado "offline"/"reconectando" mas não continua funcional com dados antigos além do que já está em memória do React. Não há `localStorage`/`IndexedDB` para persistir a última fila conhecida entre recarregamentos. Consistente com "não iniciado" para a parte de *snapshot*, mas o roadmap reportado ("não iniciado") subestima a parte de *resiliência de reconexão*, que já é sofisticada.

### Staging e produção — **NÃO ENCONTRADO**
Nenhum arquivo de deploy (`vercel.json`, `Dockerfile`, `fly.toml`, `netlify.toml`) no repositório; nenhuma menção a ambiente de staging em specs ou docs. Consistente com o roadmap reportado ("não iniciado").

### Documentação e limpeza final — **NÃO ENCONTRADO / PARCIAL**
README e `AGENTS.md` existem e estão atualizados o suficiente para orientar instalação. Porém há limpeza pendente identificável no código (ver seção 11 — componentes `queue/QueueItem.tsx` e `queue/QueueList.tsx` órfãos). Consistente com "não iniciado" como item de trabalho dedicado.

---

## 10. Histórico das sessões — estado detalhado

**Resultado da varredura**: não existe nenhum artefato de código para esta feature. Detalhamento do que foi checado:

- **Schema/migrations**: as 17 migrations em `supabase/migrations/` não criam nenhuma tabela de histórico/arquivo (`session_history`, `sessions_archive`, `queue_history` ou similar). A única forma de "histórico" que o schema atual permite é a própria tabela `sessions` com `status = 'closed'` — mas o Host só consegue enxergar isso enquanto sabe o `code`/`id` da sessão (não há listagem "minhas sessões anteriores"; `sessions_host_id_idx` existe como índice, mas nenhuma query/RPC no código o usa para listar sessões de um host).
- **Backend (Server Actions/RPCs)**: nenhuma função com "history" no nome; nenhuma RPC de listagem de sessões por host.
- **UI**: nenhum componente, rota ou link para "histórico" em nenhuma das 3 superfícies. O menu/dashboard do DJ (`DjDashboardExperience.tsx`) não tem nenhuma aba ou seção correspondente.
- **Testes**: nenhum teste (unitário, integração, pgTAP ou E2E) menciona histórico.
- **Specs**: só existem `specs/001-room-access-mvp/`, `specs/002-song-queue/` e `specs/003-close-session/` — não há `specs/004-*` nem qualquer rascunho de spec para histórico em nenhum lugar do repo (busquei também dentro de `.specify/` e `.agents/`, sem resultado).
- **Branches**: nenhuma branch local ou remota (`git branch -a`) tem "history" no nome. As branches existentes são: `003-close-session`, `chore/bump-nanoid-security`, `feat/public-room-display`, `feat/public-room-display-ui`, `fix/integration-database-guard`, `fix/session-ownership-integrity` (atual), `main`, `teste`, mais as variantes de refresh visual já mescladas. Nenhuma corresponde a "histórico".
- **Trabalho não commitado**: `git status` está limpo na branch atual; não há stash (`git stash list` vazio).

**Conclusão**: o roadmap reportado diz "EM ANDAMENTO, é aqui que paramos" para este item, mas **não há literalmente nenhum vestígio de trabalho iniciado** — nem um arquivo esboçado, nem uma branch, nem uma migration draft, nem um teste pendente (skipped/`.todo`). Isso é uma divergência real que precisa de esclarecimento humano (ver seção 14): ou (a) o trabalho foi feito em uma branch que não chegou a ser empurrada/mesclada e foi perdida, (b) o planejamento foi feito fora do repositório (documento externo, conversa) e nunca chegou a código, ou (c) houve confusão entre "história/histórico de sessões" e alguma outra feature já concluída (por exemplo, a "recuperação de participante" ou o próprio "encerramento de sessão", que preserva dados após `closed`).

---

## 11. Dívida técnica, bugs e armadilhas

- **Nenhum TODO/FIXME/HACK/XXX/@deprecated encontrado** em `src/`, `app/`, `scripts/`, `supabase/`, `e2e/`, `__tests__/` (busca regex, case-insensitive). Isso é incomum e positivo — sugere disciplina de não deixar marcadores soltos — mas também significa que a dívida abaixo não está sinalizada no próprio código.
- **Código morto real**: [`src/components/queue/QueueItem.tsx`](src/components/queue/QueueItem.tsx) e [`src/components/queue/QueueList.tsx`](src/components/queue/QueueList.tsx) não são importados por nenhuma rota ou componente de superfície ativa (confirmado por busca de import — só aparecem em seus próprios arquivos e em `src/components/__tests__/SessionWriteControls.test.tsx`, que os testa isoladamente, e em `HostDashboardPauseControl.test.tsx`, que só faz `vi.mock` deles). O painel do DJ usa `DjCompactQueueList` (`src/components/dj/DjQueuePanels.tsx`), não `QueueList`. **Risco**: mudanças na regra de negócio (ex.: novos status) podem ser aplicadas em `QueueItem`/`QueueList` por engano, dando falsa sensação de cobertura, enquanto o componente realmente renderizado (`DjQueuePanels.tsx`) fica desatualizado. `src/components/queue/RequestSongForm.tsx`, por outro lado, **é usado de verdade** (via `RequestMusicSheet.tsx`) — não remover esse.
- **Duplicação de lógica de reconexão Realtime**: `useSessionLifecycle.ts` e `useActiveQueue.ts` reimplementam quase o mesmo protocolo (auth do canal, backoff, `isCurrentEffect`, recuperação após `visibilitychange`/`online`/`pageshow`) de forma independente, ~500 e ~620 linhas respectivamente. Funciona e está bem testado, mas é a maior superfície de manutenção do projeto — um bug de reconexão tende a precisar ser corrigido (e testado) duas vezes. `useSessionParticipants.ts` tem uma versão mais simples do mesmo padrão, sem backoff.
- **`AGENTS.md` descreve um schema que diverge do real**: a seção 4 do `AGENTS.md` lista colunas `is_online` em `participants` e não menciona `auth_user_id`, `disambiguation_index`, `max_participants`/`max_queue_entries` em `sessions`. O schema real (banco) é mais rico e usa Presence em vez de uma coluna `is_online`. Isso não é bug de código, mas pode confundir quem ler `AGENTS.md` como fonte de verdade do schema — a fonte de verdade real são as migrations + `database.types.ts`.
- **Histórico de migrations mostra retrabalho de segurança já corrigido, mas vale reforçar como área sensível**: `create_session` teve seu parâmetro `p_host_id` removido só na migration `017` (14/08) — antes disso, qualquer usuário autenticado (`anon`/`authenticated`, já que o grant padrão do Postgres a `PUBLIC` nunca tinha sido revogado) podia potencialmente criar uma sessão em nome de outro `host_id` conhecido. Já corrigido, mas é o tipo de padrão (RPC nova sem `REVOKE ALL FROM PUBLIC` explícito) que pode se repetir se uma migration futura não seguir a mesma disciplina.
- **`recover_participant` ficou exposta e quebrada por várias migrations** (criada na `003`, referenciava `recovery_token_hash`, coluna removida na `005`, só foi removida como função na `017`) — ou seja, por ~1 mês de histórico de commits havia uma RPC pública chamável que sempre falharia (ou pior, tinha comportamento indefinido) se alguém a invocasse. Não achei evidência de exploração, só do próprio comentário da migration `017` reconhecendo o problema.
- **`.env.local` presente no diretório de trabalho** (não commitado, mas existe no disco) — não foi lido por conter potenciais segredos; qualquer scripts/automação nova deve ter cuidado para não vazar esse arquivo (já está no `.gitignore`, confirmado).
- **Área sensível para mexer**: qualquer alteração em `session-lifecycle.reducer.ts` ou nas RPCs de transição de status (`update_session_status`, `close_session`) — o comportamento de "sessão fechada é terminal" está espalhado em pelo menos 3 lugares (trigger SQL `enforce_session_state_transition`, reducer TS `if (state.phase === 'closed' && event.type !== 'reset') return state`, e checagens `isClosedRef`/`enterTerminalState` no hook) — uma mudança em um lugar sem replicar nos outros dois quebra a garantia de "nunca reabrir uma sessão fechada".

---

## 12. Testes e CI

**Cobertura por tipo** (contagem de arquivos, VERIFICADO por listagem de diretório):
- Unitários (Vitest, `test:unit`): 55 arquivos — domínio (`src/domain/__tests__/`), aplicação/Server Actions (`src/application/__tests__/`), hooks (`src/hooks/__tests__/`), componentes (`src/components/__tests__/` e `src/components/display/__tests__/`), infraestrutura pura (`src/infrastructure/__tests__/`, exceto os dois sufixados `.integration.test.ts`), scripts de tooling (`scripts/__tests__/`).
- Integração (`test:integration`, exige Supabase local): `src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts`, `session-closure-preservation.integration.test.ts`, `src/infrastructure/realtime/session-realtime.integration.test.ts`.
- Banco/pgTAP (`test:db`): `supabase/tests/*.sql` — 9 arquivos cobrindo RLS de `sessions`/`participants`/`queue`, invariantes de encerramento, concorrência, privilégios, e a integridade de posse (`017_session_ownership_integrity.sql`, específico da branch atual).
- E2E (Playwright, `test:e2e*`): 17 specs em `e2e/`, cobrindo criação/entrada de sessão, pausa/retomada, encerramento (6 specs dedicados: host, leave, realtime, reconnect, recovery, slow-network, write-blocking — 7 na verdade), telão público, recuperação de participante, prefill de código de entrada, e "neon" (regressão visual/estrutural) para marketing, participante e DJ.
- Performance: `.github/workflows/realtime-performance.yml`, job agendado diário que roda `test:e2e:performance` e publica métricas em `specs/003-close-session/validation/realtime-p95/`.

**Execução real nesta auditoria**:
| Suíte | Resultado |
|---|---|
| `npm run typecheck` | ✅ Sem erros |
| `npm run lint` | ✅ Sem erros/avisos |
| `npm run test:unit` | ✅ 55 arquivos, **340 testes**, 100% passando, 26.77s |
| `npm run build` | ✅ Build de produção completo, 6 rotas geradas |
| `npm run test:integration`, `test:db`, `test:db:race`, `test:e2e*` | **Não executados** — exigem Docker (Supabase local), indisponível no ambiente desta análise (`docker info` falhou) |

Não há indicação de testes marcados como `skip`/`todo`/`xit` nos arquivos lidos, nem menção a flakiness conhecida em specs ou CI (o único job com `continue-on-error: true` é `e2e-webkit`, explicitamente rotulado "informativo" — WebKit não bloqueia o merge, mas roda).

**O que a pipeline faz** (`.github/workflows/ci.yml`, roda em PR e push para `main`):
1. `quality` (bloqueante): fixa versões exatas de Node/npm, `npm ci`, testes de proteção dos executores locais (`test:ci:environment`), unitários, typecheck, lint, build com env placeholder, `npm audit --omit=dev --audit-level=high`.
2. `database` (depende de `quality`): sobe Supabase local via Docker, roda pgTAP, integração e concorrência.
3. `e2e-chrome` (depende de `quality`, bloqueante): Playwright em Chromium mobile.
4. `e2e-webkit` (depende de `quality`, **não bloqueante**): Playwright em WebKit mobile, informativo.

Mais um workflow separado (`realtime-performance.yml`) agendado (`cron: '17 4 * * *'`) e manual (`workflow_dispatch`) para benchmark de latência do Realtime.

---

## 13. Estado do git

- **Branch atual**: `fix/session-ownership-integrity`, sincronizada com `origin/fix/session-ownership-integrity`, working tree limpo (sem alterações não commitadas, sem stash).
- **Commit HEAD**: `6fb70e6` — merge de `origin/main` na branch de fix (traz `ba645bb chore: bump nanoid security patch (#8)` para dentro da branch).
- **Commit de trabalho real da branch**: `1dc78a4 fix: enforce session ownership integrity` — implementa exatamente a migration `017` descrita nas seções 6, 9 e 11 (remove `p_host_id` de `create_session`, remove `recover_participant`, adiciona FK composta `queue → participants(id, session_id)`).
- **Últimos 10 commits em `main`** (`git log --oneline -50`, mais recentes primeiro):
  ```
  6fb70e6 Merge remote-tracking branch 'origin/main' into fix/session-ownership-integrity
  ba645bb chore: bump nanoid security patch (#8)
  1dc78a4 fix: enforce session ownership integrity
  c9ee3ca feat: add host-only public room display (#7)
  651ee2f feat: add public display technical foundation (#6)
  b239368 bug fix
  345c5ce feat: redesign DJ dashboard (#5)
  f1be38a feat: redesign home and entry experience (#4)
  c47e370 feat: redesign participant queue experience (#3)
  46d32fd test: require validated local database for preservation test (#2)
  ```
- **Branches locais**: `003-close-session`, `chore/bump-nanoid-security`, `feat/public-room-display`, `feat/public-room-display-ui`, `fix/integration-database-guard`, `fix/session-ownership-integrity` (atual), `main`, `teste`.
- **Branches remotas sem equivalente local visitado nesta análise além do checkout do log**: `feat/dj-dashboard-visual-refresh`, `feat/home-entry-visual-refresh`, `feat/participant-visual-refresh` (todas já mescladas em `main`, a julgar pelos commits `#3`/`#4`/`#5` presentes no log de `main`).
- **Branches com commits não mesclados em `main`** (verificado via `git log main..<branch>`):
  - `feat/public-room-display`: 2 commits (`066885d feat: add room entry QR foundation`, `22dbf16 fix: harden active queue realtime recovery`) — **na verdade já superados**: o telão foi mesclado por outro caminho (`651ee2f`/`c9ee3ca`), então essa branch provavelmente está obsoleta/stale.
  - `feat/public-room-display-ui`: 2 commits (`af4602e feat: add host-only public room display`, `00cc4d1 fix: recover session lifecycle realtime channel`) — mesma situação, aparenta ser um caminho de desenvolvimento anterior ao merge final do telão.
  - `chore/bump-nanoid-security`: 1 commit, já presente em `main` via `ba645bb` (mesma mudança, commit diferente — branch stale).
  - `fix/integration-database-guard`: 1 commit (`53b23ff test: require validated local database for preservation test`) — texto idêntico ao commit `46d32fd` já em `main`; branch stale.
  - `teste`: 3 commits de CI (`a757bbf`, `6660ac5`, `f83a449`) que parecem ser a origem do que hoje é `.github/workflows/ci.yml` — provavelmente uma branch de rascunho já superada pelo que está em `main`.
  - `003-close-session`: **0 commits à frente de `main`** — totalmente mesclada.
  **INFERÊNCIA**: as branches `feat/public-room-display*`, `chore/bump-nanoid-security`, `fix/integration-database-guard` e `teste` parecem ser branches de desenvolvimento intermediárias que já cumpriram seu papel (o conteúdo foi refeito/mesclado por outro commit) e são candidatas a limpeza — mas isso deveria ser confirmado com quem as criou antes de apagar, especialmente `teste`, cujo nome sugere que pode ter sido usada para experimentação ativa.

---

## 14. Lacunas de contexto

Perguntas específicas que só uma pessoa pode responder:

1. **Histórico de sessões**: o roadmap diz que é "aqui que paramos", mas não há nenhum vestígio no repositório (seção 10). Existe uma spec, protótipo ou branch fora deste repositório (outro repo, documento, board) que descreve o que foi decidido para essa feature? Sem isso, qualquer continuação partirá do zero.
2. **Escopo combinado do histórico**: "histórico de sessões" deve mostrar só sessões passadas do mesmo host (uma espécie de "minhas salas anteriores"), ou também detalhes por sessão (lista de músicas cantadas, quem cantou, quanto tempo durou)? Isso muda completamente o modelo de dados necessário (só precisa de uma query em `sessions WHERE host_id = auth.uid() AND status = 'closed'`, que já é possível hoje sem nenhuma migration nova, vs. precisar arquivar/desnormalizar dados de `queue`/`participants` antes de um possível `ON DELETE CASCADE` ou purga).
3. **Retenção de dados**: sessões encerradas (`status = 'closed'`) ficam para sempre nas tabelas `sessions`/`participants`/`queue`, ou há um plano de expurgo/TTL? Isso é relevante tanto para "histórico" quanto para LGPD (nomes de participantes ficam armazenados indefinidamente hoje).
4. **Hospedagem de produção**: não há nenhuma configuração de deploy no repo (seção 2/9). O app já rodou em produção alguma vez? Em qual serviço (Vercel? outro?)? Isso muda a prioridade real do item "Staging e produção" do roadmap.
5. **Branches órfãs** (seção 13): `feat/public-room-display`, `feat/public-room-display-ui`, `chore/bump-nanoid-security`, `fix/integration-database-guard` e `teste` parecem stale/superadas. Podem ser apagadas, ou alguma ainda guarda trabalho relevante que não foi migrado para `main`?
6. **Reordenação manual da fila**: a intenção é reordenar só os itens `pending` (antes de entrar em preparo), ou qualquer item incluindo `preparing`/`singing`? Isso afeta diretamente o desenho da futura RPC de reordenação e sua interação com a regra "Microfone Justo".
7. **`AGENTS.md` desatualizado**: a seção 4 (schema) e a seção 3 (PWA — cita `serwist`/`next-pwa`, nenhum dos dois usado) do `AGENTS.md` não refletem mais o código. Vale atualizar o documento agora, ou isso é intencional (documento de intenção original, não espelho do estado atual)?
8. **Testes de Docker/Supabase local**: nesta análise não foi possível confirmar `test:db`, `test:integration`, `test:db:race` nem os E2E porque o Docker não estava disponível no ambiente. Alguém com Docker configurado deveria rodar `npm run test:db:prepare && npm run test:db && npm run test:integration && npm run test:db:race && npm run test:db:stop` para confirmar que esses testes (essenciais para a regra "Microfone Justo" e para a integridade de posse da migration `017`) ainda passam de fato.

---

## 15. Próximos passos recomendados

Em ordem de prioridade, considerando o estado real (não o reportado) do projeto:

1. **Confirmar/rodar a suíte completa com Docker disponível.**
   Objetivo: validar que `test:db`, `test:integration` e `test:db:race` passam com a migration `017` aplicada — essa migration mexeu em constraints/FKs centrais (`queue_participant_session_fk`) e merece confirmação empírica antes de considerar a branch `fix/session-ownership-integrity` pronta para promover.
   Arquivos prováveis: `supabase/tests/017_session_ownership_integrity.sql`, `src/infrastructure/__tests__/session-closure-*.integration.test.ts`.
   Critério de pronto: os 4 comandos de banco/integração rodam localmente e a CI (`database` job) fica verde no PR desta branch.

2. **Esclarecer com o time o real estado de "histórico de sessões" antes de continuar (ou reiniciar) a feature.**
   Objetivo: evitar retrabalho — como está hoje, começar do zero é a única opção honesta (seção 10/14, pergunta 1-3).
   Arquivos prováveis: nova pasta `specs/004-session-history/` (seguindo o padrão de `001`/`002`/`003`), nova migration `018_*`, novo diretório `src/application/history/` ou similar.
   Critério de pronto: uma spec com escopo decidido (pergunta 2 da seção 14 respondida) existe antes de qualquer código.

3. **Atualizar `AGENTS.md`** para refletir o schema real (`auth_user_id`, ausência de `is_online`, presença de `max_participants`/`max_queue_entries`) e a stack PWA real (SW manual, sem `serwist`/`next-pwa`).
   Objetivo: evitar que um assistente de IA ou um dev novo tome decisões baseadas num schema que não existe.
   Arquivos: `AGENTS.md` (seção 4 e 3).
   Critério de pronto: seção 4 bate linha a linha com `supabase/migrations/*` + `database.types.ts`.

4. **Remover ou justificar `src/components/queue/QueueItem.tsx` e `QueueList.tsx`.**
   Objetivo: eliminar a ambiguidade entre o componente de fila realmente renderizado (`DjQueuePanels.tsx`) e um componente legado testado mas não usado, que pode enganar futuras mudanças de regra de negócio.
   Arquivos: `src/components/queue/QueueItem.tsx`, `QueueList.tsx`, e o teste `SessionWriteControls.test.tsx` (decidir se migra os casos de teste relevantes para os componentes reais antes de remover).
   Critério de pronto: ou os componentes voltam a ser usados em algum lugar real, ou são removidos junto com os testes que só os exercitam isoladamente.

5. **Decidir e documentar o modelo de `position` para a futura reordenação manual da fila** (mesmo antes de implementar a UI).
   Objetivo: a decisão de design (inteiro denso recalculado vs. posição fracionária) tem implicações em toda a stack (RPC, índice único, trigger de `updated_at`, realtime) — decidir cedo evita retrabalho de migration.
   Arquivos prováveis: nova migration `018_reorder_queue_rpc.sql`, `src/application/queue/reorder-queue.action.ts` (novo), `src/components/dj/DjQueuePanels.tsx`.
   Critério de pronto: uma RPC `SECURITY DEFINER` transacional para reordenar existe, testada por pgTAP, com E2E cobrindo drag-and-drop no painel do DJ.
