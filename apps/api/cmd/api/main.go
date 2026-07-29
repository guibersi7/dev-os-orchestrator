package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/developer-os/api/internal/gateway"
	"github.com/developer-os/api/internal/integrations"
	"github.com/developer-os/api/internal/store"
)

func main() {
	addr := env("API_ADDR", ":8080")

	registry := integrations.NewRegistry()
	persistence := store.NewFromEnv()
	server := gateway.NewServer(gateway.Config{
		Registry:         registry,
		Store:            persistence,
		GatewaySecret:    os.Getenv("API_GATEWAY_SECRET"),
		OAuthStateSecret: os.Getenv("OAUTH_STATE_SECRET"),
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

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
