package domain

import "time"

type Service string

const (
	ServiceGitHub   Service = "github"
	ServiceSlack    Service = "slack"
	ServiceLinear   Service = "linear"
	ServiceJira     Service = "jira"
	ServiceTrello   Service = "trello"
	ServiceNotion   Service = "notion"
	ServiceCalendar Service = "calendar"
)

func (s Service) Valid() bool {
	switch s {
	case ServiceGitHub, ServiceSlack, ServiceLinear, ServiceJira, ServiceTrello, ServiceNotion, ServiceCalendar:
		return true
	default:
		return false
	}
}

type GatewayContext struct {
	WorkspaceID string
	UserID      string
	RequestID   string
}

type APIContext struct {
	WorkspaceID string `json:"workspaceId"`
	UserID      string `json:"userId"`
}

type APIError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type APIResponse struct {
	Version   string     `json:"version"`
	RequestID string     `json:"requestId"`
	Context   APIContext `json:"context"`
	Data      any        `json:"data"`
	Error     *APIError  `json:"error"`
}

type ExternalRecord struct {
	ID          string         `json:"id"`
	ExternalURL string         `json:"externalUrl"`
	Title       string         `json:"title"`
	Actor       string         `json:"actor"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	Payload     map[string]any `json:"payload"`
}

type WorkEvent struct {
	ID         string         `json:"id"`
	ExternalID string         `json:"externalId"`
	Service    Service        `json:"service"`
	Type       string         `json:"type"`
	Title      string         `json:"title"`
	Source     string         `json:"source"`
	Actor      string         `json:"actor"`
	Priority   string         `json:"priority"`
	Summary    string         `json:"summary"`
	OccurredAt time.Time      `json:"occurredAt"`
	Raw        map[string]any `json:"raw,omitempty"`
}

type SyncResult struct {
	Service        Service         `json:"service"`
	Status         string          `json:"status"`
	RecordsScanned int             `json:"recordsScanned"`
	EventsCreated  int             `json:"eventsCreated"`
	NextCursor     *string         `json:"nextCursor"`
	Events         []WorkEvent     `json:"events"`
	DocumentChunks []DocumentChunk `json:"documentChunks,omitempty"`
}

type ConnectorInfo struct {
	ID           Service  `json:"id"`
	Name         string   `json:"name"`
	AuthStrategy string   `json:"authStrategy"`
	SyncMode     string   `json:"syncMode"`
	Capabilities []string `json:"capabilities"`
	Objects      []string `json:"objects"`
}

type SourceHealth struct {
	Service      Service    `json:"service"`
	Status       string     `json:"status"`
	LastSyncedAt *time.Time `json:"lastSyncedAt"`
}

type ConnectionStatus struct {
	Service                Service    `json:"service"`
	Status                 string     `json:"status"`
	ProviderConfigured     bool       `json:"providerConfigured"`
	HasToken               bool       `json:"hasToken"`
	HasRefreshToken        bool       `json:"hasRefreshToken"`
	ProviderAccountID      string     `json:"providerAccountId,omitempty"`
	ExpiresAt              *time.Time `json:"expiresAt,omitempty"`
	Scopes                 []string   `json:"scopes"`
	LastSyncedAt           *time.Time `json:"lastSyncedAt,omitempty"`
	LastSyncError          string     `json:"lastSyncError,omitempty"`
	LastSyncRecordsScanned int        `json:"lastSyncRecordsScanned"`
	LastSyncEventsCreated  int        `json:"lastSyncEventsCreated"`
	UpdatedAt              *time.Time `json:"updatedAt,omitempty"`
}

type DashboardPayload struct {
	WorkspaceID   string           `json:"workspaceId"`
	GeneratedAt   time.Time        `json:"generatedAt"`
	Metrics       DashboardMetrics `json:"metrics"`
	Today         DashboardToday   `json:"today"`
	Focus         []FocusItem      `json:"focus"`
	WeeklySummary WeeklySummary    `json:"weeklySummary"`
	Events        []WorkEvent      `json:"events"`
	SourceHealth  []SourceHealth   `json:"sourceHealth"`
}

type DashboardMetrics struct {
	ConnectedSources  int `json:"connectedSources"`
	WaitingReview     int `json:"waitingReview"`
	CrossToolBlockers int `json:"crossToolBlockers"`
	DecisionsFound    int `json:"decisionsFound"`
}

type DashboardToday struct {
	PRsWaitingForReview    []WorkEvent `json:"prsWaitingForReview"`
	BlockedPRs             []WorkEvent `json:"blockedPrs"`
	FailedChecks           []WorkEvent `json:"failedChecks"`
	AssignedIssues         []WorkEvent `json:"assignedIssues"`
	RecentImportantChanges []WorkEvent `json:"recentImportantChanges"`
}

type FocusItem struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Reason    string    `json:"reason"`
	Action    string    `json:"action"`
	Priority  string    `json:"priority"`
	Service   Service   `json:"service"`
	Sources   []string  `json:"sources"`
	EventIDs  []string  `json:"eventIds"`
	CreatedAt time.Time `json:"createdAt"`
}

type WeeklySummary struct {
	CompletedWork   []string    `json:"completedWork"`
	MergedPRs       []WorkEvent `json:"mergedPrs"`
	ClosedIssues    []WorkEvent `json:"closedIssues"`
	ActiveWork      []WorkEvent `json:"activeWork"`
	Risks           []string    `json:"risks"`
	Blockers        []WorkEvent `json:"blockers"`
	SummaryStrategy string      `json:"summaryStrategy"`
}

type UserConfig struct {
	WorkspaceID             string                  `json:"workspaceId"`
	UserID                  string                  `json:"userId"`
	DashboardPreferences    DashboardPreferences    `json:"dashboardPreferences"`
	NotificationPreferences NotificationPreferences `json:"notificationPreferences"`
}

type DashboardPreferences struct {
	DefaultView    string    `json:"defaultView"`
	VisibleSources []Service `json:"visibleSources"`
}

type NotificationPreferences struct {
	Blockers     bool `json:"blockers"`
	FailedChecks bool `json:"failedChecks"`
	Decisions    bool `json:"decisions"`
}

type TokenUpsertRequest struct {
	WorkspaceID       string   `json:"workspaceId"`
	Service           Service  `json:"service"`
	ProviderAccountID string   `json:"providerAccountId,omitempty"`
	AccessToken       string   `json:"accessToken"`
	RefreshToken      string   `json:"refreshToken,omitempty"`
	ExpiresAt         string   `json:"expiresAt,omitempty"`
	Scopes            []string `json:"scopes"`
}

type ProviderToken struct {
	Service           Service
	ProviderAccountID string
	AccessToken       string
	RefreshToken      string
	ExpiresAt         string
	Scopes            []string
}

type DocumentChunk struct {
	ID         string         `json:"id"`
	ExternalID string         `json:"externalId"`
	Service    Service        `json:"service"`
	Title      string         `json:"title"`
	Source     string         `json:"source"`
	URL        string         `json:"url"`
	Content    string         `json:"content"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	UpdatedAt  time.Time      `json:"updatedAt"`
}
