package gateway

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/developer-os/api/internal/domain"
	"github.com/developer-os/api/internal/httpjson"
	"github.com/developer-os/api/internal/integrations"
	"github.com/developer-os/api/internal/oauth"
	"github.com/developer-os/api/internal/store"
)

type Config struct {
	Registry         *integrations.Registry
	Store            store.Store
	GatewaySecret    string
	OAuthStateSecret string
	HTTPClient       *http.Client
}

type Server struct {
	registry         *integrations.Registry
	store            store.Store
	gatewaySecret    string
	oauthStateSecret string
	httpClient       *http.Client
}

func NewServer(config Config) *Server {
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}

	oauthStateSecret := config.OAuthStateSecret
	if oauthStateSecret == "" {
		oauthStateSecret = config.GatewaySecret
	}

	return &Server{
		registry:         config.Registry,
		store:            config.Store,
		gatewaySecret:    config.GatewaySecret,
		oauthStateSecret: oauthStateSecret,
		httpClient:       httpClient,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /v1/dashboard", s.withAuth(s.dashboard))
	mux.HandleFunc("GET /v1/config", s.withAuth(s.getConfig))
	mux.HandleFunc("PUT /v1/config", s.withAuth(s.putConfig))
	mux.HandleFunc("GET /v1/oauth/{service}/start", s.withAuth(s.oauthStart))
	mux.HandleFunc("GET /v1/oauth/{service}/callback", s.oauthCallback)
	mux.HandleFunc("POST /v1/sync", s.withAuth(s.sync))
	mux.HandleFunc("POST /v1/tokens", s.withAuth(s.upsertToken))
	mux.HandleFunc("POST /v1/tokens/refresh", s.withAuth(s.refreshToken))
	return s.withCORS(mux)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	httpjson.Write(w, http.StatusOK, map[string]any{
		"service": "developer-os-api",
		"status":  "ok",
		"version": "v1",
		"time":    time.Now().UTC(),
	})
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request) {
	ctx := gatewayContext(r)
	payload, err := s.store.GetDashboard(r.Context(), ctx)
	if err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "dashboard_read_failed", err.Error(), nil)
		return
	}

	if err := s.store.SaveDashboardSnapshot(r.Context(), ctx, payload); err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "dashboard_snapshot_write_failed", err.Error(), nil)
		return
	}

	s.write(w, ctx, http.StatusOK, map[string]any{
		"gateway":   "developer-os",
		"dashboard": payload,
	})
}

func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	ctx := gatewayContext(r)
	config, err := s.store.GetUserConfig(r.Context(), ctx)
	if err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "config_read_failed", err.Error(), nil)
		return
	}

	s.write(w, ctx, http.StatusOK, map[string]any{"config": config})
}

func (s *Server) putConfig(w http.ResponseWriter, r *http.Request) {
	ctx := gatewayContext(r)
	var config domain.UserConfig
	if err := httpjson.Read(r, &config); err != nil {
		s.writeError(w, ctx, http.StatusBadRequest, "invalid_payload", "invalid config payload", map[string]any{"cause": err.Error()})
		return
	}

	normalizeConfig(&config, ctx)
	if err := validateConfig(config); err != nil {
		s.writeError(w, ctx, http.StatusBadRequest, "invalid_config", err.Error(), nil)
		return
	}

	if err := s.store.UpsertUserConfig(r.Context(), ctx, config); err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "config_write_failed", err.Error(), nil)
		return
	}

	s.write(w, ctx, http.StatusOK, map[string]any{"persisted": true})
}

func (s *Server) oauthStart(w http.ResponseWriter, r *http.Request) {
	ctx := gatewayContext(r)
	service := domain.Service(r.PathValue("service"))
	if !service.Valid() {
		s.writeError(w, ctx, http.StatusBadRequest, "unsupported_service", "unsupported integration service", map[string]any{"service": service})
		return
	}

	provider, ok := oauth.ProviderFor(service)
	if !ok {
		s.writeError(w, ctx, http.StatusNotFound, "unsupported_service", "unsupported integration service", map[string]any{"service": service})
		return
	}

	redirectURI := strings.TrimSpace(r.URL.Query().Get("redirectUri"))
	if redirectURI == "" {
		s.writeError(w, ctx, http.StatusBadRequest, "invalid_oauth_request", "redirectUri is required", nil)
		return
	}

	if !provider.Configured() {
		s.write(w, ctx, http.StatusOK, map[string]any{
			"service": service,
			"status":  "needs_config",
			"missing": []string{oauthClientIDEnv(service), oauthClientSecretEnv(service)},
		})
		return
	}

	state, err := oauth.SignState(s.oauthStateSecret, oauth.StatePayload{
		Service:     service,
		WorkspaceID: ctx.WorkspaceID,
		UserID:      ctx.UserID,
		RedirectURI: redirectURI,
	})
	if err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "oauth_state_failed", err.Error(), map[string]any{"service": service})
		return
	}

	s.write(w, ctx, http.StatusOK, map[string]any{
		"service":          service,
		"status":           "ready",
		"authorizationUrl": oauth.AuthorizationURL(provider, redirectURI, state),
		"state":            state,
		"scopes":           provider.Scopes,
	})
}

