package integrations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/developer-os/api/internal/domain"
)

type TrelloConnector struct {
	info       domain.ConnectorInfo
	client     *http.Client
	apiBaseURL string
	apiKey     string
	boardIDs   []string
}

func NewTrelloConnector() Connector {
	return &TrelloConnector{
		info: domain.ConnectorInfo{
			ID:           domain.ServiceTrello,
			Name:         "Trello",
			AuthStrategy: "oauth",
			SyncMode:     "hybrid",
			Capabilities: []string{"oauth", "webhooks", "initial_sync", "polling"},
			Objects:      []string{"boards", "lists", "cards", "checklists", "due_dates"},
		},
		client:     &http.Client{Timeout: 15 * time.Second},
		apiBaseURL: envOrDefault("TRELLO_API_BASE_URL", "https://api.trello.com/1"),
		apiKey:     strings.TrimSpace(os.Getenv("TRELLO_API_KEY")),
		boardIDs:   parseCSV(os.Getenv("TRELLO_BOARD_IDS")),
	}
}

func (c *TrelloConnector) Info() domain.ConnectorInfo {
	return c.info
}

func (c *TrelloConnector) FetchRecentRecords(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.ExternalRecord, error) {
	accessToken := trelloAccessToken(token)
	if accessToken == "" {
		return nil, errTrelloNeedsAuth
	}
	if c.apiKey == "" {
		return nil, errTrelloNeedsAPIKey
	}
	if len(c.boardIDs) == 0 {
		return nil, errTrelloNeedsBoards
	}

	records := []domain.ExternalRecord{}
	for _, boardID := range c.boardIDs {
		board, err := c.fetchBoard(ctx, accessToken, boardID)
		if err != nil {
			return nil, err
		}
		lists, err := c.fetchLists(ctx, accessToken, boardID)
		if err != nil {
			return nil, err
		}
		cards, err := c.fetchCards(ctx, accessToken, boardID)
		if err != nil {
			return nil, err
		}

		listNames := map[string]string{}
		for _, list := range lists {
			listNames[list.ID] = list.Name
		}
		for _, card := range cards {
			records = append(records, card.toRecord(board, listNames[card.IDList]))
		}
	}

	return records, nil
}

func (c *TrelloConnector) Normalize(records []domain.ExternalRecord) []domain.WorkEvent {
	events := make([]domain.WorkEvent, 0, len(records))
	for _, record := range records {
		eventType, _ := record.Payload["eventType"].(string)
		priority, _ := record.Payload["priority"].(string)
		source, _ := record.Payload["source"].(string)
		summary, _ := record.Payload["summary"].(string)
		events = append(events, domain.WorkEvent{
			ID:         "evt-" + record.ID,
			ExternalID: record.ID,
			Service:    domain.ServiceTrello,
			Type:       eventType,
			Title:      record.Title,
			Source:     source,
			Actor:      record.Actor,
			Priority:   priority,
			Summary:    summary,
			OccurredAt: record.UpdatedAt,
			Raw:        record.Payload,
		})
	}
	return events
}

func (c *TrelloConnector) Sync(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	records, err := c.FetchRecentRecords(ctx, gatewayContext, token)
	if errors.Is(err, errTrelloNeedsAuth) {
		return domain.SyncResult{Service: domain.ServiceTrello, Status: "needs_auth", Events: []domain.WorkEvent{}}, nil
	}
	if errors.Is(err, errTrelloNeedsAPIKey) {
		return domain.SyncResult{Service: domain.ServiceTrello, Status: "needs_api_key", Events: []domain.WorkEvent{}}, nil
	}
	if errors.Is(err, errTrelloNeedsBoards) {
		return domain.SyncResult{Service: domain.ServiceTrello, Status: "needs_board_selection", Events: []domain.WorkEvent{}}, nil
	}
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	cursor := latestRecordCursor(records)
	return domain.SyncResult{
		Service:        domain.ServiceTrello,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     cursor,
		Events:         events,
	}, nil
}

func (c *TrelloConnector) fetchBoard(ctx context.Context, token string, boardID string) (trelloBoard, error) {
	var board trelloBoard
	if err := c.get(ctx, token, "/boards/"+url.PathEscape(boardID), url.Values{"fields": []string{"name,url"}}, &board); err != nil {
		return trelloBoard{}, err
	}
	return board, nil
}

func (c *TrelloConnector) fetchLists(ctx context.Context, token string, boardID string) ([]trelloList, error) {
	var lists []trelloList
	if err := c.get(ctx, token, "/boards/"+url.PathEscape(boardID)+"/lists", url.Values{"fields": []string{"name"}}, &lists); err != nil {
		return nil, err
	}
	return lists, nil
}

