package store

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/developer-os/api/internal/domain"
	"github.com/developer-os/api/internal/intelligence"
)

var ErrTokenNotFound = errors.New("integration token not found")

type Store interface {
	SaveWorkEvents(context.Context, domain.GatewayContext, []domain.WorkEvent) error
	SaveDocumentChunks(context.Context, domain.GatewayContext, []domain.DocumentChunk) error
	SaveSyncResult(context.Context, domain.GatewayContext, domain.SyncResult) error
	SaveSyncFailure(context.Context, domain.GatewayContext, domain.Service, error) error
	GetDashboard(context.Context, domain.GatewayContext) (domain.DashboardPayload, error)
	SaveDashboardSnapshot(context.Context, domain.GatewayContext, domain.DashboardPayload) error
	GetUserConfig(context.Context, domain.GatewayContext) (domain.UserConfig, error)
	UpsertUserConfig(context.Context, domain.GatewayContext, domain.UserConfig) error
	UpsertToken(context.Context, domain.GatewayContext, domain.TokenUpsertRequest) error
	GetToken(context.Context, domain.GatewayContext, domain.Service) (domain.ProviderToken, error)
	RefreshTokenStatus(context.Context, domain.GatewayContext, domain.Service) (map[string]any, error)
	ListConnectionStatuses(context.Context, domain.GatewayContext) ([]domain.ConnectionStatus, error)
	DisconnectConnection(context.Context, domain.GatewayContext, domain.Service) (domain.ConnectionStatus, error)
}

func NewFromEnv() Store {
	url := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if url == "" || serviceKey == "" {
		return NewMemoryStore()
	}

	return &SupabaseStore{
		url:        strings.TrimRight(url, "/"),
		serviceKey: serviceKey,
		client:     &http.Client{Timeout: 10 * time.Second},
		fallback:   NewMemoryStore(),
	}
}

type MemoryStore struct {
	events         []domain.WorkEvent
	eventKeys      map[string]bool
	documentChunks []domain.DocumentChunk
	chunkKeys      map[string]bool
	configs        map[string]domain.UserConfig
	tokens         map[string]domain.TokenUpsertRequest
	syncs          map[domain.Service]domain.SyncResult
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		events:         []domain.WorkEvent{},
		eventKeys:      map[string]bool{},
		documentChunks: []domain.DocumentChunk{},
		chunkKeys:      map[string]bool{},
		configs:        map[string]domain.UserConfig{},
		tokens:         map[string]domain.TokenUpsertRequest{},
		syncs:          map[domain.Service]domain.SyncResult{},
	}
}

func (s *MemoryStore) SaveWorkEvents(_ context.Context, _ domain.GatewayContext, events []domain.WorkEvent) error {
	for _, event := range events {
		key := eventKey(event)
		if s.eventKeys[key] {
			continue
		}
		s.eventKeys[key] = true
		s.events = append(s.events, event)
	}
	return nil
}

func (s *MemoryStore) SaveDocumentChunks(_ context.Context, _ domain.GatewayContext, chunks []domain.DocumentChunk) error {
	for _, chunk := range chunks {
		key := chunkKey(chunk)
		if s.chunkKeys[key] {
			continue
		}
		s.chunkKeys[key] = true
		s.documentChunks = append(s.documentChunks, chunk)
	}
	return nil
}

func (s *MemoryStore) SaveSyncResult(_ context.Context, _ domain.GatewayContext, result domain.SyncResult) error {
	s.syncs[result.Service] = result
	return nil
}

func (s *MemoryStore) SaveSyncFailure(_ context.Context, _ domain.GatewayContext, service domain.Service, _ error) error {
	s.syncs[service] = domain.SyncResult{
		Service: service,
		Status:  "error",
	}
	return nil
}

func (s *MemoryStore) GetDashboard(_ context.Context, ctx domain.GatewayContext) (domain.DashboardPayload, error) {
	return intelligence.BuildDashboard(ctx, s.events, s.memorySourceHealth(), time.Now().UTC()), nil
}

