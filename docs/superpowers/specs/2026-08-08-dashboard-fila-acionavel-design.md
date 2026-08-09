# Dashboard: fila acionável

Data: 2026-08-08
Escopo: `apps/web` — tela `/(workspace)/dashboard/[workspaceId]`

## Problema

A tela atual renderiza dados: quatro cards de métrica, uma lista de PRs, uma
timeline crua e um rail de cards paralelos. O usuário precisa comparar blocos
entre si para descobrir o que importa — trabalho que o produto deveria fazer por
ele. O objetivo é uma tela escaneável em 10 segundos que responda: o que exige
ação agora, o que está bloqueado, o que espera outra pessoa, e qual é o próximo
passo.

## Direção

Fila única ranqueada como elemento principal, com as categorias virando filtros
sobre a mesma lista em vez de seções empilhadas. Contexto (weekly, fontes,
sinal recente, timeline) vive num rail secundário. A timeline deixa de ser
protagonista.

O contrato da API Go não muda.

## Identidade do viewer

O payload de `/v1/dashboard` não identifica o viewer — `WorkEvent` só traz
`actor`. A distinção "seu turno" vs "esperando outros" é resolvida no frontend.

`apps/web/src/lib/viewer-identity.ts` (novo):

- `buildViewerIdentity(session, connections)` → `{ handles: Set<string>,
  byService: Partial<Record<Service, string>>, resolved: boolean }`.
  Fontes, em ordem de confiança: `ConnectionStatus.providerAccountId` por
  serviço (de `/v1/connections`), o e-mail da sessão, o nome da sessão. Tudo
  normalizado: lowercase, trim, `@` removido, e o local-part do e-mail também
  entra em `handles`.
- `isViewerActor(event, identity)` → tenta `byService[event.service]` primeiro,
  depois `handles`. Comparação exata sobre valores normalizados; sem match
  parcial ou fuzzy.
- `resolved` é `false` quando não há nenhum `providerAccountId` e nenhum handle
  casa com algum `actor` do payload.

Quando `resolved` é `false`, a tela degrada para modo workspace: mesmas seções,
rótulos de time ("Needs action" em vez de "Your turn"), e uma linha discreta sob
o brief explicando que Standup não reconheceu o usuário nas fontes conectadas.

A página passa a fazer três fetches em paralelo: dashboard, workspaces e
connections. Falha do fetch de connections não quebra a tela — cai no modo
workspace.

## View model

`apps/web/src/lib/dashboard-view-model.ts`, estendido.
`normalizeDashboardPayload` permanece inalterado.

- `scoreItem(event, identity)` → soma de: severidade (CI falhou 100, bloqueado
  90, review pedido 60, issue atribuída 40, decisão/risco 30, sinal 10), `+25`
  se `isViewerActor`, prioridade (`high` 20, `medium` 10), e idade
  (`log` das horas, teto 15). O score não aparece na UI.
- `buildActionQueue(dashboard, identity)` → `QueueItem[]` ordenado por score
  decrescente. Cada item: `id`, `service`, `title`, `reason`, `action`
  (`{ label, href, primary }`), `age`, `priority`, `lane`.
  `lane` é `"action" | "waiting" | "blocked"`.
  Fontes, nesta ordem: `dashboard.focus` (já traz `reason` e `action` do
  backend e hoje está subaproveitado), depois `today.failedChecks`,
  `today.blockedPrs`, `today.prsWaitingForReview`, `today.assignedIssues`.
  Dedupe por `externalId` quando presente, senão por `id`.
- `buildRecentSignal(dashboard)` → eventos de Slack/Notion e eventos de
  decisão/risco, agrupados por serviço, teto de 8.
- `buildDashboardNarrative(dashboard, queue, identity)` → `{ headline, subline }`
  derivado dos contadores reais e do topo da fila. Nenhum número inventado;
  termos com valor zero são omitidos da frase em vez de renderizados como "0".
- `resolveEventUrl(event)` → procura em `event.raw` as chaves `url`, `html_url`,
  `htmlUrl`, `permalink`, `webUrl`, `externalUrl`, nessa ordem; aceita apenas
  string não-vazia; retorna `null` se nada servir. Sem link, o botão do item
  vira secundário apontando para `/integrations/{service}`.

`buildReviewQueue` e `buildIssueQueue` deixam de ser usados pela página nova e
são removidos junto com seus tipos, desde que nenhum outro módulo os importe.

## Componentes

Novo diretório `apps/web/src/components/dashboard/`. `components/workspace/`
continua com shell e integrações. Todos server components exceto `QueueFilters`.

- `TodayBrief` — primeira dobra. Nome do workspace, badge de sync, e a frase de
  síntese em destaque. Abaixo, quatro métricas em texto corrido (não cards),
  cada uma com número e consequência ("2 bloqueadores · travando outra pessoa"),
  atuando como link para o filtro correspondente. Substitui `MetricStrip` nesta
  tela. O badge de sync tem três tons: verde (sincronizado), âmbar (sync antigo
  ou em andamento) e vermelho (gateway offline).
