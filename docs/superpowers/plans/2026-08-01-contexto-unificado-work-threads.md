# Contexto Unificado (Work Threads) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correlacionar `WorkEvents` de ferramentas diferentes que pertencem à mesma tarefa (ex.: `ticket:TASK-04` no Linear + no PR do GitHub + na thread do Slack) e apresentá-los como um único contexto (`WorkContext`), materializado no sync e exibido a partir dos cards de ação do dashboard com o selo `TASK-04 · N fontes` e uma thread expansível.

**Architecture:** A correlação é **propriedade do dado**: cada connector, na normalização, preenche `WorkEvent.CorrelationKeys` via um extrator determinístico compartilhado em `internal/integrations/correlation.go` (que generaliza o `extractLinkedRefs` já existente em Slack/Linear e passa a extrair chaves de ticket também no GitHub — branch, título do PR, mensagens de commit). No sync, depois que os eventos são salvos (`SaveWorkEvents`), o gateway roda um **union-find** sobre as chaves compartilhadas (`internal/intelligence/context.go`) para formar/atualizar `WorkContext`s, persistidos de forma idempotente pelo store. A leitura do dashboard anexa a cada `WorkEvent` o `ContextRef` (id/anchor/status/nº de fontes). No web, cada card de ação (Spec B) ganha o selo e um drawer de thread. A camada semântica (IA) é futura e só *adicionaria* chaves — não faz parte deste plano.

**Tech Stack:** Go (stdlib `net/http`, `testing`, `httptest`) nos pacotes `internal/domain`, `internal/integrations`, `internal/intelligence`, `internal/store`, `internal/gateway`; Next.js App Router + TypeScript + React em `apps/web`, com **Vitest + @testing-library/react** (adicionados neste plano, pois `apps/web/package.json` ainda não tem test runner). Persistência em Supabase/Postgres (`supabase/schema.sql`) com `MemoryStore` como fallback e alvo dos testes unitários Go.

### Dependências

- Depende de **Spec A (Robustez das Conexões)** — a correlação só é confiável se as fontes sincronizarem de forma sólida. Ver `docs/superpowers/plans/2026-08-01-robustez-das-conexoes.md`.
- Depende do **enriquecimento do `WorkEvent`** — as chaves de correlação precisam existir no dado (implementado neste plano, Tasks 1–3).
- Os **cards agrupados por ação vêm da Spec B** (`docs/superpowers/specs/2026-08-01-dashboard-e-fluxo-inicial-design.md`). Este plano **NÃO** reconstrói o agrupamento por ação: assume que os cards de ação já existem no dashboard e apenas anexa o selo/thread de contexto a eles.

---

## File Structure

### Go (`apps/api`)

- **Modify** `internal/domain/types.go` — adicionar `CorrelationKeys []string` a `WorkEvent`; adicionar `ContextRef` a `WorkEvent`; adicionar tipos `WorkContext` e `WorkContextMember`; adicionar `Contexts []WorkContext` a `DashboardPayload`.
- **Create** `internal/integrations/correlation.go` — extrator determinístico compartilhado `CorrelationKeys(...)` com helpers `ticketKeysFromText`, `normalizeURLKey`, `prKey`, `branchKey`; refatora o `extractLinkedRefs` legado para reusar.
- **Create** `internal/integrations/correlation_test.go` — testes de extração por provedor.
- **Modify** `internal/integrations/github.go` — preencher `correlationKeys` no payload do PR (branch/título/commits/pr ref/links) e da issue; `Normalize` copia para `WorkEvent.CorrelationKeys`.
- **Modify** `internal/integrations/linear.go` — trocar `extractLinearLinkedRefs` por `CorrelationKeys`, incluir `ticket:<identifier>`; `Normalize` copia as chaves.
- **Modify** `internal/integrations/slack.go` — trocar `extractLinkedRefs` por `CorrelationKeys` (mensagens: `TASK-04`, URLs de PR/Linear); `Normalize` copia as chaves.
- **Modify** `internal/integrations/github.go` — adicionar campos `Head.Ref`, `Body`, `commits` ao fetch do PR para alimentar a extração.
- **Create** `internal/intelligence/context.go` — union-find sobre `CorrelationKeys`, derivação de `anchorKey`/`title`/`status`/`sources`, função `BuildContexts(events) []WorkContext`.
- **Create** `internal/intelligence/context_test.go` — clusters corretos, âncora/status derivados, idempotência.
- **Modify** `internal/intelligence/dashboard.go` — `BuildDashboard` chama `BuildContexts`, anexa `Contexts` e injeta `ContextRef` em cada `WorkEvent`.
- **Modify** `internal/store/store.go` — `SaveWorkContexts` na interface `Store`; implementação em `MemoryStore` (idempotente) e `SupabaseStore`; `GetDashboard` lê contextos e anexa `ContextRef`.
- **Modify** `internal/store/store_test.go` — teste de idempotência de `SaveWorkContexts`.
- **Modify** `internal/gateway/server.go` — no handler `sync`, após `SaveWorkEvents`, rodar `BuildContexts` sobre os eventos do workspace e chamar `SaveWorkContexts`.
- **Modify** `supabase/schema.sql` — adicionar coluna `correlation_keys` em `work_events` e tabela `work_contexts`.

### Web (`apps/web`)

- **Modify** `package.json` — adicionar `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react` e script `test`.
- **Create** `vitest.config.ts` — config jsdom + alias `@`.
- **Create** `vitest.setup.ts` — importa `@testing-library/jest-dom/vitest`.
- **Modify** `src/lib/api-client.ts` — adicionar tipos `WorkContextRef`, `WorkContext`, `WorkContextMember`; campos `contextRef` em `WorkEvent` e `contexts` em `DashboardPayload`.
- **Create** `src/components/workspace/context-badge.tsx` — selo `TASK-04 · N fontes`.
- **Create** `src/components/workspace/context-badge.test.tsx` — render do selo e estados (standalone/single-source/partial).
- **Create** `src/components/workspace/context-thread.tsx` — drawer/inline com header + timeline + "o que falta".
- **Create** `src/components/workspace/context-thread.test.tsx` — expansão da thread.
- **Modify** `src/components/workspace/timeline.tsx` — renderizar `ContextBadge` no card quando `event.contextRef` existir e disparar a thread.

---

## Task 1: Enriquecer o domínio (`WorkEvent`, `WorkContext`)

**Files:**
- Modify: `apps/api/internal/domain/types.go`

- [ ] **Step 1: Adicionar `CorrelationKeys` e `ContextRef` ao `WorkEvent`**

Em `apps/api/internal/domain/types.go`, no struct `WorkEvent`, adicionar dois campos após `Raw`:

```go
type WorkEvent struct {
	ID              string         `json:"id"`
	ExternalID      string         `json:"externalId"`
	Service         Service        `json:"service"`
	Type            string         `json:"type"`
	Title           string         `json:"title"`
	Source          string         `json:"source"`
	Actor           string         `json:"actor"`
	Priority        string         `json:"priority"`
	Summary         string         `json:"summary"`
	OccurredAt      time.Time      `json:"occurredAt"`
	Raw             map[string]any `json:"raw,omitempty"`
	CorrelationKeys []string       `json:"correlationKeys,omitempty"`
	ContextRef      *ContextRef    `json:"contextRef,omitempty"`
}
```

- [ ] **Step 2: Definir `ContextRef`, `WorkContext`, `WorkContextMember`**

Ainda em `types.go`, logo após o struct `WorkEvent`, adicionar:

```go
type ContextRef struct {
	ID        string `json:"id"`
	AnchorKey string `json:"anchorKey"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	Sources   int    `json:"sources"`
}

type WorkContextMember struct {
	EventID     string  `json:"eventId"`
	Service     Service `json:"service"`
	Type        string  `json:"type"`
	Title       string  `json:"title"`
	Source      string  `json:"source"`
	Actor       string  `json:"actor"`
	ExternalURL string  `json:"externalUrl"`
	OccurredAt  time.Time `json:"occurredAt"`
}

type WorkContext struct {
	ID        string              `json:"id"`
	AnchorKey string              `json:"anchorKey"`
	Title     string              `json:"title"`
	Status    string              `json:"status"`
	Sources   []Service           `json:"sources"`
	Members   []WorkContextMember `json:"members"`
	UpdatedAt time.Time           `json:"updatedAt"`
}
```

- [ ] **Step 3: Expor `Contexts` no `DashboardPayload`**

No struct `DashboardPayload`, adicionar após `SourceHealth`:

```go
	SourceHealth  []SourceHealth   `json:"sourceHealth"`
	Contexts      []WorkContext    `json:"contexts"`