func (s *MemoryStore) SaveDashboardSnapshot(_ context.Context, _ domain.GatewayContext, _ domain.DashboardPayload) error {
	return nil
}

func (s *MemoryStore) memorySourceHealth() []domain.SourceHealth {
	health := make([]domain.SourceHealth, 0, len(s.syncs))
	for service, sync := range s.syncs {
		status := sync.Status
		if status == "" {
			status = "available"
		}
		health = append(health, domain.SourceHealth{
			Service: service,
			Status:  status,
		})
	}
	return health
}

func (s *MemoryStore) GetUserConfig(_ context.Context, ctx domain.GatewayContext) (domain.UserConfig, error) {
	key := ctx.WorkspaceID + ":" + ctx.UserID
	if config, ok := s.configs[key]; ok {
		return config, nil
	}

	return domain.UserConfig{
		WorkspaceID: ctx.WorkspaceID,
		UserID:      ctx.UserID,
		DashboardPreferences: domain.DashboardPreferences{
			DefaultView: "focus",
			VisibleSources: []domain.Service{
				domain.ServiceGitHub,
				domain.ServiceSlack,
				domain.ServiceLinear,
				domain.ServiceJira,
				domain.ServiceTrello,
				domain.ServiceNotion,
				domain.ServiceCalendar,
			},
		},
		NotificationPreferences: domain.NotificationPreferences{
			Blockers:     true,
			FailedChecks: true,
			Decisions:    true,
		},
	}, nil
}

func (s *MemoryStore) UpsertUserConfig(_ context.Context, ctx domain.GatewayContext, config domain.UserConfig) error {
	s.configs[ctx.WorkspaceID+":"+ctx.UserID] = config
	return nil
}

func (s *MemoryStore) UpsertToken(_ context.Context, ctx domain.GatewayContext, token domain.TokenUpsertRequest) error {
	if token.ProviderAccountID == "" {
		token.ProviderAccountID = "default"
	}
	s.tokens[ctx.WorkspaceID+":"+string(token.Service)+":"+token.ProviderAccountID] = token
	return nil
}

func (s *MemoryStore) GetToken(_ context.Context, ctx domain.GatewayContext, service domain.Service) (domain.ProviderToken, error) {
	for key, token := range s.tokens {
		if strings.HasPrefix(key, ctx.WorkspaceID+":"+string(service)+":") {
			return domain.ProviderToken{
				Service:           token.Service,
				ProviderAccountID: token.ProviderAccountID,
				AccessToken:       token.AccessToken,
				RefreshToken:      token.RefreshToken,
				ExpiresAt:         token.ExpiresAt,
				Scopes:            token.Scopes,
			}, nil
		}
	}

	return domain.ProviderToken{}, ErrTokenNotFound
}

func (s *MemoryStore) RefreshTokenStatus(_ context.Context, ctx domain.GatewayContext, service domain.Service) (map[string]any, error) {
	for key, token := range s.tokens {
		if strings.HasPrefix(key, ctx.WorkspaceID+":"+string(service)+":") && token.RefreshToken != "" {
			return map[string]any{"service": service, "status": "refresh_required"}, nil
		}
	}

	return map[string]any{"service": service, "status": "missing_refresh_token"}, nil
}

func (s *MemoryStore) ListConnectionStatuses(_ context.Context, ctx domain.GatewayContext) ([]domain.ConnectionStatus, error) {
	statuses := make([]domain.ConnectionStatus, 0, len(allServices()))
	for _, service := range allServices() {
		statuses = append(statuses, s.memoryConnectionStatus(ctx, service))
	}
	return statuses, nil
}

