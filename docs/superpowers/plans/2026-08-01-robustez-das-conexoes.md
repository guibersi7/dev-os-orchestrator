# Robustez das Conexões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar os 7 connectors (GitHub, Slack, Linear, Jira, Trello, Notion, Calendar) confiáveis a ponto de produção: retry/backoff com rate-limit, refresh automático de token no sync, sucesso parcial por recurso, e saúde da conexão visível.

**Architecture:** A robustez vive em duas peças compartilhadas — um `http.RoundTripper` com retry (`internal/httpx`) usado por todos os connectors, e um "sync runner" no gateway que renova o token e repete o sync uma vez em caso de expiração. Cada connector converte seus laços de fetch para sucesso parcial, e o `ConnectionStatus` passa a carregar `lastSyncAt`/`lastError`/`partialErrors`.

**Tech Stack:** Go (stdlib `net/http`, `testing`, `httptest`), pacote interno `internal/domain`, `internal/gateway`, `internal/integrations`, `internal/oauth`, `internal/store`.

---

## File Structure

- **Create** `apps/api/internal/httpx/retry.go` — RoundTripper com retry/backoff/rate-limit + `NewClient`.
- **Create** `apps/api/internal/httpx/retry_test.go` — testes do transporte.
- **Create** `apps/api/internal/integrations/errors.go` — classificação de erro de provider (`ProviderError`, tipos).
- **Create** `apps/api/internal/integrations/errors_test.go`.
- **Create** `apps/api/internal/gateway/syncrunner.go` — runner com refresh-on-expiry.
- **Create** `apps/api/internal/gateway/syncrunner_test.go`.
- **Create** `apps/api/internal/integrations/contract_test.go` — testes de readiness comuns aos 7.
- **Modify** cada connector (`github.go`, `slack.go`, `linear.go`, `jira.go`, `trello.go`, `notion.go`, `calendar.go`) — usar `httpx.NewClient` e sucesso parcial.
- **Modify** `apps/api/internal/domain/types.go` — `ResourceError`, `SyncResult.PartialErrors`, campos de saúde em `ConnectionStatus`.
- **Modify** `apps/api/internal/gateway/server.go` — handler de sync chama o runner; `/connections` expõe saúde.
- **Modify** `apps/api/internal/store/store.go` — persistir/ler `lastSyncAt`/`lastError`/`partialErrors`.

---

## Task 1: Transporte HTTP resiliente (`internal/httpx`)

**Files:**
- Create: `apps/api/internal/httpx/retry.go`
- Test: `apps/api/internal/httpx/retry_test.go`

- [ ] **Step 1: Write the failing test — retry em 5xx e sucesso**

```go
package httpx

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestRoundTripRetriesOn503ThenSucceeds(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(5*time.Second, WithMaxRetries(3), WithBaseDelay(time.Millisecond))
	resp, err := client.Get(server.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("got status %d, want 200", resp.StatusCode)
	}
	if calls != 3 {
		t.Fatalf("got %d calls, want 3", calls)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/httpx/ -run TestRoundTrip -v`
Expected: FAIL — package/`NewClient` não existe.

- [ ] **Step 3: Implement the transport**

```go
package httpx

import (
	"math"
	"net/http"
	"strconv"
	"time"
)

type Options struct {
	MaxRetries int
	BaseDelay  time.Duration
	MaxDelay   time.Duration
}

type Option func(*Options)

func WithMaxRetries(n int) Option    { return func(o *Options) { o.MaxRetries = n } }
func WithBaseDelay(d time.Duration) Option { return func(o *Options) { o.BaseDelay = d } }

type retryTransport struct {
	base http.RoundTripper
	opts Options
}

func NewClient(timeout time.Duration, options ...Option) *http.Client {
	opts := Options{MaxRetries: 3, BaseDelay: 200 * time.Millisecond, MaxDelay: 5 * time.Second}
	for _, apply := range options {
		apply(&opts)
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: &retryTransport{base: http.DefaultTransport, opts: opts},
	}
}

func (t *retryTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	var lastResp *http.Response
	var lastErr error
	for attempt := 0; attempt <= t.opts.MaxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(t.backoff(attempt, lastResp))
		}
		// Rebufferiza o corpo para POSTs (GetBody é setado por http.NewRequest com body).
		if req.Body != nil && req.GetBody != nil {
			body, err := req.GetBody()
			if err != nil {
				return nil, err
			}
			req.Body = body
		}
		lastResp, lastErr = t.base.RoundTrip(req)
		if lastErr != nil {
			continue
		}
		if !shouldRetry(lastResp.StatusCode) {
			return lastResp, nil
		}
	}
	return lastResp, lastErr
}

func shouldRetry(status int) bool {
	return status == http.StatusTooManyRequests || status >= 500
}

func (t *retryTransport) backoff(attempt int, resp *http.Response) time.Duration {
	if resp != nil {
		if v := resp.Header.Get("Retry-After"); v != "" {
			if secs, err := strconv.Atoi(v); err == nil {
				return time.Duration(secs) * time.Second
			}
		}
	}
	delay := time.Duration(float64(t.opts.BaseDelay) * math.Pow(2, float64(attempt-1)))
	if delay > t.opts.MaxDelay {
		delay = t.opts.MaxDelay
	}
	return delay
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/httpx/ -run TestRoundTrip -v`
Expected: PASS