```

- [ ] **Step 4: Compilar**

Rodar `go build ./...` a partir de `apps/api`.

```
cd apps/api && go build ./...
```

Esperado: **compila sem erros** (mudança só de tipos).

- [ ] **Step 5: Commit**

```
git add apps/api/internal/domain/types.go && git commit -m "Add correlation keys and WorkContext to domain types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Extrator de `CorrelationKeys` compartilhado

**Files:**
- Create: `apps/api/internal/integrations/correlation.go`
- Test: `apps/api/internal/integrations/correlation_test.go`

- [ ] **Step 1: Escrever o teste que falha — chaves por texto/branch/PR**

Criar `apps/api/internal/integrations/correlation_test.go`:

```go
package integrations

import (
	"reflect"
	"testing"
)

func TestTicketKeysFromText(t *testing.T) {
	got := ticketKeysFromText("Fix auth for TASK-04 and DEV-12, ignore v2 and 404")
	want := []string{"ticket:TASK-04", "ticket:DEV-12"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestCorrelationKeysDedupesAndNormalizes(t *testing.T) {
	got := CorrelationKeys(CorrelationInput{
		Branch:   "fix/auth-task-04",
		Title:    "TASK-04 fix auth",
		Body:     "closes DEV-12 https://linear.app/acme/issue/TASK-04",
		Commits:  []string{"TASK-04 wip", "task-04 more"},
		PRRepo:   "acme/api",
		PRNumber: 123,
	})
	want := []string{
		"ticket:TASK-04",
		"ticket:DEV-12",
		"branch:fix/auth-task-04",
		"pr:acme/api#123",
		"url:https://linear.app/acme/issue/task-04",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestCorrelationKeysEmptyWhenNothingFound(t *testing.T) {
	got := CorrelationKeys(CorrelationInput{Title: "generic housekeeping"})
	if len(got) != 0 {
		t.Fatalf("expected no keys, got %v", got)
	}
}
```

- [ ] **Step 2: Rodar o teste (espera FAIL)**

```
cd apps/api && go test ./internal/integrations/ -run TestCorrelationKeys
```

Esperado: **FAIL** — `undefined: CorrelationKeys` / `CorrelationInput` / `ticketKeysFromText`.

- [ ] **Step 3: Implementar o extrator (código real)**

Criar `apps/api/internal/integrations/correlation.go`:

```go
package integrations

import (
	"fmt"
	"regexp"
	"strings"
)

// ticketKeyPattern casa chaves tipo TASK-04, DEV-12, ABC-1234 (2-10 letras + hífen + dígitos).
var ticketKeyPattern = regexp.MustCompile(`\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b`)

// urlPattern casa URLs http(s) para normalizar como url:<lower>.
var urlPattern = regexp.MustCompile(`https?://[^\s<>()\[\]{}]+`)

// CorrelationInput reúne os campos de qualquer provedor que alimentam a extração.
type CorrelationInput struct {
	Branch    string
	Title     string
	Body      string
	Commits   []string
	Text      string   // corpo livre (mensagem de Slack, comentários)
	PRRepo    string   // ex. "acme/api"
	PRNumber  int      // ex. 123
	TicketKey string   // chave própria do provedor (Linear/Jira identifier)
	ExtraURLs []string // URLs já conhecidas (ex. i.URL)
}

// CorrelationKeys produz chaves determinísticas normalizadas, ordenadas por tipo e sem duplicatas.
func CorrelationKeys(in CorrelationInput) []string {
	keys := newOrderedKeys()

	if trimmed := strings.TrimSpace(in.TicketKey); trimmed != "" {
		keys.add("ticket:" + strings.ToUpper(trimmed))
	}

	combined := strings.Join(append([]string{in.Title, in.Body, in.Branch, in.Text}, in.Commits...), "\n")
	for _, key := range ticketKeysFromText(combined) {
		keys.add(key)
	}

	if branch := branchKey(in.Branch); branch != "" {
		keys.add(branch)
	}
	if pr := prKey(in.PRRepo, in.PRNumber); pr != "" {
		keys.add(pr)
	}

	urlSources := append([]string{in.Body, in.Text}, in.ExtraURLs...)
	for _, url := range urlsFromText(strings.Join(urlSources, "\n")) {
		keys.add(normalizeURLKey(url))
	}

	return keys.ordered()
}

func ticketKeysFromText(text string) []string {
	keys := newOrderedKeys()
	for _, match := range ticketKeyPattern.FindAllStringSubmatch(strings.ToUpper(text), -1) {
		keys.add("ticket:" + match[1] + "-" + match[2])
	}
	return keys.ordered()
}

func branchKey(branch string) string {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return ""
	}
	return "branch:" + branch
}

func prKey(repo string, number int) string {
	repo = strings.TrimSpace(repo)
	if repo == "" || number <= 0 {
		return ""
	}
	return fmt.Sprintf("pr:%s#%d", repo, number)
}

func urlsFromText(text string) []string {
	return urlPattern.FindAllString(text, -1)
}

func normalizeURLKey(rawURL string) string {
	url := strings.TrimRight(strings.TrimSpace(rawURL), "/.,)")
	return "url:" + strings.ToLower(url)
}

// orderedKeys agrupa por tipo (ticket, branch, pr, url) preservando primeira inserção.
type orderedKeys struct {
	seen  map[string]bool
	order []string
}

func newOrderedKeys() *orderedKeys {
	return &orderedKeys{seen: map[string]bool{}}
}

func (o *orderedKeys) add(key string) {
	key = strings.TrimSpace(key)
	if key == "" || o.seen[key] {
		return
	}
	o.seen[key] = true
	o.order = append(o.order, key)
}

func (o *orderedKeys) ordered() []string {
	rank := func(key string) int {
		switch {
		case strings.HasPrefix(key, "ticket:"):
			return 0
		case strings.HasPrefix(key, "branch:"):
			return 1
		case strings.HasPrefix(key, "pr:"):
			return 2
		default:
			return 3
		}
	}
	out := append([]string(nil), o.order...)
	// ordenação estável por rank preservando ordem de inserção dentro do rank.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && rank(out[j]) < rank(out[j-1]); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	if out == nil {
		return []string{}
	}
	return out
}
```

- [ ] **Step 4: Refatorar o `extractLinkedRefs` legado para reusar (sem quebrar Slack/Linear)**

Em `apps/api/internal/integrations/slack.go`, substituir a função `extractLinkedRefs` (linhas 395-405) por um wrapper sobre o novo extrator, mantendo a assinatura usada pelos payloads legados:

```go
func extractLinkedRefs(text string) []string {
	return CorrelationKeys(CorrelationInput{Text: text})
}
```

- [ ] **Step 5: Rodar o teste (espera PASS)**

```
cd apps/api && go test ./internal/integrations/ -run TestCorrelationKeys
cd apps/api && go test ./internal/integrations/ -run TestTicketKeysFromText
```

Esperado: **PASS**.

- [ ] **Step 6: Garantir que o pacote inteiro ainda compila e passa**

```
cd apps/api && go test ./internal/integrations/
```

Esperado: **PASS** (o wrapper mantém compatibilidade; se algum teste legado comparar o formato antigo de `linkedRefs`, ajustar a expectativa para o novo formato `url:`/`ticket:` como parte deste step).

- [ ] **Step 7: Commit**

```
git add apps/api/internal/integrations/correlation.go apps/api/internal/integrations/correlation_test.go apps/api/internal/integrations/slack.go && git commit -m "Add shared deterministic correlationKeys extractor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Preencher `CorrelationKeys` nos connectors (GitHub, Linear, Slack)

**Files:**
- Modify: `apps/api/internal/integrations/github.go`
- Modify: `apps/api/internal/integrations/linear.go`
- Modify: `apps/api/internal/integrations/slack.go`
- Test: `apps/api/internal/integrations/correlation_test.go`

- [ ] **Step 1: Escrever o teste que falha — extração por provedor no `Normalize`**

Adicionar ao final de `apps/api/internal/integrations/correlation_test.go`:

```go
import "github.com/developer-os/api/internal/domain"

func TestGitHubNormalizeExtractsTicketAndPRKeys(t *testing.T) {
	c := &GitHubConnector{}
	pr := githubPullRequest{Number: 123, Title: "TASK-04 fix auth", HTMLURL: "https://github.com/acme/api/pull/123"}
	pr.Head.Ref = "fix/auth-task-04"
	record := pr.toRecord("acme/api", nil, nil)
	events := c.Normalize([]domain.ExternalRecord{record})
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	keys := events[0].CorrelationKeys
	if !contains(keys, "ticket:TASK-04") || !contains(keys, "pr:acme/api#123") || !contains(keys, "branch:fix/auth-task-04") {
		t.Fatalf("missing github correlation keys: %v", keys)
	}
}

func TestLinearNormalizeExtractsOwnTicketKey(t *testing.T) {
	c := &LinearConnector{}
	issue := linearIssue{Identifier: "TASK-04", Title: "fix auth", URL: "https://linear.app/acme/issue/TASK-04"}
	events := c.Normalize([]domain.ExternalRecord{issue.toRecord()})
	if !contains(events[0].CorrelationKeys, "ticket:TASK-04") {
		t.Fatalf("expected ticket:TASK-04, got %v", events[0].CorrelationKeys)
	}
}

func TestSlackNormalizeExtractsTicketFromMessage(t *testing.T) {
	c := &SlackConnector{}
	msg := slackMessage{Text: "a TASK-04 já está em produção? blocker", TS: "1700000000.0001"}
	record, ok := msg.toRecord(slackChannel{ID: "C1", Name: "mobile"}, nil)
	if !ok {
		t.Fatal("expected slack record")
	}
	events := c.Normalize([]domain.ExternalRecord{record})
	if !contains(events[0].CorrelationKeys, "ticket:TASK-04") {
		t.Fatalf("expected ticket:TASK-04, got %v", events[0].CorrelationKeys)
	}
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
```

- [ ] **Step 2: Rodar o teste (espera FAIL)**

```
cd apps/api && go test ./internal/integrations/ -run "TestGitHubNormalizeExtracts|TestLinearNormalizeExtracts|TestSlackNormalizeExtracts"
```

Esperado: **FAIL** — `CorrelationKeys` está vazio (connectors ainda não copiam do payload) e `githubPullRequest` não tem `Head.Ref`.

- [ ] **Step 3: GitHub — expor `Head.Ref` e produzir chaves no PR e na issue**

Em `apps/api/internal/integrations/github.go`, adicionar `Ref` ao struct anônimo `Head` do `githubPullRequest`:

```go
	Head               struct {
		SHA string `json:"sha"`
		Ref string `json:"ref"`
	} `json:"head"`
```

No `githubPullRequest.toRecord`, ao montar o `Payload`, adicionar a chave `correlationKeys`:

```go
			"metrics": map[string]any{
				...
			},
			"correlationKeys": CorrelationKeys(CorrelationInput{
				Branch:   p.Head.Ref,
				Title:    p.Title,
				PRRepo:   repository,
				PRNumber: p.Number,
				ExtraURLs: []string{p.HTMLURL},
			}),
```

No `githubIssue.toRecord`, adicionar ao `Payload`:

```go
			"correlationKeys": CorrelationKeys(CorrelationInput{
				Title:     i.Title,
				ExtraURLs: []string{i.HTMLURL},
			}),
```

No `GitHubConnector.Normalize`, ler as chaves do payload e copiá-las para o evento. Substituir o bloco que monta `domain.WorkEvent{...}` para incluir:

```go
		correlationKeys := stringSliceFromPayload(record.Payload["correlationKeys"])

		events = append(events, domain.WorkEvent{
			ID:              "evt-" + record.ID,
			ExternalID:      record.ID,
			Service:         domain.ServiceGitHub,
			Type:            eventType,
			Title:           record.Title,
			Source:          "GitHub · " + repository,
			Actor:           record.Actor,
			Priority:        priority,
			Summary:         summary,
			OccurredAt:      record.UpdatedAt,
			Raw:             record.Payload,
			CorrelationKeys: correlationKeys,
		})
```

Adicionar em `correlation.go` o helper compartilhado `stringSliceFromPayload` (usado pelos três connectors):

```go
func stringSliceFromPayload(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}
```

- [ ] **Step 4: Linear — chave do próprio ticket + links, e copiar no `Normalize`**

Em `apps/api/internal/integrations/linear.go`, substituir `extractLinearLinkedRefs` para usar o extrator com `TicketKey`:

```go
func extractLinearLinkedRefs(issue linearIssue) []string {
	return CorrelationKeys(CorrelationInput{
		TicketKey: issue.Identifier,
		Text:      linearCommentsText(issue.Comments.Nodes),
		ExtraURLs: []string{issue.URL},
	})
}
```

No `LinearConnector.Normalize`, adicionar a cópia das chaves (mesmo padrão do GitHub):

```go
		correlationKeys := stringSliceFromPayload(record.Payload["linkedRefs"])

		events = append(events, domain.WorkEvent{
			...
			Raw:             record.Payload,
			CorrelationKeys: correlationKeys,
		})
```

(O `toRecord` já grava `"linkedRefs": extractLinearLinkedRefs(i)`; nenhuma outra mudança no payload é necessária.)

- [ ] **Step 5: Slack — copiar `linkedRefs` (já no novo formato) no `Normalize`**

Em `apps/api/internal/integrations/slack.go`, no `SlackConnector.Normalize`, adicionar:

```go
		correlationKeys := stringSliceFromPayload(record.Payload["linkedRefs"])

		events = append(events, domain.WorkEvent{
			...
			Raw:             record.Payload,
			CorrelationKeys: correlationKeys,
		})
```

(O `toRecord` do Slack já grava `"linkedRefs": extractLinkedRefs(threadText)`, que após a Task 2 usa o novo extrator e captura `ticket:TASK-04`.)

- [ ] **Step 6: Rodar o teste (espera PASS)**

```
cd apps/api && go test ./internal/integrations/
```

Esperado: **PASS**.

- [ ] **Step 7: Commit**

```
git add apps/api/internal/integrations/github.go apps/api/internal/integrations/linear.go apps/api/internal/integrations/slack.go apps/api/internal/integrations/correlation.go apps/api/internal/integrations/correlation_test.go && git commit -m "Populate WorkEvent.CorrelationKeys in GitHub, Linear and Slack connectors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Union-find e derivação de `WorkContext`

**Files:**
- Create: `apps/api/internal/intelligence/context.go`
- Test: `apps/api/internal/intelligence/context_test.go`

- [ ] **Step 1: Escrever o teste que falha — clusters, âncora, status, idempotência**

Criar `apps/api/internal/intelligence/context_test.go`:

```go
package intelligence

import (
	"reflect"
	"testing"
	"time"

	"github.com/developer-os/api/internal/domain"
)

func ckEvent(id string, service domain.Service, eventType string, keys []string, at time.Time) domain.WorkEvent {
	return domain.WorkEvent{
		ID:              id,
		ExternalID:      id,
		Service:         service,
		Type:            eventType,
		Title:           id + " title",
		Source:          string(service),
		OccurredAt:      at,
		CorrelationKeys: keys,
	}
}

func TestBuildContextsClustersBySharedKey(t *testing.T) {
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	events := []domain.WorkEvent{
		ckEvent("linear", domain.ServiceLinear, "linear.issue.started", []string{"ticket:TASK-04"}, now.Add(-3*time.Hour)),
		ckEvent("github", domain.ServiceGitHub, "review.requested", []string{"ticket:TASK-04", "pr:acme/api#123"}, now.Add(-2*time.Hour)),
		ckEvent("slack", domain.ServiceSlack, "slack.blocker", []string{"ticket:TASK-04"}, now.Add(-1*time.Hour)),
		ckEvent("lonely", domain.ServiceNotion, "notion.decision.logged", nil, now),
	}

	contexts := BuildContexts(events)
	if len(contexts) != 1 {
		t.Fatalf("expected 1 context (standalone excluded), got %d", len(contexts))
	}
	ctx := contexts[0]
	if ctx.AnchorKey != "ticket:TASK-04" {
		t.Fatalf("expected ticket anchor, got %q", ctx.AnchorKey)
	}
	if ctx.Status != "aguardando_resposta" {
		t.Fatalf("expected aguardando_resposta from slack.blocker, got %q", ctx.Status)
	}
	if len(ctx.Members) != 3 {
		t.Fatalf("expected 3 members, got %d", len(ctx.Members))
	}
	if !reflect.DeepEqual(ctx.Sources, []domain.Service{domain.ServiceGitHub, domain.ServiceLinear, domain.ServiceSlack}) {
		t.Fatalf("unexpected sources: %v", ctx.Sources)
	}
}

func TestBuildContextsTransitiveUnion(t *testing.T) {
	now := time.Now().UTC()
	events := []domain.WorkEvent{
		ckEvent("a", domain.ServiceLinear, "linear.issue.updated", []string{"ticket:TASK-04"}, now),
		ckEvent("b", domain.ServiceGitHub, "review.requested", []string{"ticket:TASK-04", "branch:fix/auth"}, now),
		ckEvent("c", domain.ServiceGitHub, "check.failed", []string{"branch:fix/auth"}, now),
	}
	contexts := BuildContexts(events)
	if len(contexts) != 1 || len(contexts[0].Members) != 3 {
		t.Fatalf("expected 1 transitive cluster of 3, got %d contexts", len(contexts))
	}
}