func (s *MemoryStore) DisconnectConnection(_ context.Context, ctx domain.GatewayContext, service domain.Service) (domain.ConnectionStatus, error) {
	for key := range s.tokens {
		if strings.HasPrefix(key, ctx.WorkspaceID+":"+string(service)+":") {
			delete(s.tokens, key)
		}
	}
	s.syncs[service] = domain.SyncResult{Service: service, Status: "available"}
	return s.memoryConnectionStatus(ctx, service), nil
}

func (s *MemoryStore) memoryConnectionStatus(ctx domain.GatewayContext, service domain.Service) domain.ConnectionStatus {
	status := "available"
	if sync, ok := s.syncs[service]; ok && sync.Status != "" {
		status = sync.Status
	}

	connection := domain.ConnectionStatus{
		Service: service,
		Status:  status,
		Scopes:  []string{},
	}

	for key, token := range s.tokens {
		if !strings.HasPrefix(key, ctx.WorkspaceID+":"+string(service)+":") {
			continue
		}
		connection.HasToken = true
		connection.HasRefreshToken = strings.TrimSpace(token.RefreshToken) != ""
		connection.ProviderAccountID = token.ProviderAccountID
		connection.Scopes = token.Scopes
		if token.ExpiresAt != "" {
			if expiresAt, err := time.Parse(time.RFC3339, token.ExpiresAt); err == nil {
				connection.ExpiresAt = &expiresAt
				if expiresAt.Before(time.Now().UTC()) {
					connection.Status = "expired"
				}
			}
		}
		if connection.Status == "available" {
			connection.Status = "connected"
		}
		break
	}

	return connection
}

type SupabaseStore struct {
	url        string
	serviceKey string
	client     *http.Client
	fallback   Store
}

func (s *SupabaseStore) SaveWorkEvents(ctx context.Context, gatewayCtx domain.GatewayContext, events []domain.WorkEvent) error {
	if len(events) == 0 {
		return nil
	}

	if err := s.ensureWorkspace(ctx, gatewayCtx); err != nil {
		return err
	}

	rows := make([]map[string]any, 0, len(events))
	for _, event := range events {
		if event.ExternalID == "" {
			event.ExternalID = event.ID
		}
		rows = append(rows, map[string]any{
			"workspace_id": gatewayCtx.WorkspaceID,
			"external_id":  event.ExternalID,
			"service":      event.Service,
			"type":         event.Type,
			"title":        event.Title,
			"source":       event.Source,
			"actor":        event.Actor,
			"priority":     event.Priority,
			"summary":      event.Summary,
			"occurred_at":  event.OccurredAt,
			"raw":          event.Raw,
		})
	}

	return s.rest(ctx, http.MethodPost, "work_events?on_conflict=workspace_id,service,external_id", rows, nil)
}

func (s *SupabaseStore) SaveDocumentChunks(ctx context.Context, gatewayCtx domain.GatewayContext, chunks []domain.DocumentChunk) error {
	if len(chunks) == 0 {
		return nil
	}
	if err := s.ensureWorkspace(ctx, gatewayCtx); err != nil {
		return err
	}

	rows := make([]map[string]any, 0, len(chunks))
	for _, chunk := range chunks {
		rows = append(rows, map[string]any{
			"workspace_id": gatewayCtx.WorkspaceID,
			"external_id":  chunk.ExternalID,
			"service":      chunk.Service,
			"title":        chunk.Title,
			"source":       chunk.Source,
			"url":          chunk.URL,
			"content":      chunk.Content,
			"metadata":     chunk.Metadata,
			"updated_at":   chunk.UpdatedAt,
		})
	}

	return s.rest(ctx, http.MethodPost, "document_chunks?on_conflict=workspace_id,service,external_id", rows, nil)
}

