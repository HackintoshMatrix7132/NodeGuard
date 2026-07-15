package client

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

func TestRegisterDoesNotSendAgentAuthorization(t *testing.T) {
	var received model.RegistrationRequest
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/agent/register" || request.Header.Get("Authorization") != "" {
			t.Fatalf("unexpected registration request: %s auth=%q", request.URL.Path, request.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(request.Body).Decode(&received); err != nil {
			t.Fatal(err)
		}
		_ = json.NewEncoder(response).Encode(model.RegistrationResponse{
			AgentID: "new-agent", Credential: "new-secret", DisplayName: "test",
			HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60, InventoryIntervalSeconds: 3600,
		})
	}))
	defer server.Close()
	response, err := Register(context.Background(), server.URL, model.RegistrationRequest{
		EnrollmentToken: "join-token", MachineIdentity: "78c1d45d-ddd3-4b12-9bf7-7da129950502",
		ReplaceExisting: true, Hostname: "host", AgentVersion: "test",
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.AgentID != "new-agent" || response.Credential != "new-secret" {
		t.Fatal("registration response was not decoded")
	}
	if received.MachineIdentity != "78c1d45d-ddd3-4b12-9bf7-7da129950502" || !received.ReplaceExisting {
		t.Fatalf("stable identity contract missing: %#v", received)
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

func TestGenerateCredentialFormatAndUniqueness(t *testing.T) {
	pattern := regexp.MustCompile(`^ng_agent_[A-Za-z0-9_-]{43}$`)
	seen := map[string]bool{}
	for index := 0; index < 32; index++ {
		credential, err := GenerateCredential()
		if err != nil {
			t.Fatal(err)
		}
		if !pattern.MatchString(credential) || seen[credential] {
			t.Fatalf("invalid or duplicate credential: %q", credential)
		}
		seen[credential] = true
	}
}

func TestRegisterRetriesAmbiguousResponseWithSameRequestedCredential(t *testing.T) {
	requests := 0
	credentials := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests++
		var payload model.RegistrationRequest
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		credentials = append(credentials, payload.RequestedCredential)
		if requests == 1 {
			hijacker, ok := response.(http.Hijacker)
			if !ok {
				t.Fatal("test server cannot simulate lost response")
			}
			connection, _, err := hijacker.Hijack()
			if err != nil {
				t.Fatal(err)
			}
			_ = connection.Close()
			return
		}
		_ = json.NewEncoder(response).Encode(model.RegistrationResponse{
			AgentID: "agent", Credential: payload.RequestedCredential, DisplayName: "test",
		})
	}))
	defer server.Close()
	credential, err := GenerateCredential()
	if err != nil {
		t.Fatal(err)
	}
	response, err := Register(context.Background(), server.URL, model.RegistrationRequest{
		EnrollmentToken: "token", RequestedCredential: credential, MachineIdentity: "78c1d45d-ddd3-4b12-9bf7-7da129950502",
	})
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || len(credentials) != 2 || credentials[0] != credential || credentials[1] != credential || response.Credential != credential {
		t.Fatalf("registration replay changed credential: requests=%d credentials=%v response=%#v", requests, credentials, response)
	}
}

func TestRegisterRetriesServerFailureButNotDefinitiveClientFailure(t *testing.T) {
	for _, testCase := range []struct {
		firstStatus int
		wantCalls   int
	}{
		{http.StatusServiceUnavailable, 2},
		{http.StatusBadRequest, 1},
	} {
		t.Run(fmt.Sprintf("status-%d", testCase.firstStatus), func(t *testing.T) {
			calls := 0
			credential, _ := GenerateCredential()
			server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				calls++
				if calls == 1 {
					response.WriteHeader(testCase.firstStatus)
					return
				}
				_ = json.NewEncoder(response).Encode(model.RegistrationResponse{AgentID: "agent", Credential: credential})
			}))
			defer server.Close()
			_, _ = Register(context.Background(), server.URL, model.RegistrationRequest{RequestedCredential: credential})
			if calls != testCase.wantCalls {
				t.Fatalf("requests=%d, want %d", calls, testCase.wantCalls)
			}
		})
	}
}

func TestRegisterRejectsCredentialMismatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		_ = json.NewEncoder(response).Encode(model.RegistrationResponse{AgentID: "agent", Credential: "ng_agent_wrong"})
	}))
	defer server.Close()
	credential, _ := GenerateCredential()
	if _, err := Register(context.Background(), server.URL, model.RegistrationRequest{RequestedCredential: credential}); err == nil {
		t.Fatal("mismatched response credential was accepted")
	}
}