- [ ] **Step 5: Add test — respeita Retry-After em 429**

```go
func TestRoundTripHonorsRetryAfterOn429(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(5*time.Second, WithMaxRetries(2), WithBaseDelay(time.Millisecond))
	resp, err := client.Get(server.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK || calls != 2 {
		t.Fatalf("status=%d calls=%d, want 200/2", resp.StatusCode, calls)
	}
}
```

- [ ] **Step 6: Run and commit**

Run: `cd apps/api && go test ./internal/httpx/ -v`
Expected: PASS

```bash
git add apps/api/internal/httpx/
git commit -m "feat(api): add resilient http transport with retry and rate-limit"
```

---

## Task 2: Wire o transporte resiliente nos connectors

**Files:**
- Modify: `apps/api/internal/integrations/github.go:37`, `slack.go:35`, `linear.go:33`, `jira.go:35`, `trello.go:35`, `notion.go:35`, `calendar.go:34` (o campo `client: &http.Client{Timeout: 15 * time.Second}`)

- [ ] **Step 1: Trocar o client em cada connector**

Em cada arquivo, substituir:

```go
client:     &http.Client{Timeout: 15 * time.Second},
```

por:

```go
client:     httpx.NewClient(15 * time.Second),
```

E adicionar o import `"github.com/developer-os/api/internal/httpx"` em cada arquivo.

- [ ] **Step 2: Verificar compilação e testes existentes**

Run: `cd apps/api && go build ./... && go test ./internal/integrations/ -v`
Expected: build OK; testes existentes (github_test, slack_test, linear_test, etc.) continuam PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/internal/integrations/
git commit -m "refactor(api): use resilient http client in all connectors"
```

---

## Task 3: Classificação de erro de provider (`ProviderError`)

**Files:**
- Create: `apps/api/internal/integrations/errors.go`
- Test: `apps/api/internal/integrations/errors_test.go`

- [ ] **Step 1: Write the failing test**

```go
package integrations

import (
	"net/http"
	"testing"
)