func (s *SupabaseStore) GetDashboard(ctx context.Context, gatewayCtx domain.GatewayContext) (domain.DashboardPayload, error) {
	var rows []struct {
		ID         string         `json:"id"`
		ExternalID string         `json:"external_id"`
		Service    domain.Service `json:"service"`
		Type       string         `json:"type"`
		Title      string         `json:"title"`
		Source     string         `json:"source"`
		Actor      string         `json:"actor"`
		Priority   string         `json:"priority"`
		Summary    string         `json:"summary"`
		OccurredAt time.Time      `json:"occurred_at"`
		Raw        map[string]any `json:"raw"`
	}

	path := "work_events?select=id,external_id,service,type,title,source,actor,priority,summary,occurred_at,raw&workspace_id=eq." + url.QueryEscape(gatewayCtx.WorkspaceID) + "&order=occurred_at.desc&limit=50"
	if err := s.rest(ctx, http.MethodGet, path, nil, &rows); err != nil {
		return s.fallback.GetDashboard(ctx, gatewayCtx)
	}

	events := make([]domain.WorkEvent, 0, len(rows))
	for _, row := range rows {
		events = append(events, domain.WorkEvent{
			ID:         row.ID,
			ExternalID: row.ExternalID,
			Service:    row.Service,
			Type:       row.Type,
			Title:      row.Title,
			Source:     row.Source,
			Actor:      row.Actor,
			Priority:   row.Priority,
			Summary:    row.Summary,
			OccurredAt: row.OccurredAt,
			Raw:        row.Raw,
		})
	}

	if len(events) == 0 {
		return s.fallback.GetDashboard(ctx, gatewayCtx)
	}

	sourceHealth, err := s.getSourceHealth(ctx, gatewayCtx)
	if err != nil {
		sourceHealth = []domain.SourceHealth{}
	}

	return intelligence.BuildDashboard(gatewayCtx, events, sourceHealth, time.Now().UTC()), nil
}

func (s *SupabaseStore) SaveSyncResult(ctx context.Context, gatewayCtx domain.GatewayContext, result domain.SyncResult) error {
	if err := s.ensureWorkspace(ctx, gatewayCtx); err != nil {
		return err
	}

	row := map[string]any{
		"workspace_id":              gatewayCtx.WorkspaceID,
		"service":                   result.Service,
		"status":                    result.Status,
		"sync_cursor":               nullable(cursorValue(result.NextCursor)),
		"last_sync_error":           nil,
		"last_sync_records_scanned": result.RecordsScanned,
		"last_sync_events_created":  result.EventsCreated,
		"last_synced_at":            time.Now().UTC(),
		"updated_at":                time.Now().UTC(),
	}

	return s.rest(ctx, http.MethodPost, "integration_configs?on_conflict=workspace_id,service", row, nil)
}

func (s *SupabaseStore) SaveSyncFailure(ctx context.Context, gatewayCtx domain.GatewayContext, service domain.Service, syncErr error) error {
	if err := s.ensureWorkspace(ctx, gatewayCtx); err != nil {
		return err
	}

	row := map[string]any{
		"workspace_id":              gatewayCtx.WorkspaceID,
		"service":                   service,
		"status":                    "error",
		"last_sync_error":           syncErr.Error(),
		"last_sync_records_scanned": 0,
		"last_sync_events_created":  0,
		"updated_at":                time.Now().UTC(),
	}

	return s.rest(ctx, http.MethodPost, "integration_configs?on_conflict=workspace_id,service", row, nil)
}

func (s *SupabaseStore) SaveDashboardSnapshot(ctx context.Context, gatewayCtx domain.GatewayContext, payload domain.DashboardPayload) error {
	if err := s.ensureWorkspace(ctx, gatewayCtx); err != nil {
		return err
	}

	row := map[string]any{
		"workspace_id": gatewayCtx.WorkspaceID,
		"user_id":      gatewayCtx.UserID,
		"payload":      payload,
		"generated_at": payload.GeneratedAt,
	}

	return s.rest(ctx, http.MethodPost, "dashboard_snapshots", row, nil)
}

