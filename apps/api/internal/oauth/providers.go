package oauth

import (
	"os"
	"strings"

	"github.com/developer-os/api/internal/domain"
)

type Provider struct {
	Service      domain.Service
	Name         string
	ClientID     string
	ClientSecret string
	AuthURL      string
	TokenURL     string
	Scopes       []string
}

func ProviderFor(service domain.Service) (Provider, bool) {
	providers := map[domain.Service]Provider{
		domain.ServiceGitHub: {
			Service:      domain.ServiceGitHub,
			Name:         "GitHub",
			ClientID:     os.Getenv("GITHUB_CLIENT_ID"),
			ClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
			AuthURL:      "https://github.com/login/oauth/authorize",
			TokenURL:     "https://github.com/login/oauth/access_token",
			Scopes:       splitScopes(os.Getenv("GITHUB_OAUTH_SCOPES"), []string{"repo", "read:user", "read:org"}),
		},
		domain.ServiceSlack: {
			Service:      domain.ServiceSlack,
			Name:         "Slack",
			ClientID:     os.Getenv("SLACK_CLIENT_ID"),
			ClientSecret: os.Getenv("SLACK_CLIENT_SECRET"),
			AuthURL:      "https://slack.com/oauth/v2/authorize",
			TokenURL:     "https://slack.com/api/oauth.v2.access",
			Scopes:       splitScopes(os.Getenv("SLACK_OAUTH_SCOPES"), []string{"channels:history", "channels:read", "groups:history", "users:read"}),
		},
		domain.ServiceLinear: {
			Service:      domain.ServiceLinear,
			Name:         "Linear",
			ClientID:     os.Getenv("LINEAR_CLIENT_ID"),
			ClientSecret: os.Getenv("LINEAR_CLIENT_SECRET"),
			AuthURL:      "https://linear.app/oauth/authorize",
			TokenURL:     "https://api.linear.app/oauth/token",
			Scopes:       splitScopes(os.Getenv("LINEAR_OAUTH_SCOPES"), []string{"read", "write"}),
		},
		domain.ServiceJira: {
			Service:      domain.ServiceJira,
			Name:         "Jira",
			ClientID:     os.Getenv("JIRA_CLIENT_ID"),
			ClientSecret: os.Getenv("JIRA_CLIENT_SECRET"),
			AuthURL:      "https://auth.atlassian.com/authorize",
			TokenURL:     "https://auth.atlassian.com/oauth/token",
			Scopes:       splitScopes(os.Getenv("JIRA_OAUTH_SCOPES"), []string{"read:jira-work", "offline_access"}),
		},
		domain.ServiceTrello: {
			Service:      domain.ServiceTrello,
			Name:         "Trello",
			ClientID:     os.Getenv("TRELLO_CLIENT_ID"),
			ClientSecret: os.Getenv("TRELLO_CLIENT_SECRET"),
			AuthURL:      "https://trello.com/1/authorize",
			TokenURL:     "https://trello.com/1/OAuthGetAccessToken",
			Scopes:       splitScopes(os.Getenv("TRELLO_OAUTH_SCOPES"), []string{"read", "write"}),
		},
		domain.ServiceNotion: {
			Service:      domain.ServiceNotion,
			Name:         "Notion",
			ClientID:     os.Getenv("NOTION_CLIENT_ID"),
			ClientSecret: os.Getenv("NOTION_CLIENT_SECRET"),
			AuthURL:      "https://api.notion.com/v1/oauth/authorize",
			TokenURL:     "https://api.notion.com/v1/oauth/token",
			Scopes:       splitScopes(os.Getenv("NOTION_OAUTH_SCOPES"), []string{}),
		},
		domain.ServiceCalendar: {
			Service:      domain.ServiceCalendar,
			Name:         "Calendar",
			ClientID:     os.Getenv("GOOGLE_CALENDAR_CLIENT_ID"),
			ClientSecret: os.Getenv("GOOGLE_CALENDAR_CLIENT_SECRET"),
			AuthURL:      "https://accounts.google.com/o/oauth2/v2/auth",
			TokenURL:     "https://oauth2.googleapis.com/token",
			Scopes:       splitScopes(os.Getenv("GOOGLE_CALENDAR_OAUTH_SCOPES"), []string{"https://www.googleapis.com/auth/calendar.readonly", "offline_access"}),
		},
	}

	provider, ok := providers[service]
	return provider, ok
}

func (p Provider) Configured() bool {
	return p.ClientID != "" && p.ClientSecret != "" && p.AuthURL != "" && p.TokenURL != ""
}

func splitScopes(value string, fallback []string) []string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}

	parts := strings.Split(value, ",")
	scopes := make([]string, 0, len(parts))
	for _, part := range parts {
		scope := strings.TrimSpace(part)
		if scope != "" {
			scopes = append(scopes, scope)
		}
	}

	return scopes
}
