package store

import (
	"context"
	"testing"
	"time"

	"github.com/developer-os/api/internal/domain"
)

func TestMemoryStoreDeduplicatesWorkEventsByServiceAndExternalID(t *testing.T) {
	store := NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	event := domain.WorkEvent{
		ID:         "evt-1",
		ExternalID: "provider-1",
		Service:    domain.ServiceGitHub,
		Type:       "check.failed",
		Title:      "Check failed",
		Source:     "GitHub",
		Actor:      "GitHub Actions",
		Priority:   "high",
		Summary:    "Failed check",
		OccurredAt: time.Now().UTC(),
	}

	if err := store.SaveWorkEvents(context.Background(), ctx, []domain.WorkEvent{event, event}); err != nil {
		t.Fatal(err)
	}

	dashboard, err := store.GetDashboard(context.Background(), ctx)
	if err != nil {
		t.Fatal(err)
	}

	if len(dashboard.Events) != 1 {
		t.Fatalf("expected 1 deduplicated event, got %d", len(dashboard.Events))
	}
}

func TestMemoryStorePersistsSyncResult(t *testing.T) {
	store := NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	cursor := "cursor-1"

	if err := store.SaveSyncResult(context.Background(), ctx, domain.SyncResult{
		Service:        domain.ServiceSlack,
		Status:         "connected",
		RecordsScanned: 10,
		EventsCreated:  3,
		NextCursor:     &cursor,
	}); err != nil {
		t.Fatal(err)
	}

	result := store.syncs[domain.ServiceSlack]
	if result.NextCursor == nil || *result.NextCursor != cursor {
		t.Fatalf("expected cursor %q, got %v", cursor, result.NextCursor)
	}
}
