package intelligence

import (
	"sort"
	"strings"
	"time"

	"github.com/developer-os/api/internal/domain"
)

const summaryStrategy = "rules:v1"

func BuildDashboard(ctx domain.GatewayContext, events []domain.WorkEvent, sourceHealth []domain.SourceHealth, now time.Time) domain.DashboardPayload {
	if now.IsZero() {
		now = time.Now().UTC()
	}

	events = sortedEvents(events)
	sourceHealth = normalizeSourceHealth(sourceHealth)
	today := buildToday(events, now)
	weeklySummary := buildWeeklySummary(events, now)
	focus := buildFocus(events, today, now)

	return domain.DashboardPayload{
		WorkspaceID: ctx.WorkspaceID,
		GeneratedAt: now,
		Metrics: domain.DashboardMetrics{
			ConnectedSources:  countConnectedSources(sourceHealth),
			WaitingReview:     len(today.PRsWaitingForReview),
			CrossToolBlockers: countBlockers(events),
			DecisionsFound:    countDecisions(events, now),
		},
		Today:         today,
		Focus:         focus,
		WeeklySummary: weeklySummary,
		Events:        events,
		SourceHealth:  sourceHealth,
	}
}

func sortedEvents(events []domain.WorkEvent) []domain.WorkEvent {
	copied := append([]domain.WorkEvent(nil), events...)
	sort.SliceStable(copied, func(i, j int) bool {
		return copied[i].OccurredAt.After(copied[j].OccurredAt)
	})
	return copied
}

func buildToday(events []domain.WorkEvent, now time.Time) domain.DashboardToday {
	since := now.Add(-24 * time.Hour)
	today := domain.DashboardToday{}

	for _, event := range events {
		if isReviewWaiting(event) {
			today.PRsWaitingForReview = append(today.PRsWaitingForReview, event)
		}
		if isBlocked(event) && isPullRequestEvent(event) {
			today.BlockedPRs = append(today.BlockedPRs, event)
		}
		if isFailedCheck(event) {
			today.FailedChecks = append(today.FailedChecks, event)
		}
		if isAssignedIssue(event) {
			today.AssignedIssues = append(today.AssignedIssues, event)
		}
		if !event.OccurredAt.Before(since) && isImportant(event, now) {
			today.RecentImportantChanges = append(today.RecentImportantChanges, event)
		}
	}

	today.PRsWaitingForReview = limitEvents(today.PRsWaitingForReview, 8)
	today.BlockedPRs = limitEvents(today.BlockedPRs, 8)
	today.FailedChecks = limitEvents(today.FailedChecks, 8)
	today.AssignedIssues = limitEvents(today.AssignedIssues, 8)
	today.RecentImportantChanges = limitEvents(today.RecentImportantChanges, 12)
	return today
}

func buildFocus(events []domain.WorkEvent, today domain.DashboardToday, now time.Time) []domain.FocusItem {
	focus := []domain.FocusItem{}
	seen := map[string]bool{}

	for _, event := range today.FailedChecks {
		focus = appendFocus(focus, seen, event, events, "Fix failed checks", "Checks are failing and may block merge or release validation.", now)
	}
	for _, event := range today.BlockedPRs {
		focus = appendFocus(focus, seen, event, events, "Unblock pull request", "This pull request is marked as blocked across the latest synced work events.", now)
	}
	for _, event := range today.PRsWaitingForReview {
		if now.Sub(event.OccurredAt) >= 24*time.Hour {
			focus = appendFocus(focus, seen, event, events, "Review stale pull request", "This review request has been waiting for more than 24 hours.", now)
		}
	}
	for _, event := range events {
		if isReleaseRisk(event) {
			focus = appendFocus(focus, seen, event, events, "Resolve release risk", "A synced source identified this event as a release risk.", now)
		}
	}
	for _, event := range events {
		if isRecentDecision(event, now) {
			focus = appendFocus(focus, seen, event, events, "Confirm decision impact", "A recent decision may affect active engineering work.", now)
		}
	}

	sort.SliceStable(focus, func(i, j int) bool {
		if focus[i].Priority != focus[j].Priority {
			return priorityRank(focus[i].Priority) > priorityRank(focus[j].Priority)
		}
		return focus[i].CreatedAt.After(focus[j].CreatedAt)
	})

	if len(focus) > 5 {
		return focus[:5]
	}
	return focus
}

