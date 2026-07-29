package store

import (
	"context"
	"encoding/base64"
	"strings"
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

func TestMemoryStoreDeduplicatesDocumentChunksByServiceAndExternalID(t *testing.T) {
	store := NewMemoryStore()
	ctx := domain.GatewayContext{WorkspaceID: "workspace", UserID: "user"}
	chunk := domain.DocumentChunk{
		ID:         "chunk-1",
		ExternalID: "notion-page-1",
		Service:    domain.ServiceNotion,
		Title:      "Architecture Decision",
		Source:     "Notion",
		URL:        "https://notion.so/page-1",
		Content:    "Decision content",
		UpdatedAt:  time.Now().UTC(),
	}

	if err := store.SaveDocumentChunks(context.Background(), ctx, []domain.DocumentChunk{chunk, chunk}); err != nil {
		t.Fatal(err)
	}

	if len(store.documentChunks) != 1 {
		t.Fatalf("expected 1 deduplicated chunk, got %d", len(store.documentChunks))
	}
}

func TestSealUsesAESGCMWhenKeyIsConfigured(t *testing.T) {
	t.Setenv("TOKEN_SEALING_KEY", base64.StdEncoding.EncodeToString([]byte("12345678901234567890123456789012")))

	sealed := seal("secret-access-token")
	if !strings.HasPrefix(sealed, "sealed:v1:") {
		t.Fatalf("expected v1 sealed token, got %q", sealed)
	}
	if strings.Contains(sealed, "secret-access-token") {
		t.Fatal("sealed value contains plaintext token")
	}

	unsealed := unseal(sealed)
	if unsealed != "secret-access-token" {
		t.Fatalf("expected token round-trip, got %q", unsealed)
	}
}

func TestUnsealRejectsAESGCMTokenWithWrongKey(t *testing.T) {
	t.Setenv("TOKEN_SEALING_KEY", base64.StdEncoding.EncodeToString([]byte("12345678901234567890123456789012")))
	sealed := seal("secret-access-token")

	t.Setenv("TOKEN_SEALING_KEY", base64.StdEncoding.EncodeToString([]byte("abcdefghijklmnopqrstuvwxzy123456")))
	if unsealed := unseal(sealed); unsealed != "" {
		t.Fatalf("expected wrong key to fail closed, got %q", unsealed)
	}
}

func TestUnsealSupportsLegacyDevelopmentTokens(t *testing.T) {
	t.Setenv("TOKEN_SEALING_KEY", "")

	legacy := seal("local-token")
	if !strings.HasPrefix(legacy, "sealed:") || strings.HasPrefix(legacy, "sealed:v1:") {
		t.Fatalf("expected legacy sealed value, got %q", legacy)
	}
	if unsealed := unseal(legacy); unsealed != "local-token" {
		t.Fatalf("expected legacy token round-trip, got %q", unsealed)
	}
}
