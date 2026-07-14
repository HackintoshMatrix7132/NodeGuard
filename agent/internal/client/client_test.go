package client

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

func TestRegisterDoesNotSendAgentAuthorization(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/agent/register" || request.Header.Get("Authorization") != "" {
			t.Fatalf("unexpected registration request: %s auth=%q", request.URL.Path, request.Header.Get("Authorization"))
		}
		_ = json.NewEncoder(response).Encode(model.RegistrationResponse{
			AgentID: "new-agent", Credential: "new-secret", DisplayName: "test",
			HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60, InventoryIntervalSeconds: 3600,
		})
	}))
	defer server.Close()
	response, err := Register(context.Background(), server.URL, model.RegistrationRequest{
		EnrollmentToken: "join-token", Hostname: "host", AgentVersion: "test",
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.AgentID != "new-agent" || response.Credential != "new-secret" {
		t.Fatal("registration response was not decoded")
	}
}

func TestOversizedRequestIsRejectedBeforeSending(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests++
		response.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	api := New(config.Config{ServerURL: server.URL, AgentID: "agent-id", Credential: "agent-secret"})
	err := api.Post(context.Background(), "/api/agent/updates", map[string]string{"payload": strings.Repeat("x", maxRequestBodyBytes)})
	if !errors.Is(err, ErrRequestBodyTooLarge) {
		t.Fatalf("oversized request error = %v", err)
	}
	if requests != 0 {
		t.Fatal("oversized request reached the network")
	}
}

func TestAuthenticatedRequestHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer agent-secret" {
			t.Errorf("authorization header was not set")
		}
		if request.Header.Get("X-NodeGuard-Agent-ID") != "agent-id" {
			t.Errorf("agent ID header was not set")
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()
	api := New(config.Config{ServerURL: server.URL, AgentID: "agent-id", Credential: "agent-secret"})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := api.Post(ctx, "/api/agent/heartbeat", map[string]any{"timestamp": time.Now()}); err != nil {
		t.Fatal(err)
	}
}
