package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type TokenResponse struct {
	AccessToken       string     `json:"accessToken"`
	RefreshToken      string     `json:"refreshToken,omitempty"`
	ExpiresAt         *time.Time `json:"expiresAt,omitempty"`
	Scopes            []string   `json:"scopes"`
	ProviderAccountID string     `json:"providerAccountId,omitempty"`
}

type providerTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
	BotUserID    string `json:"bot_user_id"`
	AuthedUser   struct {
		ID string `json:"id"`
	} `json:"authed_user"`
	WorkspaceID string `json:"workspace_id"`
	Owner       struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	} `json:"owner"`
}

func AuthorizationURL(provider Provider, redirectURI string, state string) string {
	values := url.Values{}
	values.Set("client_id", provider.ClientID)
	values.Set("redirect_uri", redirectURI)
	values.Set("state", state)
	values.Set("response_type", "code")
	if len(provider.Scopes) > 0 {
		values.Set("scope", strings.Join(provider.Scopes, " "))
	}
	if provider.Service == "calendar" {
		values.Set("access_type", "offline")
		values.Set("prompt", "consent")
	}

	return provider.AuthURL + "?" + values.Encode()
}

func ExchangeCode(ctx context.Context, client *http.Client, provider Provider, code string, redirectURI string) (TokenResponse, error) {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("client_id", provider.ClientID)
	form.Set("client_secret", provider.ClientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, provider.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return TokenResponse{}, err
	}
	req.Header.Set("content-type", "application/x-www-form-urlencoded")
	req.Header.Set("accept", "application/json")

	res, err := client.Do(req)
	if err != nil {
		return TokenResponse{}, err
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		return TokenResponse{}, errors.New(res.Status)
	}

	var providerResponse providerTokenResponse
	if err := json.NewDecoder(res.Body).Decode(&providerResponse); err != nil {
		return TokenResponse{}, err
	}

	if providerResponse.AccessToken == "" {
		return TokenResponse{}, errors.New("provider response did not include access token")
	}

	var expiresAt *time.Time
	if providerResponse.ExpiresIn > 0 {
		expires := time.Now().UTC().Add(time.Duration(providerResponse.ExpiresIn) * time.Second)
		expiresAt = &expires
	}

	return TokenResponse{
		AccessToken:       providerResponse.AccessToken,
		RefreshToken:      providerResponse.RefreshToken,
		ExpiresAt:         expiresAt,
		Scopes:            responseScopes(providerResponse.Scope, provider.Scopes),
		ProviderAccountID: providerAccountID(providerResponse),
	}, nil
}

func RefreshToken(ctx context.Context, client *http.Client, provider Provider, refreshToken string) (TokenResponse, error) {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	if strings.TrimSpace(refreshToken) == "" {
		return TokenResponse{}, errors.New("refresh token is required")
	}

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", provider.ClientID)
	form.Set("client_secret", provider.ClientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, provider.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return TokenResponse{}, err
	}
	req.Header.Set("content-type", "application/x-www-form-urlencoded")
	req.Header.Set("accept", "application/json")

	res, err := client.Do(req)
	if err != nil {
		return TokenResponse{}, err
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		return TokenResponse{}, errors.New(res.Status)
	}

	var providerResponse providerTokenResponse
	if err := json.NewDecoder(res.Body).Decode(&providerResponse); err != nil {
		return TokenResponse{}, err
	}
	if providerResponse.AccessToken == "" {
		return TokenResponse{}, errors.New("provider response did not include access token")
	}

	var expiresAt *time.Time
	if providerResponse.ExpiresIn > 0 {
		expires := time.Now().UTC().Add(time.Duration(providerResponse.ExpiresIn) * time.Second)
		expiresAt = &expires
	}

	return TokenResponse{
		AccessToken:       providerResponse.AccessToken,
		RefreshToken:      providerResponse.RefreshToken,
		ExpiresAt:         expiresAt,
		Scopes:            responseScopes(providerResponse.Scope, provider.Scopes),
		ProviderAccountID: providerAccountID(providerResponse),
	}, nil
}

func responseScopes(scope string, fallback []string) []string {
	if strings.TrimSpace(scope) == "" {
		return fallback
	}

	return strings.Fields(scope)
}

func providerAccountID(response providerTokenResponse) string {
	switch {
	case response.AuthedUser.ID != "":
		return response.AuthedUser.ID
	case response.BotUserID != "":
		return response.BotUserID
	case response.WorkspaceID != "":
		return response.WorkspaceID
	case response.Owner.User.ID != "":
		return response.Owner.User.ID
	default:
		return "default"
	}
}
