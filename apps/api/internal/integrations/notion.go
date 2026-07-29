package integrations

import (
	"bytes"
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

type NotionConnector struct {
	info          domain.ConnectorInfo
	client        *http.Client
	apiBaseURL    string
	notionVersion string
}

func NewNotionConnector() Connector {
	return &NotionConnector{
		info: domain.ConnectorInfo{
			ID:           domain.ServiceNotion,
			Name:         "Notion",
			AuthStrategy: "oauth",
			SyncMode:     "polling_first",
			Capabilities: []string{"oauth", "initial_sync", "polling", "semantic_context"},
			Objects:      []string{"pages", "databases", "specs", "decisions", "comments"},
		},
		client:        &http.Client{Timeout: 15 * time.Second},
		apiBaseURL:    envOrDefault("NOTION_API_BASE_URL", "https://api.notion.com/v1"),
		notionVersion: envOrDefault("NOTION_VERSION", "2026-03-11"),
	}
}

func (c *NotionConnector) Info() domain.ConnectorInfo {
	return c.info
}

func (c *NotionConnector) FetchRecentRecords(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.ExternalRecord, error) {
	accessToken := notionAccessToken(token)
	if accessToken == "" {
		return nil, errNotionNeedsAuth
	}

	pages, err := c.searchPages(ctx, accessToken)
	if err != nil {
		return nil, err
	}

	records := []domain.ExternalRecord{}
	for _, page := range pages {
		blocks, err := c.fetchBlockChildren(ctx, accessToken, page.ID)
		if err != nil {
			return nil, err
		}
		comments, err := c.fetchComments(ctx, accessToken, page.ID)
		if err != nil {
			comments = []notionComment{}
		}

		record, ok := page.toRecord(blocks, comments)
		if ok {
			records = append(records, record)
		}
	}

	return records, nil
}

func (c *NotionConnector) Normalize(records []domain.ExternalRecord) []domain.WorkEvent {
	events := make([]domain.WorkEvent, 0, len(records))
	for _, record := range records {
		eventType, _ := record.Payload["eventType"].(string)
		priority, _ := record.Payload["priority"].(string)
		summary, _ := record.Payload["summary"].(string)
		raw := notionPublicPayload(record.Payload)

		events = append(events, domain.WorkEvent{
			ID:         "evt-" + record.ID,
			ExternalID: record.ID,
			Service:    domain.ServiceNotion,
			Type:       eventType,
			Title:      record.Title,
			Source:     "Notion",
			Actor:      record.Actor,
			Priority:   priority,
			Summary:    summary,
			OccurredAt: record.UpdatedAt,
			Raw:        raw,
		})
	}

	return events
}

func (c *NotionConnector) Sync(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	records, err := c.FetchRecentRecords(ctx, gatewayContext, token)
	if errors.Is(err, errNotionNeedsAuth) {
		return domain.SyncResult{Service: domain.ServiceNotion, Status: "needs_auth", Events: []domain.WorkEvent{}}, nil
	}
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	chunks := notionDocumentChunks(records)
	cursor := latestRecordCursor(records)

	return domain.SyncResult{
		Service:        domain.ServiceNotion,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     cursor,
		Events:         events,
		DocumentChunks: chunks,
	}, nil
}

func (c *NotionConnector) searchPages(ctx context.Context, token string) ([]notionPage, error) {
	var response struct {
		Results []notionPage `json:"results"`
	}

	payload := map[string]any{
		"filter": map[string]any{
			"property": "object",
			"value":    "page",
		},
		"sort": map[string]any{
			"direction": "descending",
			"timestamp": "last_edited_time",
		},
		"page_size": 25,
	}
	if err := c.post(ctx, token, "/search", payload, &response); err != nil {
		return nil, err
	}
	return response.Results, nil
}

func (c *NotionConnector) fetchBlockChildren(ctx context.Context, token string, blockID string) ([]notionBlock, error) {
	var response struct {
		Results []notionBlock `json:"results"`
	}
	if err := c.get(ctx, token, "/blocks/"+url.PathEscape(blockID)+"/children?page_size=100", &response); err != nil {
		return nil, err
	}
	return response.Results, nil
}

func (c *NotionConnector) fetchComments(ctx context.Context, token string, blockID string) ([]notionComment, error) {
	var response struct {
		Results []notionComment `json:"results"`
	}
	if err := c.get(ctx, token, "/comments?block_id="+url.QueryEscape(blockID)+"&page_size=100", &response); err != nil {
		return nil, err
	}
	return response.Results, nil
}

func (c *NotionConnector) post(ctx context.Context, token string, path string, input any, output any) error {
	payload, err := json.Marshal(input)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.apiBaseURL, "/")+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	c.setHeaders(req, token)
	req.Header.Set("content-type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("notion api request failed: %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(output)
}

func (c *NotionConnector) get(ctx context.Context, token string, path string, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.apiBaseURL, "/")+path, nil)
	if err != nil {
		return err
	}
	c.setHeaders(req, token)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("notion api request failed: %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(output)
}