func (c *TrelloConnector) fetchCards(ctx context.Context, token string, boardID string) ([]trelloCard, error) {
	var cards []trelloCard
	values := url.Values{
		"fields":     []string{"name,url,idList,dateLastActivity,due,dueComplete,labels,idMembers,closed"},
		"checklists": []string{"all"},
	}
	if err := c.get(ctx, token, "/boards/"+url.PathEscape(boardID)+"/cards", values, &cards); err != nil {
		return nil, err
	}
	return cards, nil
}

func (c *TrelloConnector) get(ctx context.Context, token string, path string, values url.Values, output any) error {
	values.Set("key", c.apiKey)
	values.Set("token", token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.apiBaseURL, "/")+path+"?"+values.Encode(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("accept", "application/json")
	req.Header.Set("user-agent", "developer-os-api")

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("trello api request failed: %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(output)
}

type trelloBoard struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	URL  string `json:"url"`
}

type trelloList struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type trelloCard struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	URL              string            `json:"url"`
	IDList           string            `json:"idList"`
	DateLastActivity time.Time         `json:"dateLastActivity"`
	Due              *time.Time        `json:"due"`
	DueComplete      bool              `json:"dueComplete"`
	Closed           bool              `json:"closed"`
	Labels           []trelloLabel     `json:"labels"`
	IDMembers        []string          `json:"idMembers"`
	Checklists       []trelloChecklist `json:"checklists"`
}

type trelloLabel struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type trelloChecklist struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	CheckItems []trelloCheckItem `json:"checkItems"`
}

type trelloCheckItem struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	State string `json:"state"`
}

func (c trelloCard) toRecord(board trelloBoard, listName string) domain.ExternalRecord {
	eventType, priority, summary := classifyTrelloCard(c, listName)
	occurredAt := c.DateLastActivity
	if occurredAt.IsZero() {
		occurredAt = time.Now().UTC()
	}

	externalID := fmt.Sprintf("trello:%s:%s:%s", board.ID, c.ID, eventType)
	return domain.ExternalRecord{
		ID:          externalID,
		ExternalURL: c.URL,
		Title:       c.Name,
		Actor:       "Trello",
		UpdatedAt:   occurredAt,
		Payload: map[string]any{
			"eventType":       eventType,
			"priority":        priority,
			"source":          "Trello · " + board.Name,
			"summary":         summary,
			"boardId":         board.ID,
			"board":           board.Name,
			"list":            listName,
			"url":             c.URL,
			"labels":          trelloLabelNames(c.Labels),
			"memberCount":     len(c.IDMembers),
			"due":             nullableTime(c.Due),
			"dueComplete":     c.DueComplete,
			"checklistStatus": trelloChecklistStatus(c.Checklists),
		},
	}
}

func classifyTrelloCard(card trelloCard, listName string) (string, string, string) {
	labels := strings.ToLower(strings.Join(trelloLabelNames(card.Labels), " "))
	list := strings.ToLower(listName)
	name := strings.ToLower(card.Name)

	if strings.Contains(labels, "block") || strings.Contains(list, "block") || strings.Contains(name, "blocked") || strings.Contains(name, "bloqueado") {
		return "trello.card.blocked", "high", "A Trello card appears blocked."
	}
	if card.Due != nil && !card.DueComplete && card.Due.Before(time.Now().UTC()) {
		return "trello.due_date.missed", "high", "A Trello card missed its due date."
	}
	if trelloAllCheckItemsComplete(card.Checklists) {
		return "trello.checklist.completed", "medium", "A Trello checklist was completed."
	}
	return "trello.card.updated", "medium", "A Trello card changed."
}

func trelloLabelNames(labels []trelloLabel) []string {
	names := make([]string, 0, len(labels))
	for _, label := range labels {
		if label.Name != "" {
			names = append(names, label.Name)
		} else if label.Color != "" {
			names = append(names, label.Color)
		}
	}
	return names
}

func trelloAllCheckItemsComplete(checklists []trelloChecklist) bool {
	total := 0
	for _, checklist := range checklists {
		for _, item := range checklist.CheckItems {
			total++
			if item.State != "complete" {
				return false
			}
		}
	}
	return total > 0
}

func trelloChecklistStatus(checklists []trelloChecklist) map[string]int {
	status := map[string]int{"total": 0, "complete": 0}
	for _, checklist := range checklists {
		for _, item := range checklist.CheckItems {
			status["total"]++
			if item.State == "complete" {
				status["complete"]++
			}
		}
	}
	return status
}

func nullableTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.UTC()
}

var (
	errTrelloNeedsAuth   = errors.New("trello integration token is required")
	errTrelloNeedsAPIKey = errors.New("trello api key is required")
	errTrelloNeedsBoards = errors.New("trello board selection is required")
)

func trelloAccessToken(token *domain.ProviderToken) string {
	if token != nil && token.AccessToken != "" {
		return token.AccessToken
	}
	return strings.TrimSpace(os.Getenv("TRELLO_ACCESS_TOKEN"))
}
