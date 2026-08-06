# Robustez das Conexões — Design

**Data:** 2026-08-01
**Status:** Aprovado para planejamento
**Ordem:** Spec A (pré-requisito de B e C)

## Objetivo

Deixar as 7 integrações (GitHub, Slack, Linear, Jira, Trello, Notion, Calendar) **confiáveis a ponto de produção**: sync que não quebra silenciosamente, tokens que se renovam sozinhos, erros transitórios que se recuperam, falha de um recurso que não derruba o resto, e saúde da conexão visível para o usuário agir.

É pré-requisito de B (dashboard confia nos dados) e de C (correlação só funciona com fontes sólidas).

## Ponto de partida (o que já existe)

- Os 7 connectors são implementações HTTP reais (interface `Connector` em `internal/integrations/registry.go`).
- OAuth configurado para os 7 (`internal/oauth/providers.go`) e endpoint de refresh (`/tokens/refresh`).
- Classificação de erro `retryable` (`classifySyncError`) e persistência de falha (`SaveSyncFailure`).
- `ConnectionStatus` já carrega `Status`, `HasRefreshToken`, `SelectionStatus`, `ExpiresAt`.

## Escopo — barra "confiabilidade essencial"

Dentro: refresh automático no sync, retry/backoff com rate-limit, sucesso parcial por recurso, saúde da conexão visível.

Fora (evolução futura): sync incremental por cursor, webhooks/tempo real. O `NextCursor` continua sendo calculado e persistido, mas não dirige busca incremental nesta passada.

---

## Connector Readiness Contract

Todo connector é considerado "100%" quando satisfaz:

1. **Auth resiliente** — sync detecta token expirado/`401` e renova automaticamente antes de falhar.
2. **Resiliência transitória** — trata `429` e `5xx` com retry/backoff e respeita `Retry-After` / `X-RateLimit`.
3. **Sucesso parcial** — falha de um recurso (repo, canal, board, projeto) não aborta o sync; sincroniza o resto e reporta o que falhou.
4. **Saúde observável** — expõe `status`, `lastSyncAt`, `lastError`, `expiresAt`, `hasRefreshToken` e erros por recurso via `GET /v1/connections`.
5. **Erros classificados** — toda falha vira um tipo conhecido (`needs_auth`, `rate_limited`, `provider_unavailable`, `needs_selection`, `unknown`) com flag `retryable`.

O contrato é verificado por um conjunto de testes comum a todos os connectors.

---

## Seção 1 — Camada compartilhada de confiabilidade

Em vez de duplicar lógica em cada connector, a robustez vive em duas peças reaproveitadas.

### 1a. Transporte HTTP resiliente

Um `http.RoundTripper` (ou wrapper de `Do`) compartilhado que todo connector usa no seu `get()`/`graphql()`:
- Retry com backoff exponencial + jitter para `429` e `5xx`.
- Respeita `Retry-After` (Slack) e `X-RateLimit-Reset` (GitHub).
- Teto de tentativas e de tempo total; erro final classificado (`rate_limited` / `provider_unavailable`).
- Timeout por request preservado (hoje 15s).

Mudança nos connectors: trocar o `*http.Client` cru pelo cliente resiliente. A assinatura de `get()`/`graphql()` não muda.

### 1b. Wrapper de sync com refresh automático

Uma etapa na orquestração de sync (`internal/gateway`, handler de sync) que envolve `connector.Sync/SyncSelected`:
1. Carrega token. Se `expiresAt` já passou (ou o connector retorna `needs_auth`/`401`), chama `oauth.RefreshToken` com o `refreshToken`, persiste o novo token e **repete o sync uma vez**.
2. Sem `refreshToken` → status `needs_auth` (usuário precisa reconectar), sem tratar como erro 502.
3. Sucesso → persiste eventos + estado de saúde.

Isso centraliza o "renova e tenta de novo" que hoje não existe.

---

## Seção 2 — Sucesso parcial por recurso