func appendFocus(items []domain.FocusItem, seen map[string]bool, event domain.WorkEvent, events []domain.WorkEvent, action string, reason string, now time.Time) []domain.FocusItem {
	if seen[event.ID] {
		return items
	}
	seen[event.ID] = true

	priority := event.Priority
	if priority == "" {
		priority = "medium"
	}

	sources := relatedSources(event, events, now)
	if len(sources) > 1 {
		reason += " Related sources: " + strings.Join(sources, ", ") + "."
	}

	return append(items, domain.FocusItem{
		ID:        "focus_" + event.ID,
		Title:     event.Title,
		Reason:    reason + " Source: " + event.Source + ". Detail: " + event.Summary,
		Action:    action,
		Priority:  priority,
		Service:   event.Service,
		Sources:   sources,
		EventIDs:  []string{event.ID},
		CreatedAt: now,
	})
}

func buildWeeklySummary(events []domain.WorkEvent, now time.Time) domain.WeeklySummary {
	since := now.AddDate(0, 0, -7)
	summary := domain.WeeklySummary{SummaryStrategy: summaryStrategy}

	for _, event := range events {
		if event.OccurredAt.Before(since) {
			continue
		}

		switch {
		case strings.Contains(event.Type, "pull_request.merged"):
			summary.MergedPRs = append(summary.MergedPRs, event)
			summary.CompletedWork = append(summary.CompletedWork, event.Title)
		case strings.Contains(event.Type, "issue.closed") || strings.Contains(event.Type, "completed"):
			summary.ClosedIssues = append(summary.ClosedIssues, event)
			summary.CompletedWork = append(summary.CompletedWork, event.Title)
		case isBlocked(event):
			summary.Blockers = append(summary.Blockers, event)
		case isActiveWork(event):
			summary.ActiveWork = append(summary.ActiveWork, event)
		}

		if event.Priority == "high" || isReleaseRisk(event) {
			summary.Risks = append(summary.Risks, event.Summary)
		}
	}

	summary.MergedPRs = limitEvents(summary.MergedPRs, 10)
	summary.ClosedIssues = limitEvents(summary.ClosedIssues, 10)
	summary.ActiveWork = limitEvents(summary.ActiveWork, 10)
	summary.Blockers = limitEvents(summary.Blockers, 10)
	summary.CompletedWork = limitStrings(summary.CompletedWork, 10)
	summary.Risks = limitStrings(summary.Risks, 5)
	return summary
}

func normalizeSourceHealth(sourceHealth []domain.SourceHealth) []domain.SourceHealth {
	byService := map[domain.Service]domain.SourceHealth{}
	for _, service := range allServices() {
		byService[service] = domain.SourceHealth{Service: service, Status: "available"}
	}
	for _, health := range sourceHealth {
		if health.Status == "" {
			health.Status = "available"
		}
		byService[health.Service] = health
	}

	normalized := make([]domain.SourceHealth, 0, len(byService))
	for _, service := range allServices() {
		normalized = append(normalized, byService[service])
	}
	return normalized
}

func allServices() []domain.Service {
	return []domain.Service{
		domain.ServiceGitHub,
		domain.ServiceSlack,
		domain.ServiceLinear,
		domain.ServiceJira,
		domain.ServiceTrello,
		domain.ServiceNotion,
		domain.ServiceCalendar,
	}
}