func (s *SupabaseStore) GetUserConfig(ctx context.Context, gatewayCtx domain.GatewayContext) (domain.UserConfig, error) {
	var rows []struct {
		DashboardPreferences    domain.DashboardPreferences    `json:"dashboard_preferences"`
		NotificationPreferences domain.NotificationPreferences `json:"notification_preferences"`
	}

	path := "user_configs?select=dashboard_preferences,notification_preferences&workspace_id=eq." + url.QueryEscape(gatewayCtx.WorkspaceID) + "&user_id=eq." + url.QueryEscape(gatewayCtx.UserID) + "&limit=1"
	if err := s.rest(ctx, http.MethodGet, path, nil, &rows); err != nil {
		return s.fallback.GetUserConfig(ctx, gatewayCtx)
	}

	if len(rows) == 0 {
		return s.fallback.GetUserConfig(ctx, gatewayCtx)
	}

	return domain.UserConfig{
		WorkspaceID:             gatewayCtx.WorkspaceID,
		UserID:                  gatewayCtx.UserID,
		DashboardPreferences:    rows[0].DashboardPreferences,
		NotificationPreferences: rows[0].NotificationPreferences,
	}, nil
}

func (s *SupabaseStore) UpsertUserConfig(ctx context.Context, gatewayCtx domain.GatewayContext, config domain.UserConfig) error {
	if err := s.ensureWorkspace(ctx, gatewayCtx); err != nil {
		return err
	}

	row := map[string]any{
		"workspace_id":             gatewayCtx.WorkspaceID,
		"user_id":                  gatewayCtx.UserID,
		"dashboard_preferences":    config.DashboardPreferences,
		"notification_preferences": config.NotificationPreferences,
		"updated_at":               time.Now().UTC(),
	}

	return s.rest(ctx, http.MethodPost, "user_configs?on_conflict=workspace_id,user_id", row, nil)
}

func (s *SupabaseStore) UpsertToken(ctx context.Context, gatewayCtx domain.GatewayContext, token domain.TokenUpsertRequest) error {
	if err := s.ensureWorkspace(ctx, gatewayCtx); err != nil {
		return err
	}

	if token.ProviderAccountID == "" {
		token.ProviderAccountID = "default"
	}

	row := map[string]any{
		"workspace_id":            gatewayCtx.WorkspaceID,
		"service":                 token.Service,
		"provider_account_id":     token.ProviderAccountID,
		"encrypted_access_token":  seal(token.AccessToken),
		"encrypted_refresh_token": nullable(seal(token.RefreshToken)),
		"expires_at":              nullable(token.ExpiresAt),
		"scopes":                  token.Scopes,
		"updated_at":              time.Now().UTC(),
	}

	return s.rest(ctx, http.MethodPost, "integration_tokens?on_conflict=workspace_id,service,provider_account_id", row, nil)
}

func (s *SupabaseStore) GetToken(ctx context.Context, gatewayCtx domain.GatewayContext, service domain.Service) (domain.ProviderToken, error) {
	var rows []struct {
		Service               domain.Service `json:"service"`
		ProviderAccountID     string         `json:"provider_account_id"`
		EncryptedAccessToken  string         `json:"encrypted_access_token"`
		EncryptedRefreshToken *string        `json:"encrypted_refresh_token"`
		ExpiresAt             *string        `json:"expires_at"`
		Scopes                []string       `json:"scopes"`
	}

	path := "integration_tokens?select=service,provider_account_id,encrypted_access_token,encrypted_refresh_token,expires_at,scopes&workspace_id=eq." + url.QueryEscape(gatewayCtx.WorkspaceID) + "&service=eq." + url.QueryEscape(string(service)) + "&limit=1"
	if err := s.rest(ctx, http.MethodGet, path, nil, &rows); err != nil {
		return s.fallback.GetToken(ctx, gatewayCtx, service)
	}

	if len(rows) == 0 {
		return domain.ProviderToken{}, ErrTokenNotFound
	}

	refreshToken := ""
	if rows[0].EncryptedRefreshToken != nil {
		refreshToken = unseal(*rows[0].EncryptedRefreshToken)
	}

	expiresAt := ""
	if rows[0].ExpiresAt != nil {
		expiresAt = *rows[0].ExpiresAt
	}

	return domain.ProviderToken{
		Service:           rows[0].Service,
		ProviderAccountID: rows[0].ProviderAccountID,
		AccessToken:       unseal(rows[0].EncryptedAccessToken),
		RefreshToken:      refreshToken,
		ExpiresAt:         expiresAt,
		Scopes:            rows[0].Scopes,
	}, nil
}

