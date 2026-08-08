package oauth

import (
	"slices"
	"testing"

	"github.com/developer-os/api/internal/domain"
)

func TestSlackProviderDefaultScopesIncludePrivateChannelRead(t *testing.T) {
	t.Setenv("SLACK_OAUTH_SCOPES", "")

	provider, ok := ProviderFor(domain.ServiceSlack)
	if !ok {
		t.Fatal("expected Slack provider")
	}

	for _, scope := range []string{"channels:read", "channels:history", "groups:read", "groups:history", "im:read", "im:history", "mpim:read", "mpim:history", "users:read"} {
		if !slices.Contains(provider.Scopes, scope) {
			t.Fatalf("expected Slack scope %q in %#v", scope, provider.Scopes)
		}
	}
}

func TestLinearProviderDefaultScopesAreReadOnly(t *testing.T) {
	t.Setenv("LINEAR_OAUTH_SCOPES", "")

	provider, ok := ProviderFor(domain.ServiceLinear)
	if !ok {
		t.Fatal("expected Linear provider")
	}

	if !slices.Contains(provider.Scopes, "read") {
		t.Fatalf("expected Linear read scope in %#v", provider.Scopes)
	}
	if slices.Contains(provider.Scopes, "write") {
		t.Fatalf("did not expect Linear write scope in %#v", provider.Scopes)
	}
}

func TestJiraProviderDefaultScopesAllowReadAndRefresh(t *testing.T) {
	t.Setenv("JIRA_OAUTH_SCOPES", "")

	provider, ok := ProviderFor(domain.ServiceJira)
	if !ok {
		t.Fatal("expected Jira provider")
	}

	for _, scope := range []string{"read:jira-work", "offline_access"} {
		if !slices.Contains(provider.Scopes, scope) {
			t.Fatalf("expected Jira scope %q in %#v", scope, provider.Scopes)
		}
	}
	if slices.Contains(provider.Scopes, "write:jira-work") {
		t.Fatalf("did not expect Jira write scope in %#v", provider.Scopes)
	}
}
