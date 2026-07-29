package oauth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/developer-os/api/internal/domain"
)

type StatePayload struct {
	Service     domain.Service `json:"service"`
	WorkspaceID string         `json:"workspaceId"`
	UserID      string         `json:"userId"`
	RedirectURI string         `json:"redirectUri"`
	Nonce       string         `json:"nonce"`
	IssuedAt    time.Time      `json:"issuedAt"`
}

func SignState(secret string, payload StatePayload) (string, error) {
	if secret == "" {
		secret = "local-dev-oauth-state-secret"
	}

	if payload.Nonce == "" {
		nonce, err := nonce()
		if err != nil {
			return "", err
		}
		payload.Nonce = nonce
	}
	if payload.IssuedAt.IsZero() {
		payload.IssuedAt = time.Now().UTC()
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	encodedPayload := base64.RawURLEncoding.EncodeToString(raw)
	signature := sign(secret, encodedPayload)

	return encodedPayload + "." + signature, nil
}

func VerifyState(secret string, state string, maxAge time.Duration) (StatePayload, error) {
	if secret == "" {
		secret = "local-dev-oauth-state-secret"
	}

	parts := strings.Split(state, ".")
	if len(parts) != 2 {
		return StatePayload{}, errors.New("invalid oauth state")
	}

	expected := sign(secret, parts[0])
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return StatePayload{}, errors.New("invalid oauth state signature")
	}

	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return StatePayload{}, err
	}

	var payload StatePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return StatePayload{}, err
	}

	if payload.IssuedAt.IsZero() || time.Since(payload.IssuedAt) > maxAge {
		return StatePayload{}, errors.New("oauth state expired")
	}

	return payload, nil
}

func sign(secret string, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func nonce() (string, error) {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(bytes), nil
}
