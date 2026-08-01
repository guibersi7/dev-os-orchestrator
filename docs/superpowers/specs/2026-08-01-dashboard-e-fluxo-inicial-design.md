# Dashboard e Fluxo Inicial — Design

**Data:** 2026-08-01
**Status:** Aprovado para planejamento

## Objetivo

Dar ao desenvolvedor um único lugar com todos os insumos para agir: revisar PRs, resolver bugs/issues, responder pendências e desbloquear o que está travado. O trabalho cobre a jornada completa — **login → conexões (se necessário) → dashboard** — como uma experiência coesa.

## Escopo

- Autenticação de usuário (não existe hoje).
- Fluxo de entrada com gate por conexão do GitHub.
- Redesenho do dashboard como visão agrupada por **tipo de ação**.
- Notificações de "algo precisa de você" via polling (migração para WebSocket é futura).

Fora de escopo: infraestrutura de WebSocket, notificações externas (e-mail/push), refatorações não relacionadas.

## Princípios de produto

- A landing vende **valor genérico** ("todos os seus insumos de dev num lugar só"). Nenhuma menção ao GitHub no topo do funil.
- O GitHub continua sendo o **requisito técnico** para o dashboard ter conteúdo, mas isso só é revelado na tela de setup, no momento certo.
- O frontend nunca recebe tokens de provedor; só a sessão do usuário.
- Uma conexão pertence ao usuário que a autorizou, dentro do workspace.
- A regra de prioridade e o agrupamento por ação vivem no backend; o front só renderiza.

---

## Seção 1 — Jornada e autenticação

### Fluxo ponta a ponta

```
Landing (/)
  → [Entrar com Google]
  → Supabase Auth (provider Google) → cria/recupera usuário + sessão (cookie)
  → GATE (middleware): usuário tem conexão GitHub ativa?
        ├─ NÃO → /setup   (conectar GitHub obrigatório; demais opcionais → sync → dashboard)
        └─ SIM → /dashboard
```

### Decisões

- **Auth:** Supabase Auth com provider Google. Reaproveita a infra de Supabase já usada para dados; sem nova dependência.
- **Gate no middleware:** `middleware.ts` do Next intercepta rotas de workspace, consulta `GET /v1/connections` (com cache curto) e decide o destino:
  - Sem GitHub ativo → redireciona para `/setup`.
  - Com GitHub ativo → segue.
- **Conexão por usuário:** a sessão do usuário passa a escopar as conexões (o backend já escopa por `(workspace, user, service)`). Login estabelece "quem é você" antes de "o que você conectou".
- **Consolidação:** hoje existem dois fluxos concorrentes — `/onboarding` e `/setup/*`. O design unifica em **um só** (`/setup`) e aposenta o `/onboarding`.

### Landing / CTA

- Narrativa de valor genérico: reviews, bugs, respostas e bloqueios num lugar só.
- CTA único: **"Entrar com Google"** (ou "Começar").
- Zero menção a GitHub no topo do funil. O requisito de GitHub aparece apenas em `/setup`.

### Estados do `/setup`

1. **GitHub desconectado** → único CTA em destaque ("Conectar GitHub"); demais integrações visíveis, porém em segundo plano.
2. **GitHub conectado** → aparece "Ir para o dashboard" + lista de integrações opcionais para adicionar.
3. **Primeira sync** roda automaticamente ao conectar o GitHub, para o dashboard já ter conteúdo.

---

## Seção 2 — Anatomia do dashboard (layout "Foco + seções empilhadas")

### Estrutura vertical da tela

1. **Cabeçalho** — saudação + label de última sync + botão "Sincronizar" (polling manual) + sino de notificações (contador do que é novo desde a última visita).
2. **Bloco "Agora"** (hero de foco) — o item nº1 mais urgente de qualquer ação, com título, fonte, contexto curto e ação primária (ex.: "Revisar PR #123"). É o "o que precisa de você agora".
3. **Faixa de métricas** (`MetricStrip` existente) — contadores clicáveis que rolam até a seção: **Revisar · Resolver · Responder · Desbloquear** (+ fontes conectadas).
4. **Seções empilhadas por ação**, cada uma colapsável, com contador, ordenadas por urgência interna:
   - **Revisar** — PRs esperando sua review (idade, nº de arquivos, se bloqueia release).
   - **Resolver** — issues/bugs atribuídos a você (prioridade P0–P2, status).
   - **Responder** — menções, comentários de PR, threads de Slack aguardando resposta.
   - **Desbloquear** — itens onde você é o gargalo, ou que bloqueiam um release/outra pessoa.
   - Seção sem itens **não aparece**.