func (s *SupabaseStore) RefreshTokenStatus(ctx context.Context, gatewayCtx domain.GatewayContext, service domain.Service) (map[string]any, error) {
	var rows []struct {
		ID                    string  `json:"id"`
		EncryptedRefreshToken *string `json:"encrypted_refresh_token"`
		ExpiresAt             *string `json:"expires_at"`
	}

	path := "integration_tokens?select=id,encrypted_refresh_token,expires_at&workspace_id=eq." + url.QueryEscape(gatewayCtx.WorkspaceID) + "&service=eq." + url.QueryEscape(string(service)) + "&limit=1"
	if err := s.rest(ctx, http.MethodGet, path, nil, &rows); err != nil {
		return s.fallback.RefreshTokenStatus(ctx, gatewayCtx, service)
	}

	if len(rows) == 0 {
		return map[string]any{"service": service, "status": "missing_token"}, nil
	}

	if rows[0].EncryptedRefreshToken == nil || *rows[0].EncryptedRefreshToken == "" {
		return map[string]any{"service": service, "status": "missing_refresh_token", "tokenId": rows[0].ID}, nil
	}

	return map[string]any{
		"service":   service,
		"status":    "refresh_required",
		"tokenId":   rows[0].ID,
		"expiresAt": rows[0].ExpiresAt,
	}, nil
}

func (s *SupabaseStore) ListConnectionStatuses(ctx context.Context, gatewayCtx domain.GatewayContext) ([]domain.ConnectionStatus, error) {
	var configRows []struct {
		Service                domain.Service `json:"service"`
		Status                 string         `json:"status"`
		LastSyncError          *string        `json:"last_sync_error"`
		LastSyncRecordsScanned int            `json:"last_sync_records_scanned"`
		LastSyncEventsCreated  int            `json:"last_sync_events_created"`
		LastSyncedAt           *time.Time     `json:"last_synced_at"`
		UpdatedAt              *time.Time     `json:"updated_at"`
	}
	configPath := "integration_configs?select=service,status,last_sync_error,last_sync_records_scanned,last_sync_events_created,last_synced_at,updated_at&workspace_id=eq." + url.QueryEscape(gatewayCtx.WorkspaceID)
	if err := s.rest(ctx, http.MethodGet, configPath, nil, &configRows); err != nil {
		return s.fallback.ListConnectionStatuses(ctx, gatewayCtx)
	}

	var tokenRows []struct {
		Service               domain.Service `json:"service"`
		ProviderAccountID     string         `json:"provider_account_id"`
		EncryptedRefreshToken *string        `json:"encrypted_refresh_token"`
		ExpiresAt             *time.Time     `json:"expires_at"`
		Scopes                []string       `json:"scopes"`
	}
	tokenPath := "integration_tokens?select=service,provider_account_id,encrypted_refresh_token,expires_at,scopes&workspace_id=eq." + url.QueryEscape(gatewayCtx.WorkspaceID)
	if err := s.rest(ctx, http.MethodGet, tokenPath, nil, &tokenRows); err != nil {
		return s.fallback.ListConnectionStatuses(ctx, gatewayCtx)
	}

	statuses := map[domain.Service]domain.ConnectionStatus{}
	for _, service := range allServices() {
		statuses[service] = domain.ConnectionStatus{
			Service: service,
			Status:  "available",
			Scopes:  []string{},
		}
	}

	for _, row := range configRows {
		status := statuses[row.Service]
		status.Status = row.Status
		if row.LastSyncError != nil {
			status.LastSyncError = *row.LastSyncError
		}
		status.LastSyncRecordsScanned = row.LastSyncRecordsScanned
		status.LastSyncEventsCreated = row.LastSyncEventsCreated
		status.LastSyncedAt = row.LastSyncedAt
		status.UpdatedAt = row.UpdatedAt
		statuses[row.Service] = status
	}

	for _, row := range tokenRows {
		status := statuses[row.Service]
		status.HasToken = true
		status.HasRefreshToken = row.EncryptedRefreshToken != nil && strings.TrimSpace(*row.EncryptedRefreshToken) != ""
		status.ProviderAccountID = row.ProviderAccountID
		status.ExpiresAt = row.ExpiresAt
		status.Scopes = row.Scopes
		if row.ExpiresAt != nil && row.ExpiresAt.Before(time.Now().UTC()) {
			status.Status = "expired"
		} else if status.Status == "available" || status.Status == "" {
			status.Status = "connected"
		}
		statuses[row.Service] = status
	}

	connections := make([]domain.ConnectionStatus, 0, len(statuses))
	for _, service := range allServices() {
		connections = append(connections, statuses[service])
	}
	return connections, nil
}