func (c *NotionConnector) setHeaders(req *http.Request, token string) {
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("accept", "application/json")
	req.Header.Set("notion-version", c.notionVersion)
	req.Header.Set("user-agent", "developer-os-api")
}

type notionPage struct {
	ID             string                    `json:"id"`
	URL            string                    `json:"url"`
	CreatedTime    time.Time                 `json:"created_time"`
	LastEditedTime time.Time                 `json:"last_edited_time"`
	Properties     map[string]notionProperty `json:"properties"`
	LastEditedBy   struct {
		ID string `json:"id"`
	} `json:"last_edited_by"`
}

type notionProperty struct {
	Type      string           `json:"type"`
	Title     []notionRichText `json:"title"`
	RichText  []notionRichText `json:"rich_text"`
	PlainText string           `json:"plain_text"`
}

type notionBlock struct {
	ID             string    `json:"id"`
	Type           string    `json:"type"`
	LastEditedTime time.Time `json:"last_edited_time"`
	Paragraph      struct {
		RichText []notionRichText `json:"rich_text"`
	} `json:"paragraph"`
	Heading1 struct {
		RichText []notionRichText `json:"rich_text"`
	} `json:"heading_1"`
	Heading2 struct {
		RichText []notionRichText `json:"rich_text"`
	} `json:"heading_2"`
	Heading3 struct {
		RichText []notionRichText `json:"rich_text"`
	} `json:"heading_3"`
	BulletedListItem struct {
		RichText []notionRichText `json:"rich_text"`
	} `json:"bulleted_list_item"`
	NumberedListItem struct {
		RichText []notionRichText `json:"rich_text"`
	} `json:"numbered_list_item"`
	ToDo struct {
		RichText []notionRichText `json:"rich_text"`
		Checked  bool             `json:"checked"`
	} `json:"to_do"`
	Quote struct {
		RichText []notionRichText `json:"rich_text"`
	} `json:"quote"`
	Callout struct {
		RichText []notionRichText `json:"rich_text"`
	} `json:"callout"`
}

type notionComment struct {
	ID        string           `json:"id"`
	CreatedAt time.Time        `json:"created_time"`
	RichText  []notionRichText `json:"rich_text"`
	CreatedBy struct {
		ID string `json:"id"`
	} `json:"created_by"`
}

type notionRichText struct {
	PlainText string `json:"plain_text"`
	Href      string `json:"href"`
	Text      struct {
		Content string `json:"content"`
		Link    *struct {
			URL string `json:"url"`
		} `json:"link"`
	} `json:"text"`
}

func (p notionPage) toRecord(blocks []notionBlock, comments []notionComment) (domain.ExternalRecord, bool) {
	title := p.title()
	content := notionBlocksText(blocks)
	commentText := notionCommentsText(comments)
	combinedText := strings.TrimSpace(title + "\n" + content + "\n" + commentText)
	eventType, priority, summary, ok := classifyNotionDocument(title, combinedText)
	if !ok {
		return domain.ExternalRecord{}, false
	}

	updatedAt := p.LastEditedTime
	if updatedAt.IsZero() {
		updatedAt = time.Now().UTC()
	}

	externalID := fmt.Sprintf("notion:%s:%s:%s", p.ID, eventType, updatedAt.Format(time.RFC3339))
	return domain.ExternalRecord{
		ID:          externalID,
		ExternalURL: p.URL,
		Title:       title,
		Actor:       firstNonEmpty(p.LastEditedBy.ID, "Notion"),
		UpdatedAt:   updatedAt,
		Payload: map[string]any{
			"eventType":     eventType,
			"priority":      priority,
			"summary":       summary,
			"pageId":        p.ID,
			"url":           p.URL,
			"title":         title,
			"blockCount":    len(blocks),
			"commentCount":  len(comments),
			"linkedRefs":    extractLinkedRefs(combinedText),
			"documentChunk": truncateForChunk(combinedText, 4000),
		},
	}, true
}