5. **Rodapé de contexto** (opcional) — weekly summary compacto / atividade recente, para "me atualiza do que perdi".

### Regras de comportamento

- Cada item é um card com: ícone da fonte, título, metadados de urgência e **uma ação primária** que abre a origem (deep-link) ou a tela de detalhe interna (`/pull-requests/[id]`, `/issues/[id]`).
- Prioridade calculada no backend a partir do `WorkEvent`. O front apenas ordena pelo score recebido.
- **Estado quase-vazio** (só GitHub conectado, apenas PRs): mostra só Revisar + convite discreto "Conecte Linear/Slack para ver bugs e respostas aqui também".

---

## Seção 3 — Dados, polling, estados e testes

### Fluxo de dados

```
Provedores → sync (Go API) → normaliza em WorkEvent → Supabase
                                        ↓
Web (Server Component) → GET /v1/dashboard → payload já priorizado
                                        ↓
        Dashboard agrupa por ação + score de urgência (vindo do backend)
```

- O backend entrega o dashboard **já com score de urgência e agrupamento por ação** calculados. O front não reimplementa regra de prioridade.
- `WorkEvent` ganha (ou deriva) dois campos de apresentação:
  - `actionGroup`: `review | resolve | respond | unblock`
  - `urgencyScore`: número
- Assim o dashboard vira um mapeamento direto do payload.

### Polling (agora) → WebSocket (depois)

- Hook client `usePolling` revalida o dashboard em intervalo (ex.: 60s) e ao focar a aba. Reusa o mesmo endpoint do server component.
- **Sino de notificações**: compara o resultado novo com o último visto (por `id`/`occurredAt`) e mostra o delta ("2 novos itens precisam de você").
- **Contrato preparado para troca:** a fonte de atualização fica atrás de uma interface (`subscribeDashboard`). Hoje implementada por polling; futuramente por WebSocket, sem tocar nos componentes.

### Estados a cobrir

| Estado | O que mostra |
|---|---|
| Não logado | Landing / redireciona para login |
| Logado, sem GitHub | Gate → `/setup` |
| GitHub conectado, sync em andamento | Dashboard com skeletons |
| Conectado, zero pendências | "Tudo em dia" (empty state positivo) |
| Quase-vazio (só GitHub) | Só seções com itens + convite a conectar mais |
| Gateway offline / erro de sync | Banner de erro + último dado em cache |

### Tratamento de erros

- **Gateway offline:** banner não-bloqueante + mantém último payload em cache (não apaga a tela).
- **Sync de um provedor falha:** dashboard segue com as outras fontes; a fonte com erro mostra estado degradado no seu card/health.
- **Auth expirada:** middleware redireciona ao login preservando o destino (`?redirect=`).

### Testes

- **Go:** unit tests do cálculo de `actionGroup` + `urgencyScore` e da normalização em `WorkEvent`.
- **Web:** testes de view-model (`buildReviewQueue`/`buildIssueQueue` existentes) estendidos para o agrupamento por ação; testes dos estados vazios/erro; teste do gate no middleware (com/sem GitHub → destino correto).
- **E2E (happy path):** login Google (mock) → sem GitHub → `/setup` → conecta → dashboard com itens.

---

## Decisões registradas

| Tema | Decisão |
|---|---|
| Escopo | Login + fluxo + dashboard como jornada única |
| Login | SSO com Google (Supabase Auth) |
| Organização do dashboard | Agrupado por tipo de ação (Revisar/Resolver/Responder/Desbloquear) |
| Layout | Foco + seções empilhadas (hero "Agora" + seções colapsáveis) |
| Notificações | Polling agora; WebSocket depois, atrás de interface `subscribeDashboard` |
| Gate pós-login | Sem GitHub → `/setup`; com GitHub → `/dashboard` |
| Ênfase na landing | Valor genérico; GitHub só aparece em `/setup` |