func (s *SupabaseStore) DisconnectConnection(ctx context.Context, gatewayCtx domain.GatewayContext, service domain.Service) (domain.ConnectionStatus, error) {
	if err := s.ensureWorkspace(ctx, gatewayCtx); err != nil {
		return domain.ConnectionStatus{}, err
	}

	tokenPath := "integration_tokens?workspace_id=eq." + url.QueryEscape(gatewayCtx.WorkspaceID) + "&service=eq." + url.QueryEscape(string(service))
	if err := s.rest(ctx, http.MethodDelete, tokenPath, nil, nil); err != nil {
		return domain.ConnectionStatus{}, err
	}

	row := map[string]any{
		"workspace_id":              gatewayCtx.WorkspaceID,
		"service":                   service,
		"status":                    "available",
		"scopes":                    []string{},
		"sync_cursor":               nil,
		"last_sync_error":           nil,
		"last_sync_records_scanned": 0,
		"last_sync_events_created":  0,
		"updated_at":                time.Now().UTC(),
	}
	if err := s.rest(ctx, http.MethodPost, "integration_configs?on_conflict=workspace_id,service", row, nil); err != nil {
		return domain.ConnectionStatus{}, err
	}

	statuses, err := s.ListConnectionStatuses(ctx, gatewayCtx)
	if err != nil {
		return domain.ConnectionStatus{}, err
	}
	for _, status := range statuses {
		if status.Service == service {
			return status, nil
		}
	}

	return domain.ConnectionStatus{Service: service, Status: "available", Scopes: []string{}}, nil
}

func (s *SupabaseStore) rest(ctx context.Context, method string, path string, input any, output any) error {
	var body *bytes.Reader
	if input == nil {
		body = bytes.NewReader(nil)
	} else {
		payload, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = bytes.NewReader(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, s.url+"/rest/v1/"+path, body)
	if err != nil {
		return err
	}

	req.Header.Set("apikey", s.serviceKey)
	req.Header.Set("authorization", "Bearer "+s.serviceKey)
	req.Header.Set("content-type", "application/json")
	req.Header.Set("prefer", "resolution=merge-duplicates,return=representation")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return errors.New(resp.Status)
	}

	if output == nil {
		return nil
	}

	return json.NewDecoder(resp.Body).Decode(output)
}

