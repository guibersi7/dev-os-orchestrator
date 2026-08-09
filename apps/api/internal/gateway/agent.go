package gateway

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/developer-os/api/internal/domain"
	"github.com/developer-os/api/internal/httpjson"
)

func (s *Server) agentChat(w http.ResponseWriter, r *http.Request) {
	ctx := gatewayContext(r)
	if strings.TrimSpace(s.agentBaseURL) == "" {
		s.writeError(w, ctx, http.StatusServiceUnavailable, "agent_not_configured", "AGENT_BASE_URL is not configured.", nil)
		return
	}

	var input domain.AgentChatRequest
	if err := httpjson.Read(r, &input); err != nil {
		s.writeError(w, ctx, http.StatusBadRequest, "invalid_payload", "invalid agent chat payload", map[string]any{"cause": err.Error()})
		return
	}
	input.Message = strings.TrimSpace(input.Message)
	if input.Message == "" {
		s.writeError(w, ctx, http.StatusBadRequest, "invalid_agent_message", "message is required", nil)
		return
	}

	agentContext, err := s.store.GetAgentContext(r.Context(), ctx, input.Message)
	if err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "agent_context_read_failed", err.Error(), nil)
		return
	}

	response, err := s.callAgent(r, ctx, input, agentContext)
	if err != nil {
		s.logger.ErrorContext(r.Context(), "agent_chat_failed",
			"request_id", ctx.RequestID,
			"workspace_id", ctx.WorkspaceID,
			"user_id", ctx.UserID,
			"error", err.Error(),
		)
		s.writeError(w, ctx, http.StatusBadGateway, "agent_chat_failed", err.Error(), nil)
		return
	}

	s.write(w, ctx, http.StatusOK, map[string]any{"agent": response})
}

func (s *Server) callAgent(r *http.Request, ctx domain.GatewayContext, input domain.AgentChatRequest, agentContext domain.AgentContext) (domain.AgentChatResponse, error) {
	payload := map[string]any{
		"message":        input.Message,
		"conversationId": input.ConversationID,
		"workspaceId":    ctx.WorkspaceID,
		"userId":         ctx.UserID,
		"context":        agentContext,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return domain.AgentChatResponse{}, err
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, s.agentBaseURL+"/v1/chat", bytes.NewReader(body))
	if err != nil {
		return domain.AgentChatResponse{}, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-request-id", ctx.RequestID)
	if strings.TrimSpace(s.agentSecret) != "" {
		req.Header.Set("authorization", "Bearer "+s.agentSecret)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return domain.AgentChatResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		details, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		message := strings.TrimSpace(string(details))
		if message == "" {
			message = resp.Status
		}
		return domain.AgentChatResponse{}, fmt.Errorf("agent service returned %s: %s", resp.Status, message)
	}

	var response domain.AgentChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return domain.AgentChatResponse{}, err
	}
	if strings.TrimSpace(response.Answer) == "" {
		return domain.AgentChatResponse{}, errors.New("agent service returned an empty answer")
	}
	if response.Citations == nil {
		response.Citations = []domain.AgentCitation{}
	}
	if response.SuggestedActions == nil {
		response.SuggestedActions = []domain.AgentSuggestedAction{}
	}
	return response, nil
}

func normalizeAgentBaseURL(value string) string {
	value = strings.TrimRight(strings.TrimSpace(value), "/")
	if value == "" {
		return ""
	}
	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") {
		return value
	}
	return "http://" + value
}