func (s *Server) oauthCallback(w http.ResponseWriter, r *http.Request) {
	requestCtx := gatewayContext(r)
	service := domain.Service(r.PathValue("service"))
	if !service.Valid() {
		s.writeError(w, requestCtx, http.StatusBadRequest, "unsupported_service", "unsupported integration service", map[string]any{"service": service})
		return
	}

	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	if state == "" || code == "" {
		s.writeError(w, requestCtx, http.StatusBadRequest, "invalid_oauth_callback", "code and state are required", nil)
		return
	}

	statePayload, err := oauth.VerifyState(s.oauthStateSecret, state, 10*time.Minute)
	if err != nil {
		s.writeError(w, requestCtx, http.StatusBadRequest, "invalid_oauth_state", err.Error(), nil)
		return
	}

	callbackCtx := domain.GatewayContext{
		WorkspaceID: statePayload.WorkspaceID,
		UserID:      statePayload.UserID,
		RequestID:   requestCtx.RequestID,
	}

	if statePayload.Service != service {
		s.writeError(w, callbackCtx, http.StatusBadRequest, "oauth_service_mismatch", "oauth state service does not match callback service", map[string]any{"expected": statePayload.Service, "actual": service})
		return
	}

	provider, ok := oauth.ProviderFor(service)
	if !ok || !provider.Configured() {
		s.writeError(w, callbackCtx, http.StatusBadRequest, "provider_not_configured", "oauth provider is not configured", map[string]any{"service": service})
		return
	}

	token, err := oauth.ExchangeCode(r.Context(), s.httpClient, provider, code, statePayload.RedirectURI)
	if err != nil {
		s.writeError(w, callbackCtx, http.StatusBadGateway, "oauth_token_exchange_failed", err.Error(), map[string]any{"service": service})
		return
	}

	expiresAt := ""
	if token.ExpiresAt != nil {
		expiresAt = token.ExpiresAt.Format(time.RFC3339)
	}

	if err := s.store.UpsertToken(r.Context(), callbackCtx, domain.TokenUpsertRequest{
		WorkspaceID:       callbackCtx.WorkspaceID,
		Service:           service,
		ProviderAccountID: token.ProviderAccountID,
		AccessToken:       token.AccessToken,
		RefreshToken:      token.RefreshToken,
		ExpiresAt:         expiresAt,
		Scopes:            token.Scopes,
	}); err != nil {
		s.writeError(w, callbackCtx, http.StatusInternalServerError, "token_write_failed", err.Error(), map[string]any{"service": service})
		return
	}

	s.write(w, callbackCtx, http.StatusOK, map[string]any{
		"service":           service,
		"status":            "connected",
		"providerAccountId": token.ProviderAccountID,
		"expiresAt":         nullableString(expiresAt),
		"scopes":            token.Scopes,
	})
}

func (s *Server) sync(w http.ResponseWriter, r *http.Request) {
	ctx := gatewayContext(r)
	var input struct {
		Service domain.Service `json:"service"`
	}
	if err := httpjson.Read(r, &input); err != nil {
		s.writeError(w, ctx, http.StatusBadRequest, "invalid_payload", "invalid sync payload", map[string]any{"cause": err.Error()})
		return
	}

	if !input.Service.Valid() {
		s.writeError(w, ctx, http.StatusBadRequest, "unsupported_service", "unsupported integration service", map[string]any{"service": input.Service})
		return
	}

	connector, ok := s.registry.Get(input.Service)
	if !ok {
		s.writeError(w, ctx, http.StatusNotFound, "unsupported_service", "unsupported integration service", map[string]any{"service": input.Service})
		return
	}

	token, err := s.store.GetToken(r.Context(), ctx, input.Service)
	var tokenRef *domain.ProviderToken
	if err == nil {
		tokenRef = &token
	} else if !errors.Is(err, store.ErrTokenNotFound) {
		s.writeError(w, ctx, http.StatusInternalServerError, "token_read_failed", err.Error(), map[string]any{"service": input.Service})
		return
	}

	result, err := connector.Sync(r.Context(), ctx, tokenRef)
	if err != nil {
		_ = s.store.SaveSyncFailure(r.Context(), ctx, input.Service, err)
		s.writeError(w, ctx, http.StatusBadGateway, "provider_sync_failed", err.Error(), map[string]any{"service": input.Service})
		return
	}

	if err := s.store.SaveWorkEvents(r.Context(), ctx, result.Events); err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "work_event_persist_failed", err.Error(), map[string]any{"service": input.Service})
		return
	}

	if err := s.store.SaveSyncResult(r.Context(), ctx, result); err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "sync_state_persist_failed", err.Error(), map[string]any{"service": input.Service})
		return
	}

	s.write(w, ctx, http.StatusOK, map[string]any{
		"connector": connector.Info(),
		"result":    result,
	})
}

