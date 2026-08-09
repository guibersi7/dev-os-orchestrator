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
	"time"

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

func TestWorkspaceRoutesCreateAndListUserWorkspaces(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace-default", UserID: "user-1"}
	server := NewServer(Config{
		Registry: integrations.NewRegistry(),
		Store:    memoryStore,
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/workspaces", strings.NewReader(`{"name":"Mobile Platform"}`))
	req.Header.Set("x-workspace-id", ctx.WorkspaceID)
	req.Header.Set("x-user-id", ctx.UserID)
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/v1/workspaces", nil)
	req.Header.Set("x-workspace-id", ctx.WorkspaceID)
	req.Header.Set("x-user-id", ctx.UserID)
	res = httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	data := body["data"].(map[string]any)
	if data["integrationScope"] != "per_workspace" || data["crossWorkspaceData"] != false {
		t.Fatalf("expected per-workspace isolation metadata, got %#v", data)
	}
	workspaces := data["workspaces"].([]any)
	if len(workspaces) != 2 {
		t.Fatalf("expected default plus created workspace, got %#v", workspaces)
	}
}

func TestWorkspaceDataIsIsolatedByWorkspaceID(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	ctxA := domain.GatewayContext{WorkspaceID: "workspace-a", UserID: "user-1"}
	ctxB := domain.GatewayContext{WorkspaceID: "workspace-b", UserID: "user-1"}

	if err := memoryStore.SaveWorkEvents(context.Background(), ctxA, []domain.WorkEvent{{
		ID:         "event-a",
		ExternalID: "event-a",
		Service:    domain.ServiceGitHub,
		Type:       "pull_request.review_requested",
		Title:      "Workspace A review",
		Source:     "repo-a",
		Actor:      "Ana",
		Priority:   "high",
		Summary:    "Only workspace A should see this event.",
		OccurredAt: time.Now().UTC(),
	}}); err != nil {
		t.Fatal(err)
	}

	if err := memoryStore.UpsertToken(context.Background(), ctxA, domain.TokenUpsertRequest{
		WorkspaceID:       ctxA.WorkspaceID,
		Service:           domain.ServiceGitHub,
		ProviderAccountID: "github-account",
		AccessToken:       "workspace-a-token",
	}); err != nil {
		t.Fatal(err)
	}

	dashboardA, err := memoryStore.GetDashboard(context.Background(), ctxA)
	if err != nil {
		t.Fatal(err)
	}
	dashboardB, err := memoryStore.GetDashboard(context.Background(), ctxB)
	if err != nil {
		t.Fatal(err)
	}
	if len(dashboardA.Events) != 1 {
		t.Fatalf("expected workspace A event, got %#v", dashboardA.Events)
	}
	if len(dashboardB.Events) != 0 {
		t.Fatalf("expected workspace B to have no events, got %#v", dashboardB.Events)
	}

	if _, err := memoryStore.GetToken(context.Background(), ctxB, domain.ServiceGitHub); !errors.Is(err, store.ErrTokenNotFound) {
		t.Fatalf("expected workspace B to have no github token, got %v", err)
	}
}

func TestAgentChatRequiresConfiguredAgentBaseURL(t *testing.T) {
	server := NewServer(Config{
		Registry: integrations.NewRegistry(),
		Store:    store.NewMemoryStore(),
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/agent/chat", strings.NewReader(`{"message":"What is blocked?"}`))
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "agent_not_configured") {
		t.Fatalf("expected agent_not_configured error, got %s", res.Body.String())
	}
}

func TestNormalizeAgentBaseURLAcceptsRenderHostPort(t *testing.T) {
	if got := normalizeAgentBaseURL("standup-agent:10000/"); got != "http://standup-agent:10000" {
		t.Fatalf("expected hostport to gain http scheme, got %q", got)
	}
	if got := normalizeAgentBaseURL("https://agent.example.com/"); got != "https://agent.example.com" {
		t.Fatalf("expected https URL to be preserved, got %q", got)
	}
}

func TestAgentChatSendsWorkspaceScopedContextAndReturnsCitations(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	ctxA := domain.GatewayContext{WorkspaceID: "workspace-a", UserID: "user-1"}
	ctxB := domain.GatewayContext{WorkspaceID: "workspace-b", UserID: "user-1"}
	now := time.Now().UTC()

	if err := memoryStore.SaveWorkEvents(context.Background(), ctxA, []domain.WorkEvent{{
		ID:         "event-a",
		ExternalID: "event-a",
		Service:    domain.ServiceGitHub,
		Type:       "check.failed",
		Title:      "Workspace A checks failed",
		Source:     "repo-a",
		Actor:      "GitHub Actions",
		Priority:   "high",
		Summary:    "Only workspace A should be sent to the agent.",
		OccurredAt: now,
	}}); err != nil {
		t.Fatal(err)
	}
	if err := memoryStore.SaveWorkEvents(context.Background(), ctxB, []domain.WorkEvent{{
		ID:         "event-b",
		ExternalID: "event-b",
		Service:    domain.ServiceSlack,
		Type:       "slack.decision",
		Title:      "Workspace B decision",
		Source:     "#release",
		Actor:      "Slack",
		Priority:   "medium",
		Summary:    "Workspace B must not be sent.",
		OccurredAt: now,
	}}); err != nil {
		t.Fatal(err)
	}

	agentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			WorkspaceID string              `json:"workspaceId"`
			Context     domain.AgentContext `json:"context"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload.WorkspaceID != ctxA.WorkspaceID {
			t.Fatalf("expected workspace %s, got %s", ctxA.WorkspaceID, payload.WorkspaceID)
		}
		if len(payload.Context.Events) != 1 || payload.Context.Events[0].ID != "event-a" {
			t.Fatalf("expected only workspace A context, got %#v", payload.Context.Events)
		}
		_ = json.NewEncoder(w).Encode(domain.AgentChatResponse{
			Answer: "Checks are blocked by Workspace A checks failed.",
			Citations: []domain.AgentCitation{{
				Type:    "work_event",
				ID:      "event-a",
				Service: domain.ServiceGitHub,
				Title:   "Workspace A checks failed",
			}},
			SuggestedActions: []domain.AgentSuggestedAction{{Label: "Open failed checks", Kind: "inspect"}},
			Confidence:       "high",
			Model:            "test-agent",
		})
	}))
	defer agentServer.Close()

	server := NewServer(Config{
		Registry:     integrations.NewRegistry(),
		Store:        memoryStore,
		AgentBaseURL: agentServer.URL,
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/agent/chat", strings.NewReader(`{"message":"What checks failed?"}`))
	req.Header.Set("x-workspace-id", ctxA.WorkspaceID)
	req.Header.Set("x-user-id", ctxA.UserID)
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "Workspace A checks failed") || !strings.Contains(res.Body.String(), "event-a") {
		t.Fatalf("expected agent citation response, got %s", res.Body.String())
	}
	if strings.Contains(res.Body.String(), "Workspace B") {
		t.Fatalf("agent response leaked workspace B data: %s", res.Body.String())
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

func TestConnectionsListDoesNotLeakTokens(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	if err := memoryStore.UpsertToken(context.Background(), ctx, domain.TokenUpsertRequest{
		WorkspaceID:       ctx.WorkspaceID,
		Service:           domain.ServiceGitHub,
		ProviderAccountID: "github-account",
		AccessToken:       "secret-access-token",
		RefreshToken:      "secret-refresh-token",
		Scopes:            []string{"repo"},
	}); err != nil {
		t.Fatal(err)
	}

	server := NewServer(Config{
		Registry: integrations.NewRegistry(),
		Store:    memoryStore,
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/connections", nil)
	req.Header.Set("x-workspace-id", ctx.WorkspaceID)
	req.Header.Set("x-user-id", ctx.UserID)
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.Code)
	}

	bodyText := res.Body.String()
	if strings.Contains(bodyText, "secret-access-token") || strings.Contains(bodyText, "secret-refresh-token") {
		t.Fatalf("connection response leaked token material: %s", bodyText)
	}

	var body map[string]any
	if err := json.Unmarshal([]byte(bodyText), &body); err != nil {
		t.Fatal(err)
	}
	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatal("expected data envelope")
	}
	connections, ok := data["connections"].([]any)
	if !ok {
		t.Fatal("expected connections array")
	}

	var github map[string]any
	for _, value := range connections {
		connection := value.(map[string]any)
		if connection["service"] == "github" {
			github = connection
			break
		}
	}
	if github == nil {
		t.Fatal("expected github connection")
	}
	if github["hasToken"] != true || github["hasRefreshToken"] != true {
		t.Fatalf("expected safe token metadata, got %#v", github)
	}
	if github["status"] != "needs_selection" && github["status"] != "needs_config" {
		t.Fatalf("expected needs_selection or needs_config status, got %#v", github["status"])
	}
	if github["selectionStatus"] != "needs_selection" {
		t.Fatalf("expected needs_selection selection status, got %#v", github["selectionStatus"])
	}
}

func TestDisconnectConnectionRemovesTokenAndLogsAuditEvent(t *testing.T) {
	var logs bytes.Buffer
	memoryStore := store.NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	if err := memoryStore.UpsertToken(context.Background(), ctx, domain.TokenUpsertRequest{
		WorkspaceID:       ctx.WorkspaceID,
		Service:           domain.ServiceSlack,
		ProviderAccountID: "slack-account",
		AccessToken:       "secret-access-token",
		RefreshToken:      "secret-refresh-token",
		Scopes:            []string{"channels:read"},
	}); err != nil {
		t.Fatal(err)
	}

	server := NewServer(Config{
		Registry: integrations.NewRegistry(),
		Store:    memoryStore,
		Logger:   slog.New(slog.NewJSONHandler(&logs, nil)),
	})

	req := httptest.NewRequest(http.MethodDelete, "/v1/connections/slack", nil)
	req.Header.Set("x-workspace-id", ctx.WorkspaceID)
	req.Header.Set("x-user-id", ctx.UserID)
	req.Header.Set("x-request-id", "req_disconnect")
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.Code)
	}

	if _, err := memoryStore.GetToken(context.Background(), ctx, domain.ServiceSlack); !errors.Is(err, store.ErrTokenNotFound) {
		t.Fatalf("expected token to be removed, got %v", err)
	}

	bodyText := res.Body.String()
	if strings.Contains(bodyText, "secret-access-token") || strings.Contains(bodyText, "secret-refresh-token") {
		t.Fatalf("disconnect response leaked token material: %s", bodyText)
	}
	if !strings.Contains(logs.String(), "connection_disconnected") || !strings.Contains(logs.String(), "req_disconnect") {
		t.Fatalf("expected disconnect audit log, got %s", logs.String())
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

func TestResourceSelectionUpdatesConnectionStatus(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	if err := memoryStore.UpsertToken(context.Background(), ctx, domain.TokenUpsertRequest{
		WorkspaceID:       ctx.WorkspaceID,
		Service:           domain.ServiceGitHub,
		ProviderAccountID: "github-account",
		AccessToken:       "access-token",
		Scopes:            []string{"repo"},
	}); err != nil {
		t.Fatal(err)
	}

	server := NewServer(Config{
		Registry: integrations.NewRegistry(),
		Store:    memoryStore,
	})

	payload := `{"resources":[{"id":"acme/api","type":"repository","name":"acme/api","externalUrl":"https://github.com/acme/api","metadata":{"fullName":"acme/api"}}]}`
	req := httptest.NewRequest(http.MethodPut, "/v1/connections/github/selection", strings.NewReader(payload))
	req.Header.Set("x-workspace-id", ctx.WorkspaceID)
	req.Header.Set("x-user-id", ctx.UserID)
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/v1/connections", nil)
	req.Header.Set("x-workspace-id", ctx.WorkspaceID)
	req.Header.Set("x-user-id", ctx.UserID)
	res = httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	data := body["data"].(map[string]any)
	connections := data["connections"].([]any)
	var github map[string]any
	for _, value := range connections {
		connection := value.(map[string]any)
		if connection["service"] == "github" {
			github = connection
			break
		}
	}
	if github == nil {
		t.Fatal("expected github connection")
	}
	if github["selectionStatus"] != "selected" {
		t.Fatalf("expected selected status, got %#v", github)
	}
	if github["selectedResourceCount"] != float64(1) {
		t.Fatalf("expected one selected resource, got %#v", github["selectedResourceCount"])
	}
}

func TestSyncRequiresSelectionWhenTokenExists(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	if err := memoryStore.UpsertToken(context.Background(), ctx, domain.TokenUpsertRequest{
		WorkspaceID:       ctx.WorkspaceID,
		Service:           domain.ServiceGitHub,
		ProviderAccountID: "github-account",
		AccessToken:       "access-token",
		Scopes:            []string{"repo"},
	}); err != nil {
		t.Fatal(err)
	}

	server := NewServer(Config{
		Registry: integrations.NewRegistryWithConnectors(failingConnector{}),
		Store:    memoryStore,
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/sync", strings.NewReader(`{"service":"github"}`))
	req.Header.Set("x-workspace-id", ctx.WorkspaceID)
	req.Header.Set("x-user-id", ctx.UserID)
	res := httptest.NewRecorder()

	server.Routes().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	data := body["data"].(map[string]any)
	result := data["result"].(map[string]any)
	if result["status"] != "needs_selection" {
		t.Fatalf("expected needs_selection, got %#v", result)
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
