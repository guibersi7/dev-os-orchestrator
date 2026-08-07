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

	for _, scope := range []string{"channels:read", "channels:history", "groups:read", "groups:history", "users:read"} {
		if !slices.Contains(provider.Scopes, scope) {
			t.Fatalf("expected Slack scope %q in %#v", scope, provider.Scopes)
		}
	}
}