func countConnectedSources(sourceHealth []domain.SourceHealth) int {
	count := 0
	for _, health := range sourceHealth {
		if health.Status == "connected" || health.Status == "syncing" {
			count++
		}
	}
	return count
}

func countDecisions(events []domain.WorkEvent, now time.Time) int {
	since := now.AddDate(0, 0, -7)
	count := 0
	for _, event := range events {
		if strings.Contains(event.Type, "decision") && !event.OccurredAt.Before(since) {
			count++
		}
	}
	return count
}

func countBlockers(events []domain.WorkEvent) int {
	count := 0
	for _, event := range events {
		if isBlocked(event) {
			count++
		}
	}
	return count
}

func relatedSources(seed domain.WorkEvent, events []domain.WorkEvent, now time.Time) []string {
	sources := []string{seed.Source}
	seen := map[string]bool{seed.Source: true}
	for _, event := range events {
		if event.ID == seed.ID || event.Service == seed.Service || seen[event.Source] {
			continue
		}
		if isRelated(seed, event, now) {
			sources = append(sources, event.Source)
			seen[event.Source] = true
		}
		if len(sources) == 3 {
			return sources
		}
	}
	return sources
}

func isRelated(left domain.WorkEvent, right domain.WorkEvent, now time.Time) bool {
	return (isBlocked(left) && isBlocked(right)) ||
		(isReleaseRisk(left) && isReleaseRisk(right)) ||
		(isRecentDecision(left, now) && isRecentDecision(right, now)) ||
		(left.Priority == "high" && right.Priority == "high")
}

func isImportant(event domain.WorkEvent, now time.Time) bool {
	return event.Priority == "high" || isFailedCheck(event) || isBlocked(event) || isReviewWaiting(event) || isRecentDecision(event, now)
}

func isPullRequestEvent(event domain.WorkEvent) bool {
	return strings.Contains(event.Type, "pull_request") || strings.Contains(strings.ToLower(event.Title), "pull request")
}

func isReviewWaiting(event domain.WorkEvent) bool {
	return strings.Contains(event.Type, "review.requested") || strings.Contains(event.Type, "pull_request.opened")
}

func isFailedCheck(event domain.WorkEvent) bool {
	return strings.Contains(event.Type, "check.failed") || strings.Contains(strings.ToLower(event.Summary), "failed check")
}

func isBlocked(event domain.WorkEvent) bool {
	searchable := strings.ToLower(event.Type + " " + event.Title + " " + event.Summary)
	return strings.Contains(searchable, "blocked") || strings.Contains(searchable, "blocker")
}

func isAssignedIssue(event domain.WorkEvent) bool {
	return strings.Contains(event.Type, "issue.assigned") || strings.Contains(event.Type, "ticket.assigned") || strings.Contains(event.Type, "card.assigned")
}

func isReleaseRisk(event domain.WorkEvent) bool {
	searchable := strings.ToLower(event.Type + " " + event.Title + " " + event.Summary)
	return strings.Contains(searchable, "release.risk") || (strings.Contains(searchable, "release") && strings.Contains(searchable, "risk"))
}

func isRecentDecision(event domain.WorkEvent, now time.Time) bool {
	return strings.Contains(event.Type, "decision") && !event.OccurredAt.Before(now.AddDate(0, 0, -7))
}

func isActiveWork(event domain.WorkEvent) bool {
	return strings.Contains(event.Type, "opened") || strings.Contains(event.Type, "updated") || strings.Contains(event.Type, "moved")
}

func priorityRank(priority string) int {
	switch priority {
	case "high":
		return 3
	case "medium":
		return 2
	default:
		return 1
	}
}

func limitEvents(events []domain.WorkEvent, limit int) []domain.WorkEvent {
	if len(events) <= limit {
		return events
	}
	return events[:limit]
}

func limitStrings(values []string, limit int) []string {
	if len(values) <= limit {
		return values
	}
	return values[:limit]
}