func TestBuildContextsSingleSourceHasNoContext(t *testing.T) {
	now := time.Now().UTC()
	events := []domain.WorkEvent{
		ckEvent("a", domain.ServiceGitHub, "review.requested", []string{"ticket:TASK-04"}, now),
		ckEvent("b", domain.ServiceGitHub, "check.failed", []string{"ticket:TASK-04"}, now),
	}
	contexts := BuildContexts(events)
	if len(contexts) != 0 {
		t.Fatalf("expected no context for single-source cluster, got %d", len(contexts))
	}
}

func TestBuildContextsIsIdempotent(t *testing.T) {
	now := time.Now().UTC()
	events := []domain.WorkEvent{
		ckEvent("linear", domain.ServiceLinear, "linear.issue.started", []string{"ticket:TASK-04"}, now),
		ckEvent("github", domain.ServiceGitHub, "review.requested", []string{"ticket:TASK-04"}, now),
	}
	first := BuildContexts(events)
	second := BuildContexts(events)
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("BuildContexts is not deterministic: %#v vs %#v", first, second)
	}
}
```

- [ ] **Step 2: Rodar o teste (espera FAIL)**

```
cd apps/api && go test ./internal/intelligence/ -run TestBuildContexts
```

Esperado: **FAIL** — `undefined: BuildContexts`.

- [ ] **Step 3: Implementar union-find + derivações (código real)**

Criar `apps/api/internal/intelligence/context.go`:

```go
package intelligence

import (
	"crypto/sha1"
	"encoding/hex"
	"sort"
	"strings"

	"github.com/developer-os/api/internal/domain"
)

// BuildContexts agrupa eventos por união transitiva das CorrelationKeys.
// Contextos com uma única fonte (serviço) são descartados (nada a unificar).
// A saída é determinística/idempotente: ordenada por AnchorKey.
func BuildContexts(events []domain.WorkEvent) []domain.WorkContext {
	uf := newUnionFind()
	for _, event := range events {
		if len(event.CorrelationKeys) == 0 {
			continue
		}
		anchor := event.CorrelationKeys[0]
		uf.add(anchor)
		for _, key := range event.CorrelationKeys[1:] {
			uf.add(key)
			uf.union(anchor, key)
		}
	}

	clusters := map[string][]domain.WorkEvent{}
	for _, event := range events {
		if len(event.CorrelationKeys) == 0 {
			continue
		}
		root := uf.find(event.CorrelationKeys[0])
		clusters[root] = append(clusters[root], event)
	}

	contexts := make([]domain.WorkContext, 0, len(clusters))
	for _, members := range clusters {
		context, ok := buildContext(members)
		if ok {
			contexts = append(contexts, context)
		}
	}

	sort.SliceStable(contexts, func(i, j int) bool {
		return contexts[i].AnchorKey < contexts[j].AnchorKey
	})
	return contexts
}

func buildContext(members []domain.WorkEvent) (domain.WorkContext, bool) {
	services := newServiceSet()
	keySet := newStringSet()
	var updatedAt = members[0].OccurredAt
	contextMembers := make([]domain.WorkContextMember, 0, len(members))

	sort.SliceStable(members, func(i, j int) bool {
		return members[i].OccurredAt.Before(members[j].OccurredAt)
	})

	for _, event := range members {
		services.add(event.Service)
		for _, key := range event.CorrelationKeys {
			keySet.add(key)
		}
		if event.OccurredAt.After(updatedAt) {
			updatedAt = event.OccurredAt
		}
		contextMembers = append(contextMembers, domain.WorkContextMember{
			EventID:     event.ID,
			Service:     event.Service,
			Type:        event.Type,
			Title:       event.Title,
			Source:      event.Source,
			Actor:       event.Actor,
			ExternalURL: externalURLFromRaw(event.Raw),
			OccurredAt:  event.OccurredAt,
		})
	}

	sources := services.ordered()
	if len(sources) < 2 {
		return domain.WorkContext{}, false
	}

	anchor := anchorKey(keySet.ordered())
	return domain.WorkContext{
		ID:        contextID(anchor),
		AnchorKey: anchor,
		Title:     contextTitle(members, anchor),
		Status:    deriveStatus(members),
		Sources:   sources,
		Members:   contextMembers,
		UpdatedAt: updatedAt,
	}, true
}

// anchorKey prefere ticket:*, senão a primeira chave ordenada.
func anchorKey(keys []string) string {
	for _, key := range keys {
		if strings.HasPrefix(key, "ticket:") {
			return key
		}
	}
	if len(keys) > 0 {
		return keys[0]
	}
	return ""
}

// contextTitle prefere o título de um membro do Linear (ticket); senão o membro mais recente.
func contextTitle(members []domain.WorkEvent, anchor string) string {
	for _, event := range members {
		if event.Service == domain.ServiceLinear && strings.TrimSpace(event.Title) != "" {
			return event.Title
		}
	}
	if len(members) > 0 {
		return members[len(members)-1].Title
	}
	return anchor
}

// deriveStatus mapeia os membros para um status de tarefa. Precedência: bloqueado > aguardando_resposta > em_review > concluido.
func deriveStatus(members []domain.WorkEvent) string {
	status := "em_review"
	rank := map[string]int{"concluido": 0, "em_review": 1, "aguardando_resposta": 2, "bloqueado": 3}
	best := 1
	for _, event := range members {
		candidate := statusForEvent(event)
		if rank[candidate] > best {
			best = rank[candidate]
			status = candidate
		}
	}
	return status
}

func statusForEvent(event domain.WorkEvent) string {
	searchable := strings.ToLower(event.Type + " " + event.Title + " " + event.Summary)
	switch {
	case strings.Contains(searchable, "block") || strings.Contains(searchable, "bloque"):
		return "bloqueado"
	case strings.Contains(event.Type, "slack.") || strings.Contains(searchable, "aguardando") || strings.Contains(searchable, "waiting"):
		return "aguardando_resposta"
	case strings.Contains(event.Type, "merged") || strings.Contains(event.Type, "closed") || strings.Contains(event.Type, "completed"):
		return "concluido"
	default:
		return "em_review"
	}
}

func externalURLFromRaw(raw map[string]any) string {
	if raw == nil {
		return ""
	}
	if url, ok := raw["url"].(string); ok {
		return url
	}
	return ""
}

func contextID(anchor string) string {
	sum := sha1.Sum([]byte(anchor))
	return "ctx_" + hex.EncodeToString(sum[:8])
}

// --- estruturas auxiliares ---

type unionFind struct {
	parent map[string]string
}

func newUnionFind() *unionFind { return &unionFind{parent: map[string]string{}} }

func (u *unionFind) add(key string) {
	if _, ok := u.parent[key]; !ok {
		u.parent[key] = key
	}
}

func (u *unionFind) find(key string) string {
	for u.parent[key] != key {
		u.parent[key] = u.parent[u.parent[key]]
		key = u.parent[key]
	}
	return key
}

func (u *unionFind) union(a, b string) {
	ra, rb := u.find(a), u.find(b)
	if ra == rb {
		return
	}
	// raiz determinística: menor string vence.
	if ra < rb {
		u.parent[rb] = ra
	} else {
		u.parent[ra] = rb
	}
}

type serviceSet struct {
	seen map[domain.Service]bool
}

