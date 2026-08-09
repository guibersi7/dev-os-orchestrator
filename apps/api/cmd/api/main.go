package main

import (
	"bufio"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/developer-os/api/internal/gateway"
	"github.com/developer-os/api/internal/integrations"
	"github.com/developer-os/api/internal/store"
)

func main() {
	loadLocalEnv()

	addr := env("API_ADDR", ":8080")

	registry := integrations.NewRegistry()
	persistence := store.NewFromEnv()
	server := gateway.NewServer(gateway.Config{
		Registry:         registry,
		Store:            persistence,
		GatewaySecret:    os.Getenv("API_GATEWAY_SECRET"),
		OAuthStateSecret: os.Getenv("OAUTH_STATE_SECRET"),
		AgentBaseURL:     os.Getenv("AGENT_BASE_URL"),
		AgentSecret:      os.Getenv("AGENT_SERVICE_SECRET"),
		Logger:           slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	})

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("Developer OS API gateway listening", "addr", addr)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("Developer OS API gateway stopped", "error", err)
		os.Exit(1)
	}
}

func loadLocalEnv() {
	paths := []string{
		".env",
		"../../.env",
		"../web/.env",
		"../web/.env.local",
		"apps/api/.env",
		"apps/web/.env",
		"apps/web/.env.local",
	}

	loaded := map[string]bool{}
	for _, path := range paths {
		cleanPath := filepath.Clean(path)
		if loaded[cleanPath] {
			continue
		}
		loaded[cleanPath] = true
		_ = loadEnvFile(cleanPath)
	}
}

func loadEnvFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(strings.TrimPrefix(key, "export "))
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		if key == "" || os.Getenv(key) != "" {
			continue
		}
		_ = os.Setenv(key, value)
	}

	return scanner.Err()
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