func TestClassifyHTTPStatus(t *testing.T) {
	cases := []struct {
		status    int
		wantType  string
		retryable bool
	}{
		{http.StatusUnauthorized, "needs_auth", false},
		{http.StatusTooManyRequests, "rate_limited", true},
		{http.StatusBadGateway, "provider_unavailable", true},
		{http.StatusNotFound, "unknown", false},
	}
	for _, c := range cases {
		err := NewProviderError(c.status, "boom")
		if err.Type != c.wantType || err.Retryable != c.retryable {
			t.Fatalf("status %d => type=%s retryable=%v, want %s/%v",
				c.status, err.Type, err.Retryable, c.wantType, c.retryable)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/integrations/ -run TestClassifyHTTPStatus -v`
Expected: FAIL — `NewProviderError` não existe.

- [ ] **Step 3: Implement**

```go
package integrations

import (
	"fmt"
	"net/http"
)

type ProviderError struct {
	Type      string
	Retryable bool
	Status    int
	Message   string
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("%s (%d): %s", e.Type, e.Status, e.Message)
}

func NewProviderError(status int, message string) *ProviderError {
	errType := "unknown"
	retryable := false
	switch {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		errType = "needs_auth"
	case status == http.StatusTooManyRequests:
		errType, retryable = "rate_limited", true
	case status >= 500:
		errType, retryable = "provider_unavailable", true
	}
	return &ProviderError{Type: errType, Retryable: retryable, Status: status, Message: message}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/integrations/ -run TestClassifyHTTPStatus -v`
Expected: PASS

- [ ] **Step 5: Usar `NewProviderError` nos `get()`/`graphql()`**

Em cada connector, trocar o retorno de erro HTTP. Ex. em `github.go` (`get`, ~linha 423):

```go
	if resp.StatusCode >= 400 {
		return NewProviderError(resp.StatusCode, "github api request failed: "+resp.Status)
	}
```

Aplicar o padrão equivalente em `slack.go`, `linear.go`, `jira.go`, `trello.go`, `notion.go`, `calendar.go`.

- [ ] **Step 6: Run and commit**

Run: `cd apps/api && go test ./internal/integrations/ -v && go build ./...`
Expected: PASS / build OK

```bash
git add apps/api/internal/integrations/
git commit -m "feat(api): classify provider http errors"
```

---

## Task 4: Domain — `ResourceError` e `SyncResult.PartialErrors`

**Files:**
- Modify: `apps/api/internal/domain/types.go`

- [ ] **Step 1: Adicionar tipos ao domínio**

No `types.go`, adicionar:

```go
type ResourceError struct {
	Resource  string `json:"resource"`
	Type      string `json:"type"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}
```

E no struct `SyncResult` (junto a `Status`, `Events`), adicionar o campo:

```go
	PartialErrors []ResourceError `json:"partialErrors,omitempty"`
```

- [ ] **Step 2: Verificar compilação**

Run: `cd apps/api && go build ./...`
Expected: build OK

- [ ] **Step 3: Commit**

```bash
git add apps/api/internal/domain/types.go
git commit -m "feat(api): add ResourceError and SyncResult.PartialErrors"
```

---

## Task 5: Sucesso parcial no GitHub

**Files:**
- Modify: `apps/api/internal/integrations/github.go:130-172` (`fetchRecentRecordsForRepositories`)
- Test: `apps/api/internal/integrations/github_test.go`

- [ ] **Step 1: Write the failing test — um repo falha, outro sincroniza**

```go
func TestGitHubPartialSuccessWhenOneRepoFails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/repos/acme/bad/") {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	c := &GitHubConnector{
		info:         domain.ConnectorInfo{ID: domain.ServiceGitHub},
		client:       server.Client(),
		apiBaseURL:   server.URL,
		repositories: []string{"acme/good", "acme/bad"},
		maxPages:     1,
	}
	result, err := c.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "x"})
	if err != nil {
		t.Fatalf("expected partial success, got error: %v", err)
	}
	if result.Status != "degraded" {
		t.Fatalf("got status %q, want degraded", result.Status)
	}
	if len(result.PartialErrors) != 1 || result.PartialErrors[0].Resource != "acme/bad" {
		t.Fatalf("got partial errors %+v, want one for acme/bad", result.PartialErrors)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/integrations/ -run TestGitHubPartialSuccess -v`
Expected: FAIL — hoje o Sync aborta com erro em vez de `degraded`.

- [ ] **Step 3: Converter o laço para acumular erros**

Em `fetchRecentRecordsForRepositories`, mudar a assinatura para retornar erros por recurso e continuar:

```go
func (c *GitHubConnector) fetchRecentRecordsForRepositories(ctx context.Context, accessToken string, repositories []string) ([]domain.ExternalRecord, []domain.ResourceError) {
	records := []domain.ExternalRecord{}
	partial := []domain.ResourceError{}
	for _, repository := range repositories {
		repoRecords, err := c.fetchRepositoryRecords(ctx, accessToken, repository)
		if err != nil {
			partial = append(partial, resourceErrorFor(repository, err))
			continue
		}
		records = append(records, repoRecords...)
	}
	return records, partial
}
```

Extrair o corpo antigo do laço (pulls, reviews, issues, checks) para um novo método `fetchRepositoryRecords(ctx, accessToken, repository) ([]domain.ExternalRecord, error)` que retorna erro no primeiro fetch que falhar **daquele** repositório. Adicionar helper:

```go
func resourceErrorFor(resource string, err error) domain.ResourceError {
	var pe *ProviderError
	if errors.As(err, &pe) {
		return domain.ResourceError{Resource: resource, Type: pe.Type, Message: pe.Message, Retryable: pe.Retryable}
	}
	return domain.ResourceError{Resource: resource, Type: "unknown", Message: err.Error()}
}
```

- [ ] **Step 4: Ajustar `Sync`/`SyncSelected`/`FetchRecentRecords` para propagar `PartialErrors` e status**

Em `Sync`, após obter records+partial:

```go
	records, partial := c.fetchRecentRecordsForRepositories(ctx, accessToken, repositories)
	events := c.Normalize(records)
	status := "connected"
	if len(partial) > 0 {
		status = "degraded"
	}
	if len(records) == 0 && len(partial) > 0 {
		status = "failed"
	}
	return domain.SyncResult{
		Service: domain.ServiceGitHub, Status: status,
		RecordsScanned: len(records), EventsCreated: len(events),
		NextCursor: latestRecordCursor(records), Events: events,
		PartialErrors: partial,
	}, nil
```

(`FetchRecentRecords` passa a chamar o mesmo helper e descartar `partial`, ou ser removido se não usado fora do Sync — verificar referências antes.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/integrations/ -run TestGitHub -v`
Expected: PASS (novo teste + os existentes)

- [ ] **Step 6: Commit**

```bash
git add apps/api/internal/integrations/github.go apps/api/internal/integrations/github_test.go
git commit -m "feat(api): partial success in github sync"
```

---

## Task 6: Sucesso parcial em Slack, Linear, Jira, Trello

**Files:**
- Modify/Test: `slack.go`, `linear.go`, `jira.go`, `trello.go` (+ respectivos `_test.go`)

> Notion e Calendar tipicamente sincronizam um único escopo; se o connector não itera sobre múltiplos recursos, apenas garanta que o status seja `failed` (não `degraded`) quando o único fetch falha, e pule a conversão de laço.

Para **cada** connector com laço multi-recurso (Slack: canais; Linear: issues por scope; Jira: projetos; Trello: boards), repetir o padrão da Task 5:

- [ ] **Step 1 (Slack): Write the failing test — um canal falha, outro sincroniza**

```go
func TestSlackPartialSuccessWhenOneChannelFails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.RawQuery, "channel=C_BAD") {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"channel":{"id":"C_OK","name":"ok"},"messages":[]}`))
	}))
	defer server.Close()

	c := &SlackConnector{
		info:       domain.ConnectorInfo{ID: domain.ServiceSlack},
		client:     server.Client(),
		apiBaseURL: server.URL,
		channelIDs: []string{"C_OK", "C_BAD"},
	}
	result, err := c.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "x"})
	if err != nil {
		t.Fatalf("expected partial success, got: %v", err)
	}
	if result.Status != "degraded" || len(result.PartialErrors) != 1 {
		t.Fatalf("got %s / %+v, want degraded with 1 partial", result.Status, result.PartialErrors)
	}
}
```

- [ ] **Step 2 (Slack): Run to verify it fails**

Run: `cd apps/api && go test ./internal/integrations/ -run TestSlackPartial -v`
Expected: FAIL

- [ ] **Step 3 (Slack): Converter `fetchRecentRecordsForChannels` para acumular `ResourceError` por canal** (mesmo shape da Task 5: laço por canal, `continue` em erro, retorna `([]ExternalRecord, []domain.ResourceError)`), e ajustar `Sync`/`SyncSelected` para setar status `connected`/`degraded`/`failed` e `PartialErrors`. Reusar `resourceErrorFor` (mover para um arquivo compartilhado `integrations/partial.go` para não duplicar).

- [ ] **Step 4 (Slack): Run to verify it passes**

Run: `cd apps/api && go test ./internal/integrations/ -run TestSlack -v`
Expected: PASS

- [ ] **Step 5: Repetir Steps 1-4 para Linear, Jira, Trello** — mesma estrutura de teste (um recurso 4xx, outro OK → `degraded` com 1 partial), mesma conversão de laço.

- [ ] **Step 6: Mover `resourceErrorFor` para arquivo compartilhado**

Create `apps/api/internal/integrations/partial.go`:

```go
package integrations

import (
	"errors"

	"github.com/developer-os/api/internal/domain"
)

func resourceErrorFor(resource string, err error) domain.ResourceError {
	var pe *ProviderError
	if errors.As(err, &pe) {
		return domain.ResourceError{Resource: resource, Type: pe.Type, Message: pe.Message, Retryable: pe.Retryable}
	}
	return domain.ResourceError{Resource: resource, Type: "unknown", Message: err.Error()}
}

func syncStatus(records int, partial int) string {
	switch {
	case partial > 0 && records == 0:
		return "failed"
	case partial > 0:
		return "degraded"
	default:
		return "connected"
	}
}
```

Remover a definição duplicada de `resourceErrorFor` do `github.go` e usar `syncStatus(len(records), len(partial))` nos connectors.

- [ ] **Step 7: Run and commit**

Run: `cd apps/api && go test ./internal/integrations/ -v && go build ./...`
Expected: PASS / build OK

```bash
git add apps/api/internal/integrations/
git commit -m "feat(api): partial success in slack, linear, jira, trello"
```

---

## Task 7: Sync runner com refresh automático

**Files:**
- Create: `apps/api/internal/gateway/syncrunner.go`
- Test: `apps/api/internal/gateway/syncrunner_test.go`

**Interfaces (para testar com fakes):**

```go
type tokenStore interface {
	GetToken(context.Context, domain.GatewayContext, domain.Service) (domain.ProviderToken, error)
	UpsertToken(context.Context, domain.GatewayContext, domain.TokenUpsertRequest) error
}

type tokenRefresher interface {
	Refresh(ctx context.Context, service domain.Service, refreshToken string) (domain.ProviderToken, error)
}

type syncable interface {
	Sync(context.Context, domain.GatewayContext, *domain.ProviderToken) (domain.SyncResult, error)
}
```

- [ ] **Step 1: Write the failing test — token expirado dispara refresh e repete o sync**

```go
package gateway

import (
	"context"
	"testing"
	"time"

	"github.com/developer-os/api/internal/domain"
)

type fakeStore struct {
	token    domain.ProviderToken
	upserted bool
}

func (f *fakeStore) GetToken(context.Context, domain.GatewayContext, domain.Service) (domain.ProviderToken, error) {
	return f.token, nil
}
func (f *fakeStore) UpsertToken(context.Context, domain.GatewayContext, domain.TokenUpsertRequest) error {
	f.upserted = true
	return nil
}

type fakeRefresher struct{ called bool }

func (f *fakeRefresher) Refresh(context.Context, domain.Service, string) (domain.ProviderToken, error) {
	f.called = true
	return domain.ProviderToken{AccessToken: "fresh"}, nil
}

type fakeConnector struct{ calls int }

func (f *fakeConnector) Sync(_ context.Context, _ domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	f.calls++
	if token.AccessToken != "fresh" {
		return domain.SyncResult{Service: domain.ServiceLinear, Status: "needs_auth"}, nil
	}
	return domain.SyncResult{Service: domain.ServiceLinear, Status: "connected"}, nil
}

func TestRunSyncRefreshesExpiredTokenAndRetries(t *testing.T) {
	past := time.Now().Add(-time.Hour).Format(time.RFC3339)
	store := &fakeStore{token: domain.ProviderToken{AccessToken: "stale", RefreshToken: "r", ExpiresAt: past}}
	refresher := &fakeRefresher{}
	conn := &fakeConnector{}

	result, err := runSync(context.Background(), domain.GatewayContext{}, domain.ServiceLinear, conn, store, refresher)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !refresher.called || !store.upserted {
		t.Fatalf("expected refresh+upsert, got called=%v upserted=%v", refresher.called, store.upserted)
	}
	if conn.calls != 2 || result.Status != "connected" {
		t.Fatalf("got calls=%d status=%s, want 2/connected", conn.calls, result.Status)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/gateway/ -run TestRunSync -v`
Expected: FAIL — `runSync` não existe.

- [ ] **Step 3: Implement `runSync`**

```go
package gateway

import (
	"context"
	"time"

	"github.com/developer-os/api/internal/domain"
)

func tokenExpired(token domain.ProviderToken) bool {
	if token.ExpiresAt == "" {
		return false
	}
	expiresAt, err := time.Parse(time.RFC3339, token.ExpiresAt)
	if err != nil {
		return false
	}
	return time.Now().After(expiresAt)
}

func runSync(ctx context.Context, gctx domain.GatewayContext, service domain.Service,
	conn syncable, store tokenStore, refresher tokenRefresher) (domain.SyncResult, error) {

	token, err := store.GetToken(ctx, gctx, service)
	if err != nil {
		return domain.SyncResult{}, err
	}

	if tokenExpired(token) && token.RefreshToken != "" {
		if err := refreshAndPersist(ctx, gctx, service, &token, store, refresher); err != nil {
			return domain.SyncResult{}, err
		}
	}

	result, err := conn.Sync(ctx, gctx, &token)
	if err != nil {
		return domain.SyncResult{}, err
	}

	// Refresh reativo: connector reportou needs_auth mas temos refresh token.
	if result.Status == "needs_auth" && token.RefreshToken != "" {
		if err := refreshAndPersist(ctx, gctx, service, &token, store, refresher); err != nil {
			return domain.SyncResult{}, err
		}
		return conn.Sync(ctx, gctx, &token)
	}
	return result, nil
}

func refreshAndPersist(ctx context.Context, gctx domain.GatewayContext, service domain.Service,
	token *domain.ProviderToken, store tokenStore, refresher tokenRefresher) error {
	fresh, err := refresher.Refresh(ctx, service, token.RefreshToken)
	if err != nil {
		return err
	}
	if fresh.RefreshToken == "" {
		fresh.RefreshToken = token.RefreshToken
	}
	*token = fresh
	return store.UpsertToken(ctx, gctx, domain.TokenUpsertRequest{
		Service:      service,
		AccessToken:  fresh.AccessToken,
		RefreshToken: fresh.RefreshToken,
		ExpiresAt:    fresh.ExpiresAt,
	})
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/gateway/ -run TestRunSync -v`
Expected: PASS

- [ ] **Step 5: Add test — sem refresh token, needs_auth não repete**

```go
func TestRunSyncWithoutRefreshTokenReturnsNeedsAuth(t *testing.T) {
	store := &fakeStore{token: domain.ProviderToken{AccessToken: "stale"}}
	conn := &fakeConnector{}
	result, err := runSync(context.Background(), domain.GatewayContext{}, domain.ServiceLinear, conn, store, &fakeRefresher{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if conn.calls != 1 || result.Status != "needs_auth" {
		t.Fatalf("got calls=%d status=%s, want 1/needs_auth", conn.calls, result.Status)
	}
}
```

- [ ] **Step 6: Run and commit**

Run: `cd apps/api && go test ./internal/gateway/ -run TestRunSync -v`
Expected: PASS

```bash
git add apps/api/internal/gateway/syncrunner.go apps/api/internal/gateway/syncrunner_test.go
git commit -m "feat(api): sync runner with automatic token refresh"
```

---

## Task 8: Integrar o runner no handler de sync

**Files:**
- Modify: `apps/api/internal/gateway/server.go:546-551` (onde chama `connector.Sync`/`SyncSelected`)

- [ ] **Step 1: Criar um adapter `oauthRefresher` que satisfaz `tokenRefresher`**

Em `syncrunner.go`, adicionar um adapter que usa o `oauth.RefreshToken` já existente (ver uso em `server.go:681`) e o provider resolvido:

```go
type oauthRefresher struct {
	httpClient *http.Client
	providers  map[domain.Service]oauth.Provider
}

func (o *oauthRefresher) Refresh(ctx context.Context, service domain.Service, refreshToken string) (domain.ProviderToken, error) {
	provider, ok := o.providers[service]
	if !ok {
		return domain.ProviderToken{}, fmt.Errorf("no oauth provider for %s", service)
	}
	refreshed, err := oauth.RefreshToken(ctx, o.httpClient, provider, refreshToken)
	if err != nil {
		return domain.ProviderToken{}, err
	}
	token := domain.ProviderToken{AccessToken: refreshed.AccessToken, RefreshToken: refreshed.RefreshToken}
	if refreshed.ExpiresAt != nil {
		token.ExpiresAt = refreshed.ExpiresAt.Format(time.RFC3339)
	}
	return token, nil
}
```

(Confirmar o shape de `oauth.RefreshToken` e `oauth.Provider` lendo `internal/oauth/`; ajustar nomes se necessário.)

- [ ] **Step 2: Substituir a chamada direta no handler**

No handler de sync, para o caminho **não-scoped**, trocar:

```go
	result, err = connector.Sync(r.Context(), ctx, tokenRef)
```

por uma chamada ao runner (mantendo o caminho scoped como está por ora, ou envolvendo também):

```go
	result, err = runSync(r.Context(), ctx, input.Service, connector, s.store, s.refresher)
```

onde `s.refresher` é inicializado no construtor do Server com `&oauthRefresher{httpClient: s.httpClient, providers: oauth.Providers()}`.

- [ ] **Step 3: Verificar testes do gateway**

Run: `cd apps/api && go test ./internal/gateway/ -v && go build ./...`
Expected: PASS / build OK. Ajustar `server_test.go` se ele injeta connectors diretamente.

- [ ] **Step 4: Commit**

```bash
git add apps/api/internal/gateway/
git commit -m "feat(api): use sync runner with refresh in sync handler"
```

---

## Task 9: Saúde da conexão no `ConnectionStatus` e `/connections`

**Files:**
- Modify: `apps/api/internal/domain/types.go` (`ConnectionStatus`)
- Modify: `apps/api/internal/store/store.go` (persistir/ler saúde a partir do `SyncResult`)
- Modify: `apps/api/internal/gateway/server.go` (handler `/connections`)
- Test: `apps/api/internal/store/store_test.go`

- [ ] **Step 1: Enriquecer `ConnectionStatus`**

Adicionar campos (se ainda não existirem) ao struct em `types.go`:

```go
	LastSyncAt    *time.Time      `json:"lastSyncAt,omitempty"`
	LastError     string          `json:"lastError,omitempty"`
	PartialErrors []ResourceError `json:"partialErrors,omitempty"`
```

- [ ] **Step 2: Write the failing test — SaveSyncResult grava lastSyncAt/partialErrors**

Em `store_test.go`, adicionar um teste que salva um `SyncResult{Status:"degraded", PartialErrors: [...]}` e lê a `ConnectionStatus` esperando `LastSyncAt != nil` e `PartialErrors` preenchido. (Seguir o padrão dos testes de store existentes — inspecionar `store_test.go` para o helper de setup.)

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/api && go test ./internal/store/ -run TestConnectionHealth -v`
Expected: FAIL

- [ ] **Step 4: Implementar a persistência de saúde no `SaveSyncResult`/leitura de `ConnectionStatus`** — ao salvar o resultado, registrar `lastSyncAt = now` em sucesso/degradado, `lastError` a partir do `SaveSyncFailure`/status, e copiar `PartialErrors`. Expor esses campos ao montar `ConnectionStatus`.

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/api && go test ./internal/store/ -v`
Expected: PASS

- [ ] **Step 6: Garantir que o handler `/connections` serializa os novos campos** (normalmente automático via struct; confirmar que não há DTO intermediário que os descarte).

- [ ] **Step 7: Run and commit**

Run: `cd apps/api && go test ./... && go build ./...`
Expected: PASS / build OK

```bash
git add apps/api/internal/
git commit -m "feat(api): surface connection health (lastSync, lastError, partialErrors)"
```

---

## Task 10: Teste de contrato comum aos 7 connectors

**Files:**
- Create: `apps/api/internal/integrations/contract_test.go`

- [ ] **Step 1: Escrever o teste parametrizado de readiness**

```go
package integrations

import "testing"

func TestConnectorReadinessContract(t *testing.T) {
	connectors := []Connector{
		NewGitHubConnector(), NewSlackConnector(), NewLinearConnector(),
		NewJiraConnector(), NewTrelloConnector(), NewNotionConnector(), NewCalendarConnector(),
	}
	for _, c := range connectors {
		info := c.Info()
		t.Run(string(info.ID), func(t *testing.T) {
			if info.ID == "" || info.Name == "" {
				t.Fatalf("connector missing identity: %+v", info)
			}
			if info.AuthStrategy != "oauth" {
				t.Fatalf("%s auth strategy = %q, want oauth", info.ID, info.AuthStrategy)
			}
		})
	}
}
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd apps/api && go test ./internal/integrations/ -run TestConnectorReadinessContract -v`
Expected: PASS (7 subtestes)

- [ ] **Step 3: Suíte completa e commit**

Run: `cd apps/api && go test ./... && go build ./...`
Expected: PASS / build OK

```bash
git add apps/api/internal/integrations/contract_test.go
git commit -m "test(api): connector readiness contract across all providers"
```

---

## Self-Review Checklist (para quem executa)

- Rodar `cd apps/api && go test ./... && go vet ./...` ao final — tudo verde.
- Confirmar que os 7 connectors usam `httpx.NewClient` (grep por `&http.Client{`).
- Confirmar que nenhum connector aborta o sync inteiro por falha de um único recurso.
- Confirmar que `GET /v1/connections` retorna `status`, `lastSyncAt`, `lastError`, `expiresAt`, `partialErrors`.
