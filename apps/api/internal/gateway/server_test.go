package gateway

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