func (s *Server) upsertToken(w http.ResponseWriter, r *http.Request) {
	ctx := gatewayContext(r)
	var input domain.TokenUpsertRequest
	if err := httpjson.Read(r, &input); err != nil {
		s.writeError(w, ctx, http.StatusBadRequest, "invalid_payload", "invalid token payload", map[string]any{"cause": err.Error()})
		return
	}

	normalizeTokenRequest(&input, ctx)
	if err := validateTokenRequest(input); err != nil {
		s.writeError(w, ctx, http.StatusBadRequest, "invalid_token_request", err.Error(), nil)
		return
	}

	if err := s.store.UpsertToken(r.Context(), ctx, input); err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "token_write_failed", err.Error(), map[string]any{"service": input.Service})
		return
	}

	s.write(w, ctx, http.StatusOK, map[string]any{"persisted": true})
}

func (s *Server) refreshToken(w http.ResponseWriter, r *http.Request) {
	ctx := gatewayContext(r)
	var input struct {
		Service domain.Service `json:"service"`
	}
	if err := httpjson.Read(r, &input); err != nil {
		s.writeError(w, ctx, http.StatusBadRequest, "invalid_payload", "invalid refresh payload", map[string]any{"cause": err.Error()})
		return
	}

	if !input.Service.Valid() {
		s.writeError(w, ctx, http.StatusBadRequest, "unsupported_service", "unsupported integration service", map[string]any{"service": input.Service})
		return
	}

	currentToken, err := s.store.GetToken(r.Context(), ctx, input.Service)
	if errors.Is(err, store.ErrTokenNotFound) {
		s.write(w, ctx, http.StatusOK, map[string]any{"service": input.Service, "status": "missing_token"})
		return
	}
	if err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "token_read_failed", err.Error(), map[string]any{"service": input.Service})
		return
	}
	if strings.TrimSpace(currentToken.RefreshToken) == "" {
		s.write(w, ctx, http.StatusOK, map[string]any{"service": input.Service, "status": "missing_refresh_token"})
		return
	}

	provider, ok := oauth.ProviderFor(input.Service)
	if !ok || !provider.Configured() {
		s.writeError(w, ctx, http.StatusBadRequest, "provider_not_configured", "oauth provider is not configured", map[string]any{"service": input.Service})
		return
	}

	refreshedToken, err := oauth.RefreshToken(r.Context(), s.httpClient, provider, currentToken.RefreshToken)
	if err != nil {
		s.writeError(w, ctx, http.StatusBadGateway, "token_refresh_failed", err.Error(), map[string]any{"service": input.Service})
		return
	}

	refreshToken := refreshedToken.RefreshToken
	if refreshToken == "" {
		refreshToken = currentToken.RefreshToken
	}

	providerAccountID := refreshedToken.ProviderAccountID
	if providerAccountID == "" || providerAccountID == "default" {
		providerAccountID = currentToken.ProviderAccountID
	}

	expiresAt := ""
	if refreshedToken.ExpiresAt != nil {
		expiresAt = refreshedToken.ExpiresAt.Format(time.RFC3339)
	}

	if err := s.store.UpsertToken(r.Context(), ctx, domain.TokenUpsertRequest{
		WorkspaceID:       ctx.WorkspaceID,
		Service:           input.Service,
		ProviderAccountID: providerAccountID,
		AccessToken:       refreshedToken.AccessToken,
		RefreshToken:      refreshToken,
		ExpiresAt:         expiresAt,
		Scopes:            refreshedToken.Scopes,
	}); err != nil {
		s.writeError(w, ctx, http.StatusInternalServerError, "token_write_failed", err.Error(), map[string]any{"service": input.Service})
		return
	}

	s.write(w, ctx, http.StatusOK, map[string]any{
		"service":           input.Service,
		"status":            "connected",
		"providerAccountId": providerAccountID,
		"expiresAt":         nullableString(expiresAt),
		"scopes":            refreshedToken.Scopes,
	})
}

