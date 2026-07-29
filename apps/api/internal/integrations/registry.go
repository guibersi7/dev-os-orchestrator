package integrations

import (
	"context"
	"fmt"
	"time"

	"github.com/developer-os/api/internal/domain"
)

type Connector interface {
	Info() domain.ConnectorInfo
	FetchRecentRecords(context.Context, domain.GatewayContext, *domain.ProviderToken) ([]domain.ExternalRecord, error)
	Normalize([]domain.ExternalRecord) []domain.WorkEvent
	Sync(context.Context, domain.GatewayContext, *domain.ProviderToken) (domain.SyncResult, error)
}

type Registry struct {
	connectors map[domain.Service]Connector
}

func NewRegistry() *Registry {
	connectors := []Connector{
		NewGitHubConnector(),
		NewSlackConnector(),
		NewLinearConnector(),
		NewJiraConnector(),
		NewTrelloConnector(),
		newMockConnector(domain.ServiceNotion, "Notion", "oauth", "polling_first", []string{"oauth", "initial_sync", "polling", "semantic_context"}, []string{"pages", "databases", "specs", "decisions", "comments"}),
		newMockConnector(domain.ServiceCalendar, "Calendar", "oauth", "polling_first", []string{"oauth", "initial_sync", "polling", "semantic_context"}, []string{"meetings", "attendees", "descriptions", "follow_ups"}),
	}

	registry := &Registry{connectors: map[domain.Service]Connector{}}
	for _, connector := range connectors {
		registry.connectors[connector.Info().ID] = connector
	}

	return registry
}

func (r *Registry) Get(service domain.Service) (Connector, bool) {
	connector, ok := r.connectors[service]
	return connector, ok
}

func (r *Registry) All() []Connector {
	connectors := make([]Connector, 0, len(r.connectors))
	for _, connector := range r.connectors {
		connectors = append(connectors, connector)
	}
	return connectors
}

type mockConnector struct {
	info domain.ConnectorInfo
}

func newMockConnector(service domain.Service, name string, authStrategy string, syncMode string, capabilities []string, objects []string) Connector {
	return &mockConnector{
		info: domain.ConnectorInfo{
			ID:           service,
			Name:         name,
			AuthStrategy: authStrategy,
			SyncMode:     syncMode,
			Capabilities: capabilities,
			Objects:      objects,
		},
	}
}

func (c *mockConnector) Info() domain.ConnectorInfo {
	return c.info
}

func (c *mockConnector) FetchRecentRecords(_ context.Context, _ domain.GatewayContext, _ *domain.ProviderToken) ([]domain.ExternalRecord, error) {
	now := time.Now().UTC()

	return []domain.ExternalRecord{
		{
			ID:          fmt.Sprintf("%s-primary", c.info.ID),
			ExternalURL: fmt.Sprintf("https://example.com/%s/primary", c.info.ID),
			Title:       primaryTitle(c.info.ID),
			Actor:       primaryActor(c.info.ID),
			UpdatedAt:   now,
			Payload: map[string]any{
				"service": c.info.ID,
				"status":  "active",
			},
		},
	}, nil
}

func (c *mockConnector) Normalize(records []domain.ExternalRecord) []domain.WorkEvent {
	events := make([]domain.WorkEvent, 0, len(records))
	for _, record := range records {
		events = append(events, domain.WorkEvent{
			ID:         fmt.Sprintf("evt-%s", record.ID),
			ExternalID: record.ID,
			Service:    c.info.ID,
			Type:       eventType(c.info.ID),
			Title:      record.Title,
			Source:     fmt.Sprintf("%s · normalized", c.info.Name),
			Actor:      record.Actor,
			Priority:   priority(c.info.ID),
			Summary:    summary(c.info.ID),
			OccurredAt: record.UpdatedAt,
			Raw:        record.Payload,
		})
	}

	return events
}

func (c *mockConnector) Sync(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	records, err := c.FetchRecentRecords(ctx, gatewayContext, token)
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	cursor := fmt.Sprintf("%s_cursor_%d", c.info.ID, len(records))

	return domain.SyncResult{
		Service:        c.info.ID,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     &cursor,
		Events:         events,
	}, nil
}

func primaryTitle(service domain.Service) string {
	switch service {
	case domain.ServiceGitHub:
		return "Auth session refresh PR needs attention"
	case domain.ServiceSlack:
		return "Release decision captured from #mobile-release"
	case domain.ServiceLinear:
		return "Backfill sync issue moved into current cycle"
	case domain.ServiceJira:
		return "Release epic has a blocked dependency"
	case domain.ServiceTrello:
		return "Launch checklist card moved to blocked"
	case domain.ServiceNotion:
		return "WorkEvent architecture decision updated"
	case domain.ServiceCalendar:
		return "Release sync ended with follow-ups"
	default:
		return "Work item updated"
	}
}

func primaryActor(service domain.Service) string {
	if service == domain.ServiceGitHub {
		return "GitHub Actions"
	}
	if service == domain.ServiceCalendar {
		return "Calendar"
	}
	return "Developer OS"
}

func eventType(service domain.Service) string {
	switch service {
	case domain.ServiceGitHub:
		return "check.failed"
	case domain.ServiceSlack:
		return "slack.decision"
	case domain.ServiceLinear:
		return "linear.issue.updated"
	case domain.ServiceJira:
		return "jira.ticket.blocked"
	case domain.ServiceTrello:
		return "trello.card.moved"
	case domain.ServiceNotion:
		return "notion.decision.logged"
	case domain.ServiceCalendar:
		return "calendar.meeting.ended"
	default:
		return "work.updated"
	}
}

func priority(service domain.Service) string {
	switch service {
	case domain.ServiceGitHub, domain.ServiceJira:
		return "high"
	default:
		return "medium"
	}
}

func summary(service domain.Service) string {
	switch service {
	case domain.ServiceGitHub:
		return "Code activity was normalized into the shared gateway event stream."
	case domain.ServiceSlack:
		return "A conversation was condensed into durable decision context."
	case domain.ServiceLinear, domain.ServiceJira, domain.ServiceTrello:
		return "Planning activity was normalized so focus recommendations can cross-check delivery state."
	case domain.ServiceNotion:
		return "Documentation context was indexed as a product-level work event."
	case domain.ServiceCalendar:
		return "Meeting follow-ups were converted into work context for the dashboard."
	default:
		return "External activity was normalized into a work event."
	}
}
