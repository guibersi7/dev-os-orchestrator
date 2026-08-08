package oauth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/developer-os/api/internal/domain"
)

func TestJiraAuthorizationURLIncludesAtlassian3LOParameters(t *testing.T) {
	provider := Provider{
		Service:  domain.ServiceJira,
		ClientID: "jira-client",
		AuthURL:  "https://auth.atlassian.com/authorize",
		Scopes:   []string{"read:jira-work", "offline_access"},
	}

	authorizationURL := AuthorizationURL(provider, "https://app.test/api/integrations/jira/callback", "state")
	parsed, err := url.Parse(authorizationURL)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()

	if query.Get("audience") != "api.atlassian.com" {
		t.Fatalf("expected Atlassian audience, got %q", query.Get("audience"))
	}
	if query.Get("prompt") != "consent" {
		t.Fatalf("expected consent prompt, got %q", query.Get("prompt"))
	}
	if query.Get("scope") != "read:jira-work offline_access" {
		t.Fatalf("unexpected scope %q", query.Get("scope"))
	}
}

func TestJiraExchangeCodeUsesJSONPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("content-type") != "application/json" {
			t.Fatalf("expected json content type, got %q", r.Header.Get("content-type"))
		}

		var payload map[string]string
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["grant_type"] != "authorization_code" || payload["client_id"] != "jira-client" {
			t.Fatalf("unexpected token payload %#v", payload)
		}

		w.Header().Set("content-type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "access-token",
			"refresh_token": "refresh-token",
			"expires_in":    3600,
			"scope":         "read:jira-work offline_access",
		}); err != nil {
			t.Fatal(err)
		}
	}))
	defer server.Close()

	token, err := ExchangeCode(context.Background(), server.Client(), Provider{
		Service:      domain.ServiceJira,
		ClientID:     "jira-client",
		ClientSecret: "jira-secret",
		TokenURL:     server.URL,
	}, "code", "https://app.test/api/integrations/jira/callback")
	if err != nil {
		t.Fatal(err)
	}

	if token.AccessToken != "access-token" || token.RefreshToken != "refresh-token" {
		t.Fatalf("unexpected token response %#v", token)
	}
}