func (s *Server) withAuth(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.gatewaySecret == "" {
			handler(w, r)
			return
		}

		expected := "Bearer " + s.gatewaySecret
		if r.Header.Get("authorization") != expected {
			ctx := gatewayContext(r)
			s.writeError(w, ctx, http.StatusUnauthorized, "unauthorized", "unauthorized gateway request", nil)
			return
		}

		handler(w, r)
	}
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("access-control-allow-origin", "*")
		w.Header().Set("access-control-allow-methods", "GET,POST,PUT,OPTIONS")
		w.Header().Set("access-control-allow-headers", "authorization,content-type,x-request-id,x-user-id,x-workspace-id")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func gatewayContext(r *http.Request) domain.GatewayContext {
	return domain.GatewayContext{
		WorkspaceID: headerOrDefault(r, "x-workspace-id", "00000000-0000-4000-8000-000000000001"),
		UserID:      headerOrDefault(r, "x-user-id", "00000000-0000-4000-8000-000000000002"),
		RequestID:   headerOrDefault(r, "x-request-id", requestID()),
	}
}

func headerOrDefault(r *http.Request, key string, fallback string) string {
	value := strings.TrimSpace(r.Header.Get(key))
	if value == "" {
		return fallback
	}
	return value
}

func requestID() string {
	return "req_" + strconv.FormatInt(time.Now().UTC().UnixNano(), 36)
}

func (s *Server) write(w http.ResponseWriter, ctx domain.GatewayContext, status int, data any) {
	w.Header().Set("x-request-id", ctx.RequestID)
	httpjson.Write(w, status, domain.APIResponse{
		Version:   "v1",
		RequestID: ctx.RequestID,
		Context: domain.APIContext{
			WorkspaceID: ctx.WorkspaceID,
			UserID:      ctx.UserID,
		},
		Data: data,
	})
}

func (s *Server) writeError(w http.ResponseWriter, ctx domain.GatewayContext, status int, code string, message string, details map[string]any) {
	w.Header().Set("x-request-id", ctx.RequestID)
	httpjson.Write(w, status, domain.APIResponse{
		Version:   "v1",
		RequestID: ctx.RequestID,
		Context: domain.APIContext{
			WorkspaceID: ctx.WorkspaceID,
			UserID:      ctx.UserID,
		},
		Error: &domain.APIError{
			Code:    code,
			Message: message,
			Details: details,
		},
	})
}

func normalizeConfig(config *domain.UserConfig, ctx domain.GatewayContext) {
	if config.WorkspaceID == "" {
		config.WorkspaceID = ctx.WorkspaceID
	}
	if config.UserID == "" {
		config.UserID = ctx.UserID
	}
}

func validateConfig(config domain.UserConfig) error {
	if config.WorkspaceID == "" || config.UserID == "" {
		return errValidation("workspaceId and userId are required")
	}

	if config.DashboardPreferences.DefaultView == "" {
		return errValidation("dashboardPreferences.defaultView is required")
	}

	for _, service := range config.DashboardPreferences.VisibleSources {
		if !service.Valid() {
			return errValidation("dashboardPreferences.visibleSources contains an unsupported service")
		}
	}

	return nil
}

func normalizeTokenRequest(input *domain.TokenUpsertRequest, ctx domain.GatewayContext) {
	if input.WorkspaceID == "" {
		input.WorkspaceID = ctx.WorkspaceID
	}
}

func validateTokenRequest(input domain.TokenUpsertRequest) error {
	if input.WorkspaceID == "" {
		return errValidation("workspaceId is required")
	}

	if !input.Service.Valid() {
		return errValidation("service is required and must be supported")
	}

	if strings.TrimSpace(input.AccessToken) == "" {
		return errValidation("accessToken is required")
	}

	return nil
}

type validationError string

func (e validationError) Error() string {
	return string(e)
}

func errValidation(message string) error {
	return validationError(message)
}

func oauthClientIDEnv(service domain.Service) string {
	if service == domain.ServiceCalendar {
		return "GOOGLE_CALENDAR_CLIENT_ID"
	}

	return strings.ToUpper(string(service)) + "_CLIENT_ID"
}

func oauthClientSecretEnv(service domain.Service) string {
	if service == domain.ServiceCalendar {
		return "GOOGLE_CALENDAR_CLIENT_SECRET"
	}

	return strings.ToUpper(string(service)) + "_CLIENT_SECRET"
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}

	return value
}