- `ActionQueue` — coluna principal. Header com contagem e `QueueFilters`. Linhas
  em `divide-y` dentro de um único `Card`. A fila é ordenada só por score: as
  lanes se intercalam e **não há divisor nem agrupamento por lane** — a lane é
  comunicada apenas pelo chip da linha. Rodapé com a contagem de eventos que não
  exigem ação.
- `QueueFilters` — faixa de `<Link>` (`all | action | waiting | blocked`) com a
  contagem de cada lane e `aria-current` no ativo. Sem estado de cliente.
- `QueueRow` — a linha. Grid `[1fr_auto]`. Chip de lane, `ServiceBadge`, fonte e
  idade em mono; título; `reason` com `line-clamp-2`; ação à direita.
  `priority: "high"` adiciona uma barra de acento de 2px na borda esquerda
  (`--danger-600` quando `lane` é `blocked`, `--standup-accent` caso contrário);
  `medium` e `low` não recebem realce. É o único destaque de linha da fila.
- `ServiceBadge` — ícone `lucide-react` mais rótulo, a partir de um mapa único
  por serviço; reusa `Badge` de `components/ui`.
- `SignalBoard` — rail: sinal recente de Slack/Notion/decisões, agrupado por
  serviço. O cabeçalho de cada grupo é sempre um link para
  `/integrations/{service}`; itens sem link resolvido são texto não clicável.
- `SourceSignalList` — substitui o card "Connected sources": por serviço, quantos
  eventos contribuíram e o status de sync; fontes não conectadas ao final,
  apagadas, com CTA de conexão.
- `WeeklyProgress` — merged PRs, closed issues e decisões como três números;
  riscos como lista de texto; `activeWork` como contagem.
- `Timeline` (existente) — vira o último item do rail, colapsado dentro de um
  `<details>` rotulado "All activity".

Layout `grid xl:grid-cols-[1fr_380px]`, mantendo o padrão atual. Abaixo de `xl`,
coluna única na ordem: brief, chips de filtro mais fila, signal, weekly, sources,
timeline. Os chips ficam colados ao topo do card da fila e não são sticky. Sem
cards aninhados: o rail são cards irmãos e a fila é um card com linhas.

A tela inteira é composta de server components — não há nenhum client component.

Estilo pelos tokens de `globals.css` (`--standup-accent*`, `--line`, `--ink-*`,
`--danger-*`, `--warn-*`). Sem estética de marketing.

## Página

`app/(workspace)/dashboard/[workspaceId]/page.tsx` vira orquestração: três
fetches em paralelo, construção da identidade, chamada dos builders,
renderização. O `IntegrationEmptyState` para workspace vazio e o card de erro de
gateway permanecem como estão.

O filtro da fila vive na URL: `?lane=action|waiting|blocked`, ausente significa
todas. A página lê `searchParams`, valida o valor (qualquer outro cai em todas) e
filtra os itens antes de passar para `ActionQueue`. Chips e métricas do brief são
links para o mesmo parâmetro, preservando o restante da query. Assim o filtro não
introduz estado de cliente.

A rota ganha um `loading.tsx` mínimo — headline e um bloco de linhas em
`animate-pulse`. Nenhum componente de lista tem estado de loading próprio.

## Estados vazios

- Workspace sem fontes → `IntegrationEmptyState` ocupando a tela.
- Fontes conectadas e fila vazia → "Nada exige sua ação agora.", mais a contagem
  do que existe em waiting/recent e link para a timeline. Sem ilustração.
- Lane vazia sob filtro ativo → uma linha de texto no lugar da lista, com os
  chips ainda visíveis e um link de volta para a fila completa.
- Identidade não resolvida → modo workspace, conforme descrito acima.
- Sem riscos ou weekly vazio → texto factual ("Nenhum risco de alta prioridade
  na última sync"), sem zeros em destaque.
- Erro de gateway → card de erro no topo; o restante renderiza a partir de
  `emptyDashboard()`.

## Testes

`apps/web` não tem test runner hoje. Esta entrega adiciona Vitest: dependência e
script `test` em `apps/web/package.json`, mais `test:web` no root.

Cobertura:

- `viewer-identity`: match por `providerAccountId`, por e-mail, por nome;
  não-match; `resolved` falso.
- `scoreItem`: ordem relativa entre CI falhou, bloqueado, review e issue;
  desempate por viewer e por idade.
- `buildActionQueue`: dedupe entre `focus` e `today.*`, atribuição de `lane`,
  payload vazio retorna `[]`.
- `resolveEventUrl`: cada chave conhecida, `raw` ausente, valor não-string.
- `buildDashboardNarrative`: frase com termos zerados e frase completa.

Componentes não recebem testes de render. A validação visual é lint, build e
inspeção em desktop e mobile.

## Fora de escopo

- Snooze / dismiss de itens. Exigiria persistência e mudança no backend; a fila
  desta entrega é puramente derivada dos dados.
- Identidades configuráveis manualmente pelo usuário.
- `externalUrl` no payload da API Go.
- Qualquer alteração no contrato da API.
