package main

import (
	"log"
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
	})

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("Developer OS API gateway listening on %s", addr)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
