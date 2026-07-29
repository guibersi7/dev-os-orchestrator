package intelligence

import (
	"testing"
	"time"

	"github.com/developer-os/api/internal/domain"
)

func TestBuildDashboardComputesTodayFocusAndWeeklySummary(t *testing.T) {
	now := time.Date(2026, 7, 29, 12, 0, 0, 0, time.UTC)
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	events := []domain.WorkEvent{
		event("review", domain.ServiceGitHub, "review.requested", "Review auth pull request", "medium", now.Add(-48*time.Hour)),
		event("check", domain.ServiceGitHub, "check.failed", "Auth checks failed", "high", now.Add(-2*time.Hour)),
		event("blocker", domain.ServiceLinear, "linear.issue.blocked", "Mobile release blocked", "high", now.Add(-3*time.Hour)),
		event("slack-blocker", domain.ServiceSlack, "slack.blocker", "Release thread reports blocker", "high", now.Add(-90*time.Minute)),
		event("merged", domain.ServiceGitHub, "pull_request.merged", "Merge API gateway", "medium", now.Add(-24*time.Hour)),
		event("decision", domain.ServiceNotion, "notion.decision.logged", "Keep WorkEvent boundary", "medium", now.Add(-4*time.Hour)),
	}

	payload := BuildDashboard(ctx, events, []domain.SourceHealth{
		{Service: domain.ServiceGitHub, Status: "connected"},
		{Service: domain.ServiceLinear, Status: "connected"},
	}, now)

	if payload.Metrics.ConnectedSources != 2 {
		t.Fatalf("expected 2 connected sources, got %d", payload.Metrics.ConnectedSources)
	}
	if payload.Metrics.WaitingReview != 1 {
		t.Fatalf("expected 1 waiting review, got %d", payload.Metrics.WaitingReview)
	}
	if len(payload.Today.FailedChecks) != 1 {
		t.Fatalf("expected failed check in today model, got %d", len(payload.Today.FailedChecks))
	}
	if len(payload.Focus) == 0 {
		t.Fatal("expected focus recommendations")
	}
	if payload.Focus[0].Action != "Fix failed checks" {
		t.Fatalf("expected failed checks to be prioritized first, got %q", payload.Focus[0].Action)
	}
	if len(payload.Focus[0].Sources) < 2 {
		t.Fatalf("expected focus to include correlated sources, got %#v", payload.Focus[0].Sources)
	}
	if len(payload.WeeklySummary.MergedPRs) != 1 {
		t.Fatalf("expected merged PR in weekly summary, got %d", len(payload.WeeklySummary.MergedPRs))
	}
	if payload.WeeklySummary.SummaryStrategy != "rules:v1" {
		t.Fatalf("expected rules summary strategy, got %q", payload.WeeklySummary.SummaryStrategy)
	}
}

func TestBuildDashboardDoesNotInventDemoEvents(t *testing.T) {
	now := time.Date(2026, 7, 29, 12, 0, 0, 0, time.UTC)
	payload := BuildDashboard(domain.GatewayContext{WorkspaceID: "workspace"}, nil, nil, now)

	if len(payload.Events) != 0 {
		t.Fatalf("expected no events, got %d", len(payload.Events))
	}
	if payload.Metrics.ConnectedSources != 0 {
		t.Fatalf("expected no connected sources, got %d", payload.Metrics.ConnectedSources)
	}
	if len(payload.SourceHealth) != 7 {
		t.Fatalf("expected default health for seven services, got %d", len(payload.SourceHealth))
	}
}

func event(id string, service domain.Service, eventType string, title string, priority string, occurredAt time.Time) domain.WorkEvent {
	return domain.WorkEvent{
		ID:         id,
		ExternalID: id,
		Service:    service,
		Type:       eventType,
		Title:      title,
		Source:     string(service) + " source",
		Actor:      "tester",
		Priority:   priority,
		Summary:    title + " summary",
		OccurredAt: occurredAt,
	}
}