Os connectors que iteram sobre múltiplos recursos (GitHub: repos; Slack: canais; Linear/Jira: projetos/teams; Trello: boards) mudam o laço de fetch:

- Hoje: `return nil, err` na primeira falha → aborta tudo.
- Novo: acumula um `ResourceError{ resource, error, retryable }` e **continua** para o próximo recurso.

O `SyncResult` ganha `PartialErrors []ResourceError`. O status resultante:
- Todos os recursos OK → `connected`.
- Alguns OK, alguns falharam → `degraded` (com `partialErrors`).
- Nenhum recurso sincronizou → `failed` (erro classificado).

Assim uma org com 20 repos, um deles sem permissão, ainda entrega os outros 19.

---

## Seção 3 — Saúde da conexão visível

`ConnectionStatus` (já existente) é enriquecido e passa a ser a fonte única para o `/connections`:

| Campo | Significado |
|---|---|
| `status` | `connected` / `degraded` / `needs_auth` / `needs_selection` / `failed` |
| `lastSyncAt` | quando sincronizou com sucesso pela última vez |
| `lastError` | última mensagem de erro classificada (ou vazio) |
| `expiresAt` | expiração do token (pra avisar antes de quebrar) |
| `hasRefreshToken` | se dá pra renovar sozinho |
| `partialErrors` | contagem/resumo de recursos que falharam |

Isso alimenta o card de cada integração em Settings e o indicador de saúde no dashboard (Spec B): o usuário vê *qual* conexão precisa de ação e *por quê*.

---

## Seção 4 — Aplicação por connector

Cada um dos 7 recebe a mesma passada:
1. Adotar o transporte resiliente (1a).
2. Entrar no wrapper de refresh (1b) — connectors OAuth com `offline_access`/refresh (Jira, Calendar, Linear) ganham refresh real; os sem refresh caem em `needs_auth` limpo.
3. Converter laços de fetch para sucesso parcial (Seção 2) onde há múltiplos recursos.
4. Garantir que erros de API viram tipos classificados, não strings cruas.

Ordem sugerida de trabalho: **GitHub → Linear → Slack** primeiro (são os do exemplo de correlação do Spec C e os mais maduros), depois Jira, Trello, Notion, Calendar.

---

## Seção 5 — Testes

- **Transporte (unit):** retry em `429`/`5xx`, respeito a `Retry-After`, teto de tentativas, sucesso após retry, classificação do erro final. Com servidor HTTP fake.
- **Wrapper de refresh (unit):** token expirado → refresh chamado → sync repetido → sucesso; sem refresh token → `needs_auth`; refresh falha → erro classificado.
- **Sucesso parcial (unit por connector):** 1 recurso falha, resto sincroniza → status `degraded` + `partialErrors` corretos.
- **Contrato comum:** um conjunto de testes parametrizado roda o mesmo checklist de readiness contra os 7 connectors (com fakes de provider).
- **Saúde (integração):** `GET /v1/connections` reflete `status`/`lastError`/`expiresAt` após cenários de sucesso, degradação e expiração.

---

## Decisões registradas

| Tema | Decisão |
|---|---|
| Barra de "100%" | Confiabilidade essencial (sem incremental/webhooks nesta passada) |
| Onde vive a robustez | Camada compartilhada: transporte HTTP resiliente + wrapper de refresh no sync |
| Token expirado | Refresh automático no sync (renova e repete uma vez); sem refresh → `needs_auth` |
| Erros transitórios | Retry/backoff com rate-limit (`Retry-After`, `X-RateLimit`) |
| Falha de recurso | Sucesso parcial: sincroniza o resto, status `degraded` + `partialErrors` |
| Saúde | `ConnectionStatus` enriquecido é a fonte única do `/connections` |
| Incremental/webhooks | Fora de escopo; `NextCursor` segue calculado para uso futuro |
| Ordem | GitHub → Linear → Slack → Jira → Trello → Notion → Calendar |
