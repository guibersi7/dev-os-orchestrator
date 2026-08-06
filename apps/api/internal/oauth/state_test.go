package oauth

import (
	"testing"
	"time"

	"github.com/developer-os/api/internal/domain"
)

func TestStateRoundTrip(t *testing.T) {
	state, err := SignState("secret", StatePayload{
		Service:     domain.ServiceGitHub,
		WorkspaceID: "workspace",
		UserID:      "user",
		RedirectURI: "http://localhost/callback",
	})
	if err != nil {
		t.Fatal(err)
	}

	payload, err := VerifyState("secret", state, time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	if payload.Service != domain.ServiceGitHub {
		t.Fatalf("expected github, got %s", payload.Service)
	}
	if payload.WorkspaceID != "workspace" {
		t.Fatalf("expected workspace, got %s", payload.WorkspaceID)
	}
}

func TestStateRejectsWrongSecret(t *testing.T) {
	state, err := SignState("secret", StatePayload{
		Service:     domain.ServiceGitHub,
		WorkspaceID: "workspace",
		UserID:      "user",
		RedirectURI: "http://localhost/callback",
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := VerifyState("other-secret", state, time.Minute); err == nil {
		t.Fatal("expected invalid state signature")
	}
}

func TestResponseScopesReturnsEmptySliceWhenProviderAndFallbackAreEmpty(t *testing.T) {
	scopes := responseScopes("", nil)
	if scopes == nil {
		t.Fatal("expected empty slice, got nil")
	}
	if len(scopes) != 0 {
		t.Fatalf("expected no scopes, got %v", scopes)
	}
}