func (p notionPage) title() string {
	for _, property := range p.Properties {
		if property.Type == "title" {
			text := notionRichTextPlain(property.Title)
			if text != "" {
				return text
			}
		}
	}
	return "Untitled Notion page"
}

func classifyNotionDocument(title string, text string) (string, string, string, bool) {
	normalized := strings.ToLower(title + "\n" + text)
	if strings.Contains(normalized, "decision") || strings.Contains(normalized, "decisao") || strings.Contains(normalized, "adr") || strings.Contains(normalized, "architecture decision") {
		return "notion.decision.logged", "medium", "A Notion page captured a durable engineering decision.", true
	}
	if strings.Contains(normalized, "spec") || strings.Contains(normalized, "rfc") || strings.Contains(normalized, "requirements") || strings.Contains(normalized, "architecture") {
		return "notion.spec.updated", "medium", "A Notion spec or architecture document changed.", true
	}
	if len(strings.TrimSpace(text)) > 0 {
		return "notion.document.updated", "low", "A Notion document changed and was indexed for workspace context.", true
	}
	return "", "", "", false
}

func notionPublicPayload(payload map[string]any) map[string]any {
	publicPayload := make(map[string]any, len(payload))
	for key, value := range payload {
		if key == "documentChunk" {
			continue
		}
		publicPayload[key] = value
	}
	return publicPayload
}

func notionDocumentChunks(records []domain.ExternalRecord) []domain.DocumentChunk {
	chunks := make([]domain.DocumentChunk, 0, len(records))
	for _, record := range records {
		content, _ := record.Payload["documentChunk"].(string)
		if strings.TrimSpace(content) == "" {
			continue
		}
		pageID, _ := record.Payload["pageId"].(string)
		chunks = append(chunks, domain.DocumentChunk{
			ID:         "chunk-" + record.ID,
			ExternalID: "notion:" + pageID + ":content",
			Service:    domain.ServiceNotion,
			Title:      record.Title,
			Source:     "Notion",
			URL:        record.ExternalURL,
			Content:    content,
			UpdatedAt:  record.UpdatedAt,
			Metadata: map[string]any{
				"pageId":       pageID,
				"linkedRefs":   record.Payload["linkedRefs"],
				"blockCount":   record.Payload["blockCount"],
				"commentCount": record.Payload["commentCount"],
			},
		})
	}
	return chunks
}

func notionBlocksText(blocks []notionBlock) string {
	parts := make([]string, 0, len(blocks))
	for _, block := range blocks {
		text := blockText(block)
		if text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n")
}

func blockText(block notionBlock) string {
	switch block.Type {
	case "paragraph":
		return notionRichTextPlain(block.Paragraph.RichText)
	case "heading_1":
		return notionRichTextPlain(block.Heading1.RichText)
	case "heading_2":
		return notionRichTextPlain(block.Heading2.RichText)
	case "heading_3":
		return notionRichTextPlain(block.Heading3.RichText)
	case "bulleted_list_item":
		return notionRichTextPlain(block.BulletedListItem.RichText)
	case "numbered_list_item":
		return notionRichTextPlain(block.NumberedListItem.RichText)
	case "to_do":
		return notionRichTextPlain(block.ToDo.RichText)
	case "quote":
		return notionRichTextPlain(block.Quote.RichText)
	case "callout":
		return notionRichTextPlain(block.Callout.RichText)
	default:
		return ""
	}
}

func notionCommentsText(comments []notionComment) string {
	parts := make([]string, 0, len(comments))
	for _, comment := range comments {
		text := notionRichTextPlain(comment.RichText)
		if text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n")
}

func notionRichTextPlain(parts []notionRichText) string {
	output := make([]string, 0, len(parts))
	for _, part := range parts {
		text := part.PlainText
		if text == "" {
			text = part.Text.Content
		}
		if text != "" {
			output = append(output, text)
		}
	}
	return strings.Join(output, "")
}

func truncateForChunk(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	return strings.TrimSpace(value[:limit])
}

var errNotionNeedsAuth = errors.New("notion integration token is required")

func notionAccessToken(token *domain.ProviderToken) string {
	if token != nil && token.AccessToken != "" {
		return token.AccessToken
	}
	return strings.TrimSpace(os.Getenv("NOTION_ACCESS_TOKEN"))
}