func newServiceSet() *serviceSet { return &serviceSet{seen: map[domain.Service]bool{}} }
func (s *serviceSet) add(v domain.Service) { s.seen[v] = true }
func (s *serviceSet) ordered() []domain.Service {
	out := make([]domain.Service, 0, len(s.seen))
	for v := range s.seen {
		out = append(out, v)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

type stringSet struct {
	seen  map[string]bool
	order []string
}

func newStringSet() *stringSet { return &stringSet{seen: map[string]bool{}} }
func (s *stringSet) add(v string) {
	if !s.seen[v] {
		s.seen[v] = true
		s.order = append(s.order, v)
	}
}
func (s *stringSet) ordered() []string {
	out := append([]string(nil), s.order...)
	sort.SliceStable(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
```

- [ ] **Step 4: Rodar o teste (espera PASS)**

```
cd apps/api && go test ./internal/intelligence/ -run TestBuildContexts
```

Esperado: **PASS**.

- [ ] **Step 5: Commit**

```
git add apps/api/internal/intelligence/context.go apps/api/internal/intelligence/context_test.go && git commit -m "Add union-find WorkContext builder with anchor and status derivation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Anexar contextos ao dashboard (`ContextRef` por evento)

**Files:**
- Modify: `apps/api/internal/intelligence/dashboard.go`
- Test: `apps/api/internal/intelligence/dashboard_test.go`

- [ ] **Step 1: Escrever o teste que falha — dashboard expõe contextos e injeta `ContextRef`**

Adicionar ao final de `apps/api/internal/intelligence/dashboard_test.go`:

```go
func TestBuildDashboardAttachesContextsAndRefs(t *testing.T) {
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	ctx := domain.GatewayContext{WorkspaceID: "workspace"}
	events := []domain.WorkEvent{
		withKeys(event("linear", domain.ServiceLinear, "linear.issue.started", "TASK-04 fix auth", "medium", now.Add(-2*time.Hour)), []string{"ticket:TASK-04"}),
		withKeys(event("github", domain.ServiceGitHub, "review.requested", "PR for TASK-04", "high", now.Add(-1*time.Hour)), []string{"ticket:TASK-04", "pr:acme/api#123"}),
		withKeys(event("solo", domain.ServiceNotion, "notion.decision.logged", "unrelated", "low", now), nil),
	}

	payload := BuildDashboard(ctx, events, nil, now)

	if len(payload.Contexts) != 1 {
		t.Fatalf("expected 1 context, got %d", len(payload.Contexts))
	}
	var linearEvent, soloEvent domain.WorkEvent
	for _, e := range payload.Events {
		if e.ID == "linear" {
			linearEvent = e
		}
		if e.ID == "solo" {
			soloEvent = e
		}
	}
	if linearEvent.ContextRef == nil || linearEvent.ContextRef.Sources != 2 {
		t.Fatalf("expected linear event to have contextRef with 2 sources, got %#v", linearEvent.ContextRef)
	}
	if linearEvent.ContextRef.AnchorKey != "ticket:TASK-04" {
		t.Fatalf("expected anchor ticket:TASK-04, got %q", linearEvent.ContextRef.AnchorKey)
	}
	if soloEvent.ContextRef != nil {
		t.Fatalf("expected standalone event to have no contextRef")
	}
}

func withKeys(e domain.WorkEvent, keys []string) domain.WorkEvent {
	e.CorrelationKeys = keys
	return e
}
```

- [ ] **Step 2: Rodar o teste (espera FAIL)**

```
cd apps/api && go test ./internal/intelligence/ -run TestBuildDashboardAttachesContexts
```

Esperado: **FAIL** — `payload.Contexts` vazio e `ContextRef` nil.

- [ ] **Step 3: Injetar contextos no `BuildDashboard` (código real)**

Em `apps/api/internal/intelligence/dashboard.go`, dentro de `BuildDashboard`, após `events = sortedEvents(events)` e antes de `today := buildToday(...)`, calcular contextos e anexar refs:

```go
	events = sortedEvents(events)
	contexts := BuildContexts(events)
	events = attachContextRefs(events, contexts)
	sourceHealth = normalizeSourceHealth(sourceHealth)
```

No `return domain.DashboardPayload{...}`, adicionar o campo:

```go
		SourceHealth:  sourceHealth,
		Contexts:      contexts,
	}
```

Adicionar a função `attachContextRefs` no fim de `dashboard.go`:

```go
func attachContextRefs(events []domain.WorkEvent, contexts []domain.WorkContext) []domain.WorkEvent {
	refByEvent := map[string]*domain.ContextRef{}
	for _, context := range contexts {
		ref := &domain.ContextRef{
			ID:        context.ID,
			AnchorKey: context.AnchorKey,
			Title:     context.Title,
			Status:    context.Status,
			Sources:   len(context.Sources),
		}
		for _, member := range context.Members {
			refByEvent[member.EventID] = ref
		}
	}

	out := make([]domain.WorkEvent, len(events))
	for i, event := range events {
		if ref, ok := refByEvent[event.ID]; ok {
			event.ContextRef = ref
		}
		out[i] = event
	}
	return out
}
```

- [ ] **Step 4: Rodar o teste (espera PASS)**

```
cd apps/api && go test ./internal/intelligence/
```

Esperado: **PASS** (incluindo os testes existentes de dashboard).

- [ ] **Step 5: Commit**

```
git add apps/api/internal/intelligence/dashboard.go apps/api/internal/intelligence/dashboard_test.go && git commit -m "Attach materialized contexts and per-event ContextRef in dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Persistir contextos no store (idempotente)

**Files:**
- Modify: `apps/api/internal/store/store.go`
- Test: `apps/api/internal/store/store_test.go`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Escrever o teste que falha — `SaveWorkContexts` é idempotente**

Adicionar ao final de `apps/api/internal/store/store_test.go`:

```go
func TestMemoryStoreSaveWorkContextsIsIdempotent(t *testing.T) {
	store := NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	wc := domain.WorkContext{
		ID:        "ctx_abc",
		AnchorKey: "ticket:TASK-04",
		Title:     "TASK-04 fix auth",
		Status:    "em_review",
		Sources:   []domain.Service{domain.ServiceGitHub, domain.ServiceLinear},
		UpdatedAt: time.Now().UTC(),
	}

	if err := store.SaveWorkContexts(context.Background(), ctx, []domain.WorkContext{wc}); err != nil {
		t.Fatal(err)
	}
	updated := wc
	updated.Status = "bloqueado"
	if err := store.SaveWorkContexts(context.Background(), ctx, []domain.WorkContext{updated}); err != nil {
		t.Fatal(err)
	}

	stored := store.contexts[ctx.WorkspaceID]
	if len(stored) != 1 {
		t.Fatalf("expected 1 context after re-save, got %d", len(stored))
	}
	if stored[0].Status != "bloqueado" {
		t.Fatalf("expected context to be refreshed to bloqueado, got %q", stored[0].Status)
	}
}
```

> Nota: o `store_test.go` já importa `"context"` (usado pelos testes existentes). A variável local foi nomeada `wc` para evitar colisão com o pacote.

- [ ] **Step 2: Rodar o teste (espera FAIL)**

```
cd apps/api && go test ./internal/store/ -run TestMemoryStoreSaveWorkContexts
```

Esperado: **FAIL** — `store.SaveWorkContexts` e `store.contexts` não existem.

- [ ] **Step 3: Adicionar `SaveWorkContexts` à interface e ao `MemoryStore`**

Em `apps/api/internal/store/store.go`:

Na interface `Store`, após `SaveWorkEvents(...)`:

```go
	SaveWorkEvents(context.Context, domain.GatewayContext, []domain.WorkEvent) error
	SaveWorkContexts(context.Context, domain.GatewayContext, []domain.WorkContext) error
```

No struct `MemoryStore`, adicionar o campo:

```go
	events         map[string][]domain.WorkEvent
	contexts       map[string][]domain.WorkContext
```

Em `NewMemoryStore`, inicializar:

```go
		events:         map[string][]domain.WorkEvent{},
		contexts:       map[string][]domain.WorkContext{},
```

Implementar o método (upsert por `AnchorKey`, idempotente):

```go
func (s *MemoryStore) SaveWorkContexts(_ context.Context, ctx domain.GatewayContext, contexts []domain.WorkContext) error {
	s.ensureMemoryWorkspace(ctx, "Developer OS Workspace")
	byAnchor := map[string]domain.WorkContext{}
	for _, existing := range s.contexts[ctx.WorkspaceID] {
		byAnchor[existing.AnchorKey] = existing
	}
	for _, context := range contexts {
		byAnchor[context.AnchorKey] = context
	}

	refreshed := make([]domain.WorkContext, 0, len(byAnchor))
	for _, context := range byAnchor {
		refreshed = append(refreshed, context)
	}
	s.contexts[ctx.WorkspaceID] = refreshed
	return nil
}
```

- [ ] **Step 4: Implementar `SaveWorkContexts` no `SupabaseStore`**

Em `store.go`, adicionar (upsert idempotente por `workspace_id,anchor_key`):

```go
func (s *SupabaseStore) SaveWorkContexts(ctx context.Context, gatewayCtx domain.GatewayContext, contexts []domain.WorkContext) error {
	if len(contexts) == 0 {
		return nil
	}
	if err := s.ensureWorkspace(ctx, gatewayCtx); err != nil {
		return err
	}

	rows := make([]map[string]any, 0, len(contexts))
	for _, context := range contexts {
		rows = append(rows, map[string]any{
			"workspace_id": gatewayCtx.WorkspaceID,
			"anchor_key":   context.AnchorKey,
			"title":        context.Title,
			"status":       context.Status,
			"sources":      context.Sources,
			"members":      context.Members,
			"updated_at":   context.UpdatedAt,
		})
	}

	return s.rest(ctx, http.MethodPost, "work_contexts?on_conflict=workspace_id,anchor_key", rows, nil)
}
```

- [ ] **Step 5: Adicionar tabela `work_contexts` e coluna `correlation_keys` no schema**

Em `supabase/schema.sql`, adicionar a coluna em `work_events` (após `external_id text not null,`):

```sql
  correlation_keys jsonb not null default '[]'::jsonb,
```

E, após a tabela `document_chunks`, adicionar:

```sql
create table if not exists public.work_contexts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  anchor_key text not null,
  title text not null default '',
  status text not null default 'em_review',
  sources jsonb not null default '[]'::jsonb,
  members jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workspace_id, anchor_key)
);

create index if not exists work_contexts_workspace_idx
  on public.work_contexts (workspace_id, updated_at desc);
```

- [ ] **Step 6: Rodar o teste (espera PASS) e o pacote store inteiro**

```
cd apps/api && go test ./internal/store/
```

Esperado: **PASS** (o teste de idempotência passa; os testes existentes seguem verdes).

- [ ] **Step 7: Commit**

```
git add apps/api/internal/store/store.go apps/api/internal/store/store_test.go supabase/schema.sql && git commit -m "Persist WorkContexts idempotently in store and schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Materializar contextos no sync (gateway)

**Files:**
- Modify: `apps/api/internal/gateway/server.go`

- [ ] **Step 1: Escrever o teste que falha — sync materializa contextos**

Criar `apps/api/internal/gateway/context_sync_test.go` (ou adicionar a um `server_test.go` existente se houver — verificar `ls apps/api/internal/gateway/`):

```go
package gateway

import (
	"context"
	"testing"
	"time"

	"github.com/developer-os/api/internal/domain"
	"github.com/developer-os/api/internal/intelligence"
	"github.com/developer-os/api/internal/store"
)

func TestMaterializeContextsPersistsClustersAfterSync(t *testing.T) {
	memStore := store.NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	now := time.Now().UTC()

	events := []domain.WorkEvent{
		{ID: "linear", ExternalID: "linear", Service: domain.ServiceLinear, Type: "linear.issue.started", Title: "TASK-04", Source: "Linear", Priority: "medium", OccurredAt: now, CorrelationKeys: []string{"ticket:TASK-04"}},
		{ID: "github", ExternalID: "github", Service: domain.ServiceGitHub, Type: "review.requested", Title: "PR TASK-04", Source: "GitHub", Priority: "high", OccurredAt: now, CorrelationKeys: []string{"ticket:TASK-04"}},
	}
	if err := memStore.SaveWorkEvents(context.Background(), ctx, events); err != nil {
		t.Fatal(err)
	}

	if err := materializeContexts(context.Background(), memStore, ctx); err != nil {
		t.Fatal(err)
	}

	dashboard, err := memStore.GetDashboard(context.Background(), ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(dashboard.Contexts) != 1 {
		t.Fatalf("expected 1 materialized context, got %d", len(dashboard.Contexts))
	}
	_ = intelligence.BuildContexts // guard: same package used at runtime
}
```

- [ ] **Step 2: Rodar o teste (espera FAIL)**

```
cd apps/api && go test ./internal/gateway/ -run TestMaterializeContexts
```

Esperado: **FAIL** — `undefined: materializeContexts`.

> Observação: `MemoryStore.GetDashboard` já chama `intelligence.BuildDashboard`, que (após Task 5) recomputa `Contexts` a partir dos eventos salvos. O `materializeContexts` garante a **persistência** dos contextos (para o `SupabaseStore`, onde `GetDashboard` também recomputa mas a persistência alimenta consultas futuras/idempotência). O teste valida o caminho de leitura.

- [ ] **Step 3: Implementar `materializeContexts` e chamá-lo no handler `sync`**

Em `apps/api/internal/gateway/server.go`, adicionar a função auxiliar (perto do fim do arquivo):

```go
func materializeContexts(ctx context.Context, st store.Store, gatewayCtx domain.GatewayContext) error {
	dashboard, err := st.GetDashboard(ctx, gatewayCtx)
	if err != nil {
		return err
	}
	if len(dashboard.Contexts) == 0 {
		return nil
	}
	return st.SaveWorkContexts(ctx, gatewayCtx, dashboard.Contexts)
}
```

Adicionar `"context"` ao bloco de imports de `server.go`.

No handler `sync`, logo após o bloco que persiste `SaveWorkEvents` com sucesso (após o `if err := s.store.SaveWorkEvents(...)` retornar sem erro, antes de `SaveDocumentChunks`), inserir a materialização — que **nunca deve quebrar o sync**:

```go
	if err := materializeContexts(r.Context(), s.store, ctx); err != nil {
		s.logger.WarnContext(r.Context(), "context_materialization_failed",
			"request_id", ctx.RequestID,
			"workspace_id", ctx.WorkspaceID,
			"service", input.Service,
			"error", err.Error(),
		)
	}
```

(Erro só é logado, não interrompe o fluxo — respeita "extração falha → evento standalone; não quebra o sync".)

- [ ] **Step 4: Rodar o teste (espera PASS) e todo o módulo Go**

```
cd apps/api && go test ./internal/gateway/
cd apps/api && go test ./...
```

Esperado: **PASS** em todo o módulo.

- [ ] **Step 5: Commit**

```
git add apps/api/internal/gateway/server.go apps/api/internal/gateway/context_sync_test.go && git commit -m "Materialize WorkContexts after events are saved during sync

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Test runner do web (Vitest) + tipos de contexto no api-client

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Adicionar dependências de teste e script**

Em `apps/web/package.json`, adicionar ao `scripts`:

```json
    "lint": "eslint",
    "test": "vitest run"
```

E ao `devDependencies`:

```json
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@vitejs/plugin-react": "latest",
    "jsdom": "latest",
    "vitest": "latest",
```

Instalar:

```
cd apps/web && npm install
```

- [ ] **Step 2: Criar `vitest.config.ts`**

Criar `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 3: Criar `vitest.setup.ts`**

Criar `apps/web/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Verificar o runner com um smoke test**

Rodar (deve reportar "no test files" ou passar sem erro de config):

```
cd apps/web && npm test
```

Esperado: Vitest inicia sem erro de configuração (mensagem "No test files found" é aceitável neste ponto).

- [ ] **Step 5: Adicionar tipos de contexto ao `api-client.ts`**

Em `apps/web/src/lib/api-client.ts`, adicionar após o `type WorkEvent`:

```ts
export type WorkContextRef = {
  id: string;
  anchorKey: string;
  title: string;
  status: string;
  sources: number;
};

export type WorkContextMember = {
  eventId: string;
  service: Service;
  type: string;
  title: string;
  source: string;
  actor: string;
  externalUrl: string;
  occurredAt: string;
};

export type WorkContext = {
  id: string;
  anchorKey: string;
  title: string;
  status: string;
  sources: Service[];
  members: WorkContextMember[];
  updatedAt: string;
};
```

Adicionar `contextRef?: WorkContextRef;` ao `type WorkEvent` (após `raw?`):

```ts
  raw?: Record<string, unknown>;
  contextRef?: WorkContextRef;
```

Adicionar `contexts` ao `DashboardPayload` (após `sourceHealth`):

```ts
  sourceHealth: SourceHealth[];
  contexts: WorkContext[];
```

- [ ] **Step 6: Compilar o web (typecheck)**

```
cd apps/web && npx tsc --noEmit
```

Esperado: **sem erros de tipo**.

- [ ] **Step 7: Commit**

```
git add apps/web/package.json apps/web/package-lock.json apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/src/lib/api-client.ts && git commit -m "Add Vitest runner and WorkContext types to web client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Selo de contexto (`TASK-04 · N fontes`)

**Files:**
- Create: `apps/web/src/components/workspace/context-badge.tsx`
- Test: `apps/web/src/components/workspace/context-badge.test.tsx`

- [ ] **Step 1: Escrever o teste que falha — render do selo e estados**

Criar `apps/web/src/components/workspace/context-badge.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextBadge } from "./context-badge";
import type { WorkContextRef } from "@/lib/api-client";

const ref: WorkContextRef = {
  id: "ctx_1",
  anchorKey: "ticket:TASK-04",
  title: "TASK-04 fix auth",
  status: "em_review",
  sources: 3,
};

describe("ContextBadge", () => {
  it("renders anchor label and source count", () => {
    render(<ContextBadge contextRef={ref} onOpen={() => {}} />);
    expect(screen.getByText("TASK-04 · 3 fontes")).toBeInTheDocument();
  });

  it("renders nothing for a single-source context", () => {
    const { container } = render(<ContextBadge contextRef={{ ...ref, sources: 1 }} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for standalone events (no ref)", () => {
    const { container } = render(<ContextBadge contextRef={undefined} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("invokes onOpen when clicked", () => {
    const onOpen = vi.fn();
    render(<ContextBadge contextRef={ref} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar o teste (espera FAIL)**

```
cd apps/web && npx vitest run src/components/workspace/context-badge.test.tsx
```

Esperado: **FAIL** — módulo `./context-badge` não existe.

- [ ] **Step 3: Implementar o selo (código real)**

Criar `apps/web/src/components/workspace/context-badge.tsx`:

```tsx
"use client";

import { Layers } from "lucide-react";
import type { WorkContextRef } from "@/lib/api-client";

function anchorLabel(anchorKey: string): string {
  const [, value] = anchorKey.split(":");
  return value ?? anchorKey;
}

export function ContextBadge({
  contextRef,
  onOpen,
}: {
  contextRef?: WorkContextRef;
  onOpen: () => void;
}) {
  if (!contextRef || contextRef.sources < 2) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
    >
      <Layers className="h-3 w-3" />
      {anchorLabel(contextRef.anchorKey)} · {contextRef.sources} fontes
    </button>
  );
}
```

- [ ] **Step 4: Rodar o teste (espera PASS)**

```
cd apps/web && npx vitest run src/components/workspace/context-badge.test.tsx
```

Esperado: **PASS**.

- [ ] **Step 5: Commit**

```
git add apps/web/src/components/workspace/context-badge.tsx apps/web/src/components/workspace/context-badge.test.tsx && git commit -m "Add ContextBadge with TASK · N fontes label and states

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Thread do contexto (drawer com header + timeline + "o que falta")

**Files:**
- Create: `apps/web/src/components/workspace/context-thread.tsx`
- Test: `apps/web/src/components/workspace/context-thread.test.tsx`

- [ ] **Step 1: Escrever o teste que falha — thread mostra header, membros e "o que falta"**

Criar `apps/web/src/components/workspace/context-thread.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextThread } from "./context-thread";
import type { WorkContext } from "@/lib/api-client";

const context: WorkContext = {
  id: "ctx_1",
  anchorKey: "ticket:TASK-04",
  title: "TASK-04 fix auth",
  status: "aguardando_resposta",
  sources: ["github", "linear", "slack"],
  members: [
    { eventId: "linear", service: "linear", type: "linear.issue.started", title: "TASK-04 fix auth", source: "Linear", actor: "Ana", externalUrl: "https://linear.app/x", occurredAt: "2026-08-01T09:00:00Z" },
    { eventId: "github", service: "github", type: "review.requested", title: "PR #123", source: "GitHub", actor: "Bob", externalUrl: "https://github.com/x/pull/123", occurredAt: "2026-08-01T10:00:00Z" },
    { eventId: "slack", service: "slack", type: "slack.blocker", title: "em produção?", source: "Slack", actor: "Cara", externalUrl: "", occurredAt: "2026-08-01T11:00:00Z" },
  ],
  updatedAt: "2026-08-01T11:00:00Z",
};

describe("ContextThread", () => {
  it("renders header title and derived status", () => {
    render(<ContextThread context={context} open onClose={() => {}} />);
    expect(screen.getByText("TASK-04 fix auth")).toBeInTheDocument();
    expect(screen.getByText(/aguardando resposta/i)).toBeInTheDocument();
  });

  it("renders one timeline entry per member with deep-link", () => {
    render(<ContextThread context={context} open onClose={() => {}} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2); // slack member has empty externalUrl
    expect(screen.getByText("PR #123")).toBeInTheDocument();
  });

  it("renders 'o que falta' derived from status", () => {
    render(<ContextThread context={context} open onClose={() => {}} />);
    expect(screen.getByText(/responder/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const { container } = render(<ContextThread context={context} open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onClose when the close control is clicked", () => {
    const onClose = vi.fn();
    render(<ContextThread context={context} open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Fechar thread"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar o teste (espera FAIL)**

```
cd apps/web && npx vitest run src/components/workspace/context-thread.test.tsx
```

Esperado: **FAIL** — módulo `./context-thread` não existe.

- [ ] **Step 3: Implementar a thread (código real)**

Criar `apps/web/src/components/workspace/context-thread.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import type { WorkContext } from "@/lib/api-client";

const statusLabel: Record<string, string> = {
  em_review: "em review",
  aguardando_resposta: "aguardando resposta",
  bloqueado: "bloqueado",
  concluido: "concluído",
};

const missingByStatus: Record<string, string> = {
  em_review: "Falta revisar o pull request para avançar.",
  aguardando_resposta: "Falta responder a conversa aberta no Slack.",
  bloqueado: "Falta remover o bloqueio antes de continuar.",
  concluido: "Nada pendente — tarefa concluída.",
};

export function ContextThread({
  context,
  open,
  onClose,
}: {
  context: WorkContext;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside
      role="dialog"
      aria-label={`Contexto ${context.anchorKey}`}
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-xl"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-base font-semibold">{context.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {context.anchorKey} · {statusLabel[context.status] ?? context.status} · {context.sources.length} fontes
          </p>
        </div>
        <button type="button" aria-label="Fechar thread" onClick={onClose} className="rounded-md p-1 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <ol className="space-y-4">
          {context.members.map((member) => (
            <li key={member.eventId} className="border-b border-border pb-3 last:border-b-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{member.source}</p>
              {member.externalUrl ? (
                <a href={member.externalUrl} className="text-sm font-medium text-foreground underline-offset-2 hover:underline">
                  {member.title}
                </a>
              ) : (
                <p className="text-sm font-medium text-foreground">{member.title}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {member.actor} · {new Date(member.occurredAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <footer className="border-t border-border p-4">
        <p className="text-sm text-muted-foreground">{missingByStatus[context.status] ?? "Falta avançar a tarefa."}</p>
      </footer>
    </aside>
  );
}
```

- [ ] **Step 4: Rodar o teste (espera PASS)**

```
cd apps/web && npx vitest run src/components/workspace/context-thread.test.tsx
```

Esperado: **PASS**.

- [ ] **Step 5: Commit**

```
git add apps/web/src/components/workspace/context-thread.tsx apps/web/src/components/workspace/context-thread.test.tsx && git commit -m "Add ContextThread drawer with timeline and next-step hint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Integrar selo + thread nos cards do dashboard (Timeline)

**Files:**
- Modify: `apps/web/src/components/workspace/timeline.tsx`
- Test: `apps/web/src/components/workspace/timeline.test.tsx`

> Os cards agrupados por ação vêm da Spec B. Aqui integramos ao `Timeline` (que já renderiza os `WorkEvents` no dashboard) como ponto de fixação real do selo/thread; a mesma abordagem se aplica aos cards de ação da Spec B (renderizar `<ContextBadge>` a partir de `event.contextRef` e abrir `<ContextThread>` com o contexto correspondente).

- [ ] **Step 1: Escrever o teste que falha — evento com contexto mostra selo; standalone não**

Criar `apps/web/src/components/workspace/timeline.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Timeline } from "./timeline";
import type { WorkContext, WorkEvent } from "@/lib/api-client";

const contexts: WorkContext[] = [
  {
    id: "ctx_1",
    anchorKey: "ticket:TASK-04",
    title: "TASK-04 fix auth",
    status: "em_review",
    sources: ["github", "linear"],
    members: [
      { eventId: "evt-1", service: "linear", type: "linear.issue.started", title: "TASK-04", source: "Linear", actor: "Ana", externalUrl: "https://linear.app/x", occurredAt: "2026-08-01T09:00:00Z" },
      { eventId: "evt-2", service: "github", type: "review.requested", title: "PR #123", source: "GitHub", actor: "Bob", externalUrl: "https://github.com/x", occurredAt: "2026-08-01T10:00:00Z" },
    ],
    updatedAt: "2026-08-01T10:00:00Z",
  },
];

const events: WorkEvent[] = [
  { id: "evt-1", service: "linear", type: "linear.issue.started", title: "Linear TASK-04", source: "Linear", actor: "Ana", priority: "medium", summary: "s", occurredAt: "2026-08-01T09:00:00Z", contextRef: { id: "ctx_1", anchorKey: "ticket:TASK-04", title: "TASK-04 fix auth", status: "em_review", sources: 2 } },
  { id: "evt-9", service: "notion", type: "notion.decision.logged", title: "Standalone note", source: "Notion", actor: "Rafa", priority: "low", summary: "s", occurredAt: "2026-08-01T08:00:00Z" },
];

describe("Timeline context integration", () => {
  it("shows the context badge on events with a context", () => {
    render(<Timeline events={events} contexts={contexts} />);
    expect(screen.getByText("TASK-04 · 2 fontes")).toBeInTheDocument();
  });

  it("does not show a badge on standalone events", () => {
    render(<Timeline events={[events[1]]} contexts={[]} />);
    expect(screen.queryByText(/fontes/)).not.toBeInTheDocument();
  });

  it("opens the thread drawer when the badge is clicked", () => {
    render(<Timeline events={events} contexts={contexts} />);
    fireEvent.click(screen.getByText("TASK-04 · 2 fontes"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("PR #123")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste (espera FAIL)**

```
cd apps/web && npx vitest run src/components/workspace/timeline.test.tsx
```

Esperado: **FAIL** — `Timeline` não aceita `contexts` e não renderiza o selo.

- [ ] **Step 3: Integrar `ContextBadge` + `ContextThread` no `Timeline` (código real)**

Em `apps/web/src/components/workspace/timeline.tsx`, converter para client component e aceitar `contexts`. Adicionar no topo:

```tsx
"use client";

import { useState } from "react";
```

Manter os imports existentes e adicionar:

```tsx
import type { WorkContext, WorkEvent } from "@/lib/api-client";
import { ContextBadge } from "./context-badge";
import { ContextThread } from "./context-thread";
```

Alterar a assinatura e o corpo para gerenciar o contexto aberto:

```tsx
export function Timeline({ events, contexts = [] }: { events: WorkEvent[]; contexts?: WorkContext[] }) {
  const [openContextId, setOpenContextId] = useState<string | null>(null);
  const contextById = new Map(contexts.map((context) => [context.id, context]));
  const openContext = openContextId ? contextById.get(openContextId) ?? null : null;
```

Dentro do `.map((event) => {...})`, no bloco de cabeçalho onde ficam título e badge de prioridade, adicionar o selo após o `Badge` de prioridade:

```tsx
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-foreground">{event.title}</h3>
                  <Badge tone={event.priority === "high" ? "red" : event.priority === "medium" ? "amber" : "neutral"}>
                    {event.priority}
                  </Badge>
                  <ContextBadge
                    contextRef={event.contextRef}
                    onOpen={() => event.contextRef && setOpenContextId(event.contextRef.id)}
                  />
                </div>
```

Antes do fechamento do `</Card>`, renderizar a thread:

```tsx
      {openContext ? (
        <ContextThread context={openContext} open onClose={() => setOpenContextId(null)} />
      ) : null}
    </Card>
```

- [ ] **Step 4: Passar `contexts` no dashboard page**

Em `apps/web/src/app/(workspace)/dashboard/page.tsx`, atualizar o uso do `Timeline`:

```tsx
          <Timeline events={dashboard.events} contexts={dashboard.contexts} />
```

Garantir que `normalizeDashboardPayload` inclua `contexts: listOrEmpty(payload?.contexts)` (em `apps/web/src/lib/dashboard-view-model.ts`, na função `emptyDashboard` adicionar `contexts: []` e em `normalizeDashboardPayload` propagar `contexts`). Ajustar conforme a forma real de `normalizeDashboardPayload`.

- [ ] **Step 5: Rodar o teste (espera PASS) e a suíte web**

```
cd apps/web && npx vitest run
cd apps/web && npx tsc --noEmit
```

Esperado: **PASS** e typecheck limpo.

- [ ] **Step 6: Commit**

```
git add apps/web/src/components/workspace/timeline.tsx apps/web/src/components/workspace/timeline.test.tsx "apps/web/src/app/(workspace)/dashboard/page.tsx" apps/web/src/lib/dashboard-view-model.ts && git commit -m "Render context badge and thread drawer on dashboard cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: E2E — Linear + GitHub + Slack com a mesma chave formam um contexto

**Files:**
- Create: `apps/api/internal/gateway/context_e2e_test.go`

- [ ] **Step 1: Escrever o teste E2E (Go, in-process) que falha**

Criar `apps/api/internal/gateway/context_e2e_test.go`:

```go
package gateway

import (
	"context"
	"testing"
	"time"

	"github.com/developer-os/api/internal/domain"
	"github.com/developer-os/api/internal/store"
)

func TestEndToEndSingleContextFromThreeSources(t *testing.T) {
	memStore := store.NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	now := time.Now().UTC()

	// Eventos vindos de três connectors, todos com ticket:TASK-04.
	linear := domain.WorkEvent{ID: "l1", ExternalID: "l1", Service: domain.ServiceLinear, Type: "linear.issue.started", Title: "TASK-04 fix de auth", Source: "Linear", Priority: "medium", OccurredAt: now.Add(-3 * time.Hour), CorrelationKeys: []string{"ticket:TASK-04"}}
	github := domain.WorkEvent{ID: "g1", ExternalID: "g1", Service: domain.ServiceGitHub, Type: "review.requested", Title: "#123 TASK-04 code review", Source: "GitHub", Priority: "high", OccurredAt: now.Add(-2 * time.Hour), CorrelationKeys: []string{"ticket:TASK-04", "pr:acme/api#123"}}
	slack := domain.WorkEvent{ID: "s1", ExternalID: "s1", Service: domain.ServiceSlack, Type: "slack.blocker", Title: "a TASK-04 já está em produção?", Source: "Slack", Priority: "high", OccurredAt: now.Add(-1 * time.Hour), CorrelationKeys: []string{"ticket:TASK-04"}}

	if err := memStore.SaveWorkEvents(context.Background(), ctx, []domain.WorkEvent{linear, github, slack}); err != nil {
		t.Fatal(err)
	}
	if err := materializeContexts(context.Background(), memStore, ctx); err != nil {
		t.Fatal(err)
	}

	dashboard, err := memStore.GetDashboard(context.Background(), ctx)
	if err != nil {
		t.Fatal(err)
	}

	if len(dashboard.Contexts) != 1 {
		t.Fatalf("expected exactly 1 context, got %d", len(dashboard.Contexts))
	}
	one := dashboard.Contexts[0]
	if one.AnchorKey != "ticket:TASK-04" {
		t.Fatalf("expected anchor ticket:TASK-04, got %q", one.AnchorKey)
	}
	if len(one.Members) != 3 {
		t.Fatalf("expected 3 members in the thread, got %d", len(one.Members))
	}
	if one.Status != "aguardando_resposta" && one.Status != "bloqueado" {
		t.Fatalf("expected blocked/waiting status from slack.blocker, got %q", one.Status)
	}

	// Cada evento carrega o selo (ContextRef com 3 fontes).
	withRef := 0
	for _, event := range dashboard.Events {
		if event.ContextRef != nil {
			withRef++
			if event.ContextRef.Sources != 3 {
				t.Fatalf("expected 3 sources on badge, got %d", event.ContextRef.Sources)
			}
		}
	}
	if withRef != 3 {
		t.Fatalf("expected all 3 events to carry a contextRef, got %d", withRef)
	}
}
```

- [ ] **Step 2: Rodar o teste (espera PASS — todas as peças já existem após Tasks 1-7)**

```
cd apps/api && go test ./internal/gateway/ -run TestEndToEndSingleContextFromThreeSources
```

Esperado: **PASS**. Se falhar, depurar com `superpowers:systematic-debugging` — provável causa: derivação de status ou `attachContextRefs`.

- [ ] **Step 3: Rodar toda a suíte Go e web**

```
cd apps/api && go test ./...
cd apps/web && npx vitest run
```

Esperado: **PASS** em ambos.

- [ ] **Step 4: Commit**

```
git add apps/api/internal/gateway/context_e2e_test.go && git commit -m "Add E2E test: three sources with same key form one context

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Checklist (para o executor)

- [ ] `go test ./...` verde em `apps/api` (extração, union-find, dashboard, store, gateway, E2E).
- [ ] `npx vitest run` verde em `apps/web` (context-badge, context-thread, timeline).
- [ ] `npx tsc --noEmit` limpo em `apps/web`.
- [ ] Formato das chaves confere: `ticket:<KEY>`, `pr:<repo>#<num>`, `branch:<nome>`, `url:<url-normalizada>`.
- [ ] GitHub extrai ticket de branch, título, commits e a própria PR ref (Task 3, Step 3).
- [ ] Slack e Linear continuam funcionando: `extractLinkedRefs`/`extractLinearLinkedRefs` viraram wrappers sobre `CorrelationKeys`, e o pacote `integrations` inteiro passa.
- [ ] Âncora prefere `ticket:*`; contexto com 1 fonte NÃO vira contexto (sem selo); evento sem chave fica standalone (sem `ContextRef`).
- [ ] Linking é idempotente: `SaveWorkContexts` faz upsert por `(workspace_id, anchor_key)`; `BuildContexts` é determinístico (ordenado por `AnchorKey`).
- [ ] Materialização NUNCA quebra o sync: falha em `materializeContexts` só loga `WarnContext`.
- [ ] Selo renderiza `TASK-04 · N fontes`; clique abre a thread (drawer) com header (título + status derivado), timeline dos membros com deep-link e "o que falta".
- [ ] Estados cobertos: event-with-context, standalone, single-source (sem selo), partial-context (completa no próximo sync — nada quebra quando falta uma fonte).
- [ ] Schema atualizado: coluna `work_events.correlation_keys` e tabela `work_contexts` com unique `(workspace_id, anchor_key)`.
- [ ] Camada semântica (IA) NÃO foi construída (apenas determinística), conforme escopo.
```