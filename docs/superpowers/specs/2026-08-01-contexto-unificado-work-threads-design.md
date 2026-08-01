# Contexto Unificado (Work Threads) — Design

**Data:** 2026-08-01
**Status:** Aprovado para planejamento
**Ordem:** Spec C (depende de A — robustez das conexões — e do enriquecimento do `WorkEvent`)

## Objetivo

Correlacionar `WorkEvents` de ferramentas diferentes que pertencem ao **mesmo contexto/tarefa** (ex.: `TASK-04` no Linear + no PR do GitHub + na thread do Slack) e apresentá-los como **um único contexto**, para que o desenvolvedor entenda de uma vez tudo que aquela tarefa exige.

O dashboard (Spec B) agrupa por **ação**; o Contexto Unificado agrupa por **tarefa**. São duas lentes do mesmo dado.

### Exemplo motivador

```
Linear   TASK-04: fix de auth → precisa de code review
GitHub   TASK-04: code review is required (PR #123)
Slack    "a TASK-04 já está em produção?" (aguardando resposta)
```
→ Um card de contexto que reúne os três, com a linha do tempo da tarefa e o que falta.

## Escopo

- Enriquecer `WorkEvent` com chaves de correlação na ingestão.
- Materializar `WorkContext` (agrupamento) no sync.
- Superfície de UI: expandir o contexto a partir do card de ação.

Fora de escopo: correlação semântica por IA (evolução futura), edição manual de vínculos.

## Dependências

- **Spec A (robustez das conexões):** a correlação só é confiável se as fontes (Linear, Slack, Jira, etc.) sincronizarem de forma sólida.
- **Enriquecimento do `WorkEvent`:** as chaves de correlação precisam existir no dado.

## Princípios

- Correlação é **propriedade do dado**, extraída na normalização — não um chute em tempo de leitura.
- Determinístico primeiro (IDs + referências); camada semântica é evolução que só *adiciona* chaves ou funde contextos, sem tocar componentes.
- Linking materializado no sync: leitura barata e estável.

---

## Seção 1 — Enriquecimento do `WorkEvent`

Cada evento, ao virar `WorkEvent`, extrai e guarda as chaves de correlação que referencia:

```
WorkEvent.correlationKeys: string[]
  ex. ["linear:TASK-04", "github:pr/123", "branch:fix/auth-task-04"]
```

### Formato das chaves

Chaves normalizadas com prefixo de tipo, para casar entre ferramentas:
- `ticket:<KEY>` — chave do ticket (Linear/Jira), ex. `ticket:TASK-04`.
- `pr:<repo>#<num>` — pull request, ex. `pr:api#123`.
- `branch:<nome>` — branch, ex. `branch:fix/auth-task-04`.
- `url:<url-normalizada>` — link cruzado (PR ou ticket) detectado.

### Regras de extração por provedor

- **GitHub:** chave do ticket a partir do nome da branch, título do PR e mensagens de commit; a própria referência do PR; e links de Linear/Jira no corpo do PR/issue.
- **Linear/Jira:** a chave do próprio ticket + links de PR referenciados no ticket.
- **Slack:** parse das mensagens buscando padrões de chave de ticket (`TASK-04`), URLs de PR e URLs de Linear/Jira coladas na thread.
- **Demais (Trello, Notion, Calendar):** extração best-effort de chaves/URLs presentes no conteúdo.

A extração é **determinística** e tolerante: se nada for encontrado, o evento fica sem chaves (standalone).

---

## Seção 2 — Linking materializado (`WorkContext`)

### Modelo

- `WorkContext` — um cluster de `WorkEvents` conectados por chaves compartilhadas.
  - `id`
  - `anchorKey` — chave âncora (preferência: `ticket:*`)
  - `title` — derivado do ticket quando existe; senão do evento mais relevante
  - `status` — derivado dos membros (ex.: `em_review`, `aguardando_resposta`, `bloqueado`, `concluido`)
  - `sources` — ferramentas presentes no contexto
  - `updatedAt`
- Associação `WorkContext ↔ WorkEvent` (N:N não é necessário; cada evento pertence a no máximo um contexto).

### Algoritmo (roda no sync)

1. Coleta todos os `WorkEvents` com `correlationKeys`.
2. Agrupa por **união transitiva**: eventos que compartilham ao menos uma chave entram no mesmo contexto (union-find sobre as chaves).
3. Para cada cluster: define âncora/título e recalcula `status` a partir dos membros.
4. Persiste `WorkContext` + associações. Eventos sem chave ficam sem contexto (standalone).

O resultado é materializado, então a leitura do dashboard não recalcula nada.

---

## Seção 3 — Interface

- O dashboard continua **por ação** (Spec B). Cada card cujo evento pertence a um contexto ganha um selo: **`TASK-04 · N fontes`**.
- **Expandir a partir do card:** clicar no selo/card abre a **thread completa** do contexto — inline ou em painel lateral (drawer) — sem sair do fluxo do dashboard.
- A thread mostra:
  - Cabeçalho: título/âncora do contexto + status derivado.
  - Linha do tempo dos membros (Linear, PR/review, mensagens do Slack), cada um com sua ação primária e deep-link à origem.
  - O que falta para a tarefa avançar (derivado do status).
- **Evento sem correlação:** card normal, sem selo. Nenhuma mudança de comportamento.

---

## Seção 4 — Estados, erros e testes

### Estados

| Estado | Comportamento |
|---|---|
| Evento com contexto (N fontes) | Card com selo; expande a thread |
| Evento standalone (sem chave) | Card normal, sem selo |
| Contexto com 1 fonte só | Sem selo (não há o que unificar ainda) |
| Chave presente mas outra fonte não sincronizada | Contexto parcial; completa no próximo sync da fonte |

### Erros

- **Extração falha para um evento:** evento entra sem chaves (standalone); não quebra o sync.
- **Fonte de um contexto offline:** contexto mostra só os membros disponíveis; completa quando a fonte voltar.
- **Chave ambígua / colisão:** preferir `ticket:*` como âncora; registrar para diagnóstico.

### Testes

- **Go (unit):** extração de `correlationKeys` por provedor (branch, título, corpo, mensagem de Slack); algoritmo de união transitiva (clusters corretos, âncora/status derivados); idempotência do linking entre syncs.
- **Web:** render do selo `TASK-04 · N fontes`; expansão da thread (inline/drawer); estados standalone e contexto parcial.
- **E2E (happy path):** eventos de Linear + GitHub + Slack com a mesma chave → um contexto → card com selo → expandir mostra os três na linha do tempo.

---

## Decisões registradas

| Tema | Decisão |
|---|---|
| Identificação de contexto | Híbrido; chaves determinísticas agora (IDs + referências), IA depois |
| Onde vivem as chaves | No `WorkEvent` (`correlationKeys[]`), extraídas na ingestão |
| Montagem do agrupamento | Materializado no sync (`WorkContext` persistido, união transitiva) |
| Superfície na UI | Expande a partir do card de ação (inline / painel lateral) |
| Dashboard | Continua por ação (Spec B); contexto é a lente por tarefa |
| Evolução | Camada semântica futura só adiciona chaves / funde contextos |
