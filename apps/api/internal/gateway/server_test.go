package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/developer-os/api/internal/domain"
	"github.com/developer-os/api/internal/integrations"
	"github.com/developer-os/api/internal/store"
)

func TestDashboardUsesVersionedEnvelope(t *testing.T) {
	server := NewServer(Config{
		Registry: integrations.NewRegistry(),
		Store:    store.NewMemoryStore(),
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/dashboard", nil)
	req.Header.Set("x-request-id", "req_test")
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.Code)
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}

	if body["version"] != "v1" {
		t.Fatalf("expected version v1, got %v", body["version"])
	}

	if body["requestId"] != "req_test" {
		t.Fatalf("expected request id to round-trip, got %v", body["requestId"])
	}

	if body["data"] == nil {
		t.Fatal("expected data envelope")
	}
}

func TestSyncRejectsUnsupportedService(t *testing.T) {
	server := NewServer(Config{
		Registry: integrations.NewRegistry(),
		Store:    store.NewMemoryStore(),
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/sync", strings.NewReader(`{"service":"unknown"}`))
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", res.Code)
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}

	apiError, ok := body["error"].(map[string]any)
	if !ok {
		t.Fatal("expected error envelope")
	}

	if apiError["code"] != "unsupported_service" {
		t.Fatalf("expected unsupported_service, got %v", apiError["code"])
	}
}

func TestSyncFailureWritesStructuredLogAndActionableError(t *testing.T) {
	var logs bytes.Buffer
	server := NewServer(Config{
		Registry: integrations.NewRegistryWithConnectors(failingConnector{}),
		Store:    store.NewMemoryStore(),
		Logger:   slog.New(slog.NewJSONHandler(&logs, nil)),
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/sync", strings.NewReader(`{"service":"github"}`))
	req.Header.Set("x-request-id", "req_sync_failure")
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusBadGateway {
		t.Fatalf("expected status 502, got %d", res.Code)
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	apiError, ok := body["error"].(map[string]any)
	if !ok {
		t.Fatal("expected error envelope")
	}
	details, ok := apiError["details"].(map[string]any)
	if !ok {
		t.Fatal("expected actionable error details")
	}
	if details["type"] != "rate_limit" {
		t.Fatalf("expected rate_limit error type, got %v", details["type"])
	}
	if details["retryable"] != true {
		t.Fatalf("expected retryable error, got %v", details["retryable"])
	}
	if details["action"] == "" {
		t.Fatal("expected recovery action")
	}

	logText := logs.String()
	for _, expected := range []string{"sync_started", "sync_failed", "req_sync_failure", "duration_ms", "rate_limit"} {
		if !strings.Contains(logText, expected) {
			t.Fatalf("expected log to contain %q, got %s", expected, logText)
		}
	}
}

func TestProtectedRoutesRequireGatewaySecret(t *testing.T) {
	server := NewServer(Config{
		Registry:      integrations.NewRegistry(),
		Store:         store.NewMemoryStore(),
		GatewaySecret: "secret",
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/dashboard", nil)
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", res.Code)
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}

	apiError, ok := body["error"].(map[string]any)
	if !ok {
		t.Fatal("expected error envelope")
	}

	if apiError["code"] != "unauthorized" {
		t.Fatalf("expected unauthorized, got %v", apiError["code"])
	}
}

func TestOAuthStartReportsMissingProviderConfig(t *testing.T) {
	server := NewServer(Config{
		Registry: integrations.NewRegistry(),
		Store:    store.NewMemoryStore(),
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/oauth/github/start?redirectUri=http://localhost/callback", nil)
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.Code)
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}

	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatal("expected data envelope")
	}

	if data["status"] != "needs_config" {
		t.Fatalf("expected needs_config, got %v", data["status"])
	}
}

func TestRefreshTokenExchangesAndDoesNotLeakTokens(t *testing.T) {
	oauthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}

		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}

		expected := url.Values{
			"grant_type":    []string{"refresh_token"},
			"refresh_token": []string{"old-refresh-token"},
			"client_id":     []string{"linear-client"},
			"client_secret": []string{"linear-secret"},
		}
		for key, values := range expected {
			if got := r.Form.Get(key); got != values[0] {
				t.Fatalf("expected %s=%q, got %q", key, values[0], got)
			}
		}

		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"new-access-token","refresh_token":"new-refresh-token","expires_in":3600,"scope":"read write"}`))
	}))
	defer oauthServer.Close()

	t.Setenv("LINEAR_CLIENT_ID", "linear-client")
	t.Setenv("LINEAR_CLIENT_SECRET", "linear-secret")
	t.Setenv("LINEAR_TOKEN_URL", oauthServer.URL)

	memoryStore := store.NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	if err := memoryStore.UpsertToken(nil, ctx, domain.TokenUpsertRequest{
		WorkspaceID:       ctx.WorkspaceID,
		Service:           domain.ServiceLinear,
		ProviderAccountID: "linear-account",
		AccessToken:       "old-access-token",
		RefreshToken:      "old-refresh-token",
		Scopes:            []string{"read"},
	}); err != nil {
		t.Fatal(err)
	}

	server := NewServer(Config{
		Registry: integrations.NewRegistry(),
		Store:    memoryStore,
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/tokens/refresh", strings.NewReader(`{"service":"linear"}`))
	req.Header.Set("x-workspace-id", ctx.WorkspaceID)
	req.Header.Set("x-user-id", ctx.UserID)
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}

	bodyText := res.Body.String()
	if strings.Contains(bodyText, "new-access-token") || strings.Contains(bodyText, "new-refresh-token") {
		t.Fatalf("response leaked provider token: %s", bodyText)
	}

	var body map[string]any
	if err := json.Unmarshal([]byte(bodyText), &body); err != nil {
		t.Fatal(err)
	}
	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatal("expected data envelope")
	}
	if data["status"] != "connected" {
		t.Fatalf("expected connected, got %v", data["status"])
	}

	token, err := memoryStore.GetToken(nil, ctx, domain.ServiceLinear)
	if err != nil {
		t.Fatal(err)
	}
	if token.AccessToken != "new-access-token" || token.RefreshToken != "new-refresh-token" {
		t.Fatalf("expected refreshed tokens to be persisted, got %#v", token)
	}
}

type failingConnector struct{}

func (f failingConnector) Info() domain.ConnectorInfo {
	return domain.ConnectorInfo{
		ID:           domain.ServiceGitHub,
		Name:         "GitHub",
		AuthStrategy: "oauth",
		SyncMode:     "incremental",
	}
}

func (f failingConnector) FetchRecentRecords(context.Context, domain.GatewayContext, *domain.ProviderToken) ([]domain.ExternalRecord, error) {
	return nil, errors.New("429 rate limit exceeded")
}

func (f failingConnector) Normalize([]domain.ExternalRecord) []domain.WorkEvent {
	return nil
}

func (f failingConnector) Sync(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	_, err := f.FetchRecentRecords(ctx, gatewayContext, token)
	return domain.SyncResult{}, err
}