func seal(token string) string {
	if token == "" {
		return ""
	}

	key, err := tokenSealingKey()
	if err == nil {
		block, err := aes.NewCipher(key)
		if err != nil {
			return ""
		}
		gcm, err := cipher.NewGCM(block)
		if err != nil {
			return ""
		}

		nonce := make([]byte, gcm.NonceSize())
		if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
			return ""
		}

		ciphertext := gcm.Seal(nil, nonce, []byte(token), nil)
		sealed := append(nonce, ciphertext...)
		return "sealed:v1:" + base64.StdEncoding.EncodeToString(sealed)
	}

	return "sealed:" + base64.StdEncoding.EncodeToString([]byte(token))
}

func unseal(value string) string {
	if value == "" {
		return ""
	}
	if strings.HasPrefix(value, "sealed:v1:") {
		key, err := tokenSealingKey()
		if err != nil {
			return ""
		}

		encrypted, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, "sealed:v1:"))
		if err != nil {
			return ""
		}

		block, err := aes.NewCipher(key)
		if err != nil {
			return ""
		}
		gcm, err := cipher.NewGCM(block)
		if err != nil {
			return ""
		}
		if len(encrypted) < gcm.NonceSize() {
			return ""
		}

		nonce := encrypted[:gcm.NonceSize()]
		ciphertext := encrypted[gcm.NonceSize():]
		plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
		if err != nil {
			return ""
		}
		return string(plaintext)
	}
	if !strings.HasPrefix(value, "sealed:") {
		return value
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, "sealed:"))
	if err != nil {
		return ""
	}

	return string(decoded)
}

func tokenSealingKey() ([]byte, error) {
	value := strings.TrimSpace(os.Getenv("TOKEN_SEALING_KEY"))
	if value == "" {
		return nil, errors.New("TOKEN_SEALING_KEY is not configured")
	}

	decoded, err := base64.StdEncoding.DecodeString(value)
	if err == nil && len(decoded) == 32 {
		return decoded, nil
	}

	if len(value) == 32 {
		return []byte(value), nil
	}

	return nil, errors.New("TOKEN_SEALING_KEY must be 32 bytes or base64-encoded 32 bytes")
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func (s *SupabaseStore) ensureWorkspace(ctx context.Context, gatewayCtx domain.GatewayContext) error {
	row := map[string]any{
		"id":         gatewayCtx.WorkspaceID,
		"name":       "Developer OS Workspace",
		"slug":       "developer-os-" + strings.ReplaceAll(gatewayCtx.WorkspaceID, "-", ""),
		"updated_at": time.Now().UTC(),
	}

	return s.rest(ctx, http.MethodPost, "workspaces?on_conflict=id", row, nil)
}

func (s *SupabaseStore) getSourceHealth(ctx context.Context, gatewayCtx domain.GatewayContext) ([]domain.SourceHealth, error) {
	var rows []struct {
		Service      domain.Service `json:"service"`
		Status       string         `json:"status"`
		LastSyncedAt *time.Time     `json:"last_synced_at"`
	}

	path := "integration_configs?select=service,status,last_synced_at&workspace_id=eq." + url.QueryEscape(gatewayCtx.WorkspaceID)
	if err := s.rest(ctx, http.MethodGet, path, nil, &rows); err != nil {
		return nil, err
	}

	health := make([]domain.SourceHealth, 0, len(rows))
	for _, row := range rows {
		health = append(health, domain.SourceHealth{
			Service:      row.Service,
			Status:       row.Status,
			LastSyncedAt: row.LastSyncedAt,
		})
	}

	return health, nil
}

func eventKey(event domain.WorkEvent) string {
	externalID := event.ExternalID
	if externalID == "" {
		externalID = event.ID
	}
	return string(event.Service) + ":" + externalID
}

func chunkKey(chunk domain.DocumentChunk) string {
	externalID := chunk.ExternalID
	if externalID == "" {
		externalID = chunk.ID
	}
	return string(chunk.Service) + ":" + externalID
}

func cursorValue(cursor *string) string {
	if cursor == nil {
		return ""
	}
	return *cursor
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
