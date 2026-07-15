package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/identity"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

func testApplication() (*application, *bytes.Buffer, *bytes.Buffer) {
	stdout := &bytes.Buffer{}
	stderr := &bytes.Buffer{}
	return &application{stdout: stdout, stderr: stderr, input: bytes.NewBufferString("no\n")}, stdout, stderr
}

func responseFor(agentID, credential string) model.RegistrationResponse {
	return model.RegistrationResponse{
		AgentID: agentID, Credential: credential, DisplayName: "Test machine",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
	}
}

func TestHelpAndVersionAreUseful(t *testing.T) {
	app, stdout, _ := testApplication()
	if code := app.execute([]string{"--help"}); code != exitSuccess {
		t.Fatalf("help exit code=%d", code)
	}
	for _, expected := range []string{"doctor", "re-enroll", "uninstall", config.DefaultPath, identity.DefaultStateDir, "Exit codes"} {
		if !strings.Contains(stdout.String(), expected) {
			t.Fatalf("help missing %q", expected)
		}
	}
	stdout.Reset()
	if code := app.execute([]string{"version"}); code != exitSuccess {
		t.Fatalf("version exit code=%d", code)
	}
	for _, expected := range []string{"NodeGuard Agent", "Version:", "Commit:", "Built:", "Go:", "Platform: linux/"} {
		if !strings.Contains(stdout.String(), expected) {
			t.Fatalf("version missing %q", expected)
		}
	}
}

func TestSubcommandHelp(t *testing.T) {
	for _, command := range []string{"status", "doctor", "config", "enroll", "re-enroll", "uninstall"} {
		app, stdout, stderr := testApplication()
		if code := app.execute([]string{"help", command}); code != exitSuccess {
			t.Fatalf("help %s exit=%d", command, code)
		}
		if !strings.Contains(stdout.String()+stderr.String(), "Usage:") {
			t.Fatalf("help %s missing usage: stdout=%q stderr=%q", command, stdout.String(), stderr.String())
		}
	}
}

func TestInvalidFlagsAndTrailingArgumentsUseExitTwo(t *testing.T) {
	commands := [][]string{
		{"run", "unexpected"},
		{"status", "unexpected"},
		{"doctor", "unexpected"},
		{"config", "show", "unexpected"},
		{"identity", "ensure", "unexpected"},
		{"uninstall", "unexpected"},
		{"status", "--not-a-real-option"},
	}
	for _, command := range commands {
		app, _, stderr := testApplication()
		if code := app.execute(command); code != exitInvalid {
			t.Fatalf("%v exit=%d, want %d; stderr=%s", command, code, exitInvalid, stderr.String())
		}
	}
}

func TestPurgeRejectsPipedInputWithoutYes(t *testing.T) {
	stdout := &bytes.Buffer{}
	stderr := &bytes.Buffer{}
	app := &application{
		stdout: stdout,
		stderr: stderr,
		openTerminal: func() (readWriteCloser, error) {
			return nil, errors.New("no controlling terminal")
		},
	}
	code := app.execute([]string{"uninstall", "--purge"})
	if code != exitInvalid {
		t.Fatalf("piped purge exit=%d, want %d; stdout=%s stderr=%s", code, exitInvalid, stdout.String(), stderr.String())
	}
	if !strings.Contains(stderr.String(), "--purge --yes") {
		t.Fatalf("piped purge error was not actionable: %s", stderr.String())
	}
}

func TestConfigShowRedactsCredential(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "config.json")
	cfg := config.Config{
		ServerURL: "http://127.0.0.1:3000", AgentID: "agent-identifier-123", Credential: "never-print-this-secret",
		DisplayName: "Test", HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30,
		DockerIntervalSeconds: 60, InventoryIntervalSeconds: 3600,
		UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds, DockerEnabled: true,
	}
	if err := config.Save(path, cfg); err != nil {
		t.Fatal(err)
	}
	app, stdout, stderr := testApplication()
	if code := app.execute([]string{"config", "show", "--config", path}); code != exitSuccess {
		t.Fatalf("config show exit=%d stderr=%s", code, stderr.String())
	}
	if strings.Contains(stdout.String(), cfg.Credential) || !strings.Contains(stdout.String(), "[REDACTED]") {
		t.Fatalf("credential was not safely redacted: %s", stdout.String())
	}
}

func TestStatusMissingConfigurationUsesDocumentedExitCode(t *testing.T) {
	app, stdout, _ := testApplication()
	code := app.execute([]string{"status", "--json", "--config", filepath.Join(t.TempDir(), "missing.json")})
	if code != exitNotEnrolled {
		t.Fatalf("status exit=%d, want %d", code, exitNotEnrolled)
	}
	if !strings.Contains(stdout.String(), `"enrollment":"Not enrolled"`) {
		t.Fatalf("unexpected status output: %s", stdout.String())
	}
}

func TestStatusReportsBackendConnectionState(t *testing.T) {
	for _, state := range []string{"online", "stale", "offline"} {
		t.Run(state, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				_ = json.NewEncoder(writer).Encode(model.AgentStatus{
					ID: "agent-id", DisplayName: "Test", Status: state, CredentialStatus: "active",
				})
			}))
			defer server.Close()
			configPath := filepath.Join(t.TempDir(), "etc", "config.json")
			if err := config.Save(configPath, config.Config{
				ServerURL: server.URL, AgentID: "agent-id", Credential: "protected-test-credential",
				DisplayName: "Test", HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30,
				DockerIntervalSeconds: 60, InventoryIntervalSeconds: 3600,
				UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
			}); err != nil {
				t.Fatal(err)
			}
			app, stdout, stderr := testApplication()
			if code := app.execute([]string{"status", "--config", configPath}); code != exitSuccess {
				t.Fatalf("status exit=%d stderr=%s", code, stderr.String())
			}
			expected := normalizedConnectionStatus(state)
			if !strings.Contains(stdout.String(), "Connection       "+expected) {
				t.Fatalf("status did not report %s: %s", expected, stdout.String())
			}

			app, stdout, stderr = testApplication()
			if code := app.execute([]string{"status", "--json", "--config", configPath}); code != exitSuccess {
				t.Fatalf("JSON status exit=%d stderr=%s", code, stderr.String())
			}
			if !strings.Contains(stdout.String(), `"connection":"`+expected+`"`) {
				t.Fatalf("JSON status did not report %s: %s", expected, stdout.String())
			}
		})
	}
}

func TestEnrollCreatesIdentityAndNeverPrintsSecrets(t *testing.T) {
	var request model.RegistrationRequest
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, httpRequest *http.Request) {
		if httpRequest.URL.Path != "/api/agent/register" {
			http.NotFound(writer, httpRequest)
			return
		}
		if err := json.NewDecoder(httpRequest.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		_ = json.NewEncoder(writer).Encode(responseFor("agent-test-id", request.RequestedCredential))
	}))
	defer server.Close()

	directory := t.TempDir()
	configPath := filepath.Join(directory, "etc", "config.json")
	stateDir := filepath.Join(directory, "state")
	app, stdout, stderr := testApplication()
	code := app.execute([]string{"enroll", "--server", server.URL, "--token", "join-token-secret", "--config", configPath, "--state-dir", stateDir})
	if code != exitSuccess {
		t.Fatalf("enroll exit=%d stderr=%s", code, stderr.String())
	}
	if request.MachineIdentity == "" || request.ReplaceExisting {
		t.Fatalf("unexpected registration request: %#v", request)
	}
	if stored, err := identity.Load(stateDir); err != nil || stored != request.MachineIdentity {
		t.Fatalf("stable identity mismatch: stored=%q err=%v", stored, err)
	}
	combined := stdout.String() + stderr.String()
	for _, secret := range []string{"join-token-secret", request.RequestedCredential} {
		if strings.Contains(combined, secret) {
			t.Fatalf("secret %q leaked in output", secret)
		}
	}
}

func TestReEnrollPreservesIdentityAndRequestsExactReplacement(t *testing.T) {
	var registration model.RegistrationRequest
	claimedIdentity := ""
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/agent/heartbeat":
			var heartbeat model.Heartbeat
			if err := json.NewDecoder(request.Body).Decode(&heartbeat); err != nil {
				t.Fatal(err)
			}
			claimedIdentity = heartbeat.MachineIdentity
			writer.WriteHeader(http.StatusNoContent)
		case "/api/agent/register":
			if err := json.NewDecoder(request.Body).Decode(&registration); err != nil {
				t.Fatal(err)
			}
			_ = json.NewEncoder(writer).Encode(responseFor("same-agent-record", registration.RequestedCredential))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	directory := t.TempDir()
	configPath := filepath.Join(directory, "etc", "config.json")
	stateDir := filepath.Join(directory, "state")
	machineIdentity, _, err := identity.Ensure(stateDir)
	if err != nil {
		t.Fatal(err)
	}
	old := config.Config{
		ServerURL: server.URL, AgentID: "same-agent-record", Credential: "stale-credential", DisplayName: "Test machine",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds, DockerEnabled: true,
	}
	if err := config.Save(configPath, old); err != nil {
		t.Fatal(err)
	}
	app, stdout, stderr := testApplication()
	code := app.execute([]string{"re-enroll", "--token", "replacement-token", "--replace-existing", "--config", configPath, "--state-dir", stateDir})
	if code != exitSuccess {
		t.Fatalf("re-enroll exit=%d stderr=%s", code, stderr.String())
	}
	if claimedIdentity != machineIdentity || registration.MachineIdentity != machineIdentity || !registration.ReplaceExisting {
		t.Fatalf("identity replacement contract not preserved: claim=%q registration=%#v", claimedIdentity, registration)
	}
	loaded, err := config.Load(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Credential != registration.RequestedCredential || !strings.HasPrefix(loaded.Credential, "ng_agent_") {
		t.Fatal("new credential was not saved")
	}
	combined := stdout.String() + stderr.String()
	for _, secret := range []string{"replacement-token", "stale-credential", registration.RequestedCredential} {
		if strings.Contains(combined, secret) {
			t.Fatalf("secret %q leaked in output", secret)
		}
	}
}

func TestReEnrollVerifiesNewCredentialHeartbeat(t *testing.T) {
	for _, testCase := range []struct {
		name        string
		onlineAfter int
		timeout     time.Duration
		wantExit    int
	}{
		{name: "online", onlineAfter: 2, timeout: 250 * time.Millisecond, wantExit: exitSuccess},
		{name: "timeout", onlineAfter: 1_000_000, timeout: 25 * time.Millisecond, wantExit: exitNetwork},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var registration model.RegistrationRequest
			statusRequests := 0
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				switch request.URL.Path {
				case "/api/agent/heartbeat":
					writer.WriteHeader(http.StatusNoContent)
				case "/api/agent/register":
					if err := json.NewDecoder(request.Body).Decode(&registration); err != nil {
						http.Error(writer, "invalid registration", http.StatusBadRequest)
						return
					}
					_ = json.NewEncoder(writer).Encode(responseFor("same-agent-record", registration.RequestedCredential))
				case "/api/agent/status":
					statusRequests++
					if request.Header.Get("Authorization") != "Bearer "+registration.RequestedCredential {
						writer.WriteHeader(http.StatusUnauthorized)
						return
					}
					state := "offline"
					if statusRequests >= testCase.onlineAfter {
						state = "online"
					}
					_ = json.NewEncoder(writer).Encode(model.AgentStatus{
						ID: "same-agent-record", DisplayName: "Test machine", Status: state, CredentialStatus: "active",
					})
				default:
					http.NotFound(writer, request)
				}
			}))
			defer server.Close()

			directory := t.TempDir()
			configPath := filepath.Join(directory, "etc", "config.json")
			stateDir := filepath.Join(directory, "state")
			if _, _, err := identity.Ensure(stateDir); err != nil {
				t.Fatal(err)
			}
			old := config.Config{
				ServerURL: server.URL, AgentID: "same-agent-record", Credential: "old-credential", DisplayName: "Test machine",
				HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
				InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
			}
			if err := config.Save(configPath, old); err != nil {
				t.Fatal(err)
			}

			app, stdout, stderr := testApplication()
			serviceActive := true
			systemdCalls := []string{}
			app.unitInstalled = func() bool { return true }
			app.serviceActive = func() bool { return serviceActive }
			app.systemctl = func(args ...string) error {
				systemdCalls = append(systemdCalls, strings.Join(args, " "))
				switch args[0] {
				case "stop":
					serviceActive = false
				case "start", "restart":
					serviceActive = true
				}
				return nil
			}
			app.onlineTimeout = testCase.timeout
			app.onlinePollingInterval = 2 * time.Millisecond
			code := app.execute([]string{"re-enroll", "--token", "replacement-token", "--replace-existing", "--config", configPath, "--state-dir", stateDir})
			if code != testCase.wantExit {
				t.Fatalf("re-enroll exit=%d, want %d; stderr=%s", code, testCase.wantExit, stderr.String())
			}
			if strings.Join(systemdCalls, ",") != "stop nodeguard-agent.service,restart nodeguard-agent.service" {
				t.Fatalf("unexpected service recovery calls: %#v", systemdCalls)
			}
			loaded, err := config.Load(configPath)
			if err != nil {
				t.Fatal(err)
			}
			if loaded.Credential != registration.RequestedCredential || loaded.Credential == old.Credential {
				t.Fatal("committed new credential was not retained")
			}
			if statusRequests == 0 {
				t.Fatal("new credential status was not verified")
			}
			combined := stdout.String() + stderr.String()
			for _, secret := range []string{"replacement-token", "old-credential", registration.RequestedCredential} {
				if strings.Contains(combined, secret) {
					t.Fatalf("secret %q leaked in output", secret)
				}
			}
			if testCase.wantExit == exitNetwork && !strings.Contains(stderr.String(), "did not observe an Online heartbeat") {
				t.Fatalf("timeout recovery was not actionable: %s", stderr.String())
			}
		})
	}
}

func TestReEnrollAbortsBeforeRegistrationWhenIdentityBindingIsUnsafe(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		status   int
		apiCode  string
		wantExit int
	}{
		{name: "identity-conflict", status: http.StatusConflict, apiCode: "machine_identity_conflict", wantExit: exitAuthentication},
		{name: "identity-mismatch", status: http.StatusConflict, apiCode: "machine_identity_mismatch", wantExit: exitAuthentication},
		{name: "unknown-unauthorized", status: http.StatusUnauthorized, apiCode: "proxy_auth_required", wantExit: exitAuthentication},
		{name: "blank-forbidden", status: http.StatusForbidden, apiCode: "", wantExit: exitAuthentication},
		{name: "backend-unavailable", status: http.StatusServiceUnavailable, apiCode: "internal_error", wantExit: exitNetwork},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var heartbeatRequests atomic.Int32
			var registrationRequests atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				switch request.URL.Path {
				case "/api/agent/heartbeat":
					heartbeatRequests.Add(1)
					writer.Header().Set("Content-Type", "application/json")
					writer.WriteHeader(testCase.status)
					_ = json.NewEncoder(writer).Encode(map[string]string{
						"error": testCase.apiCode, "message": "unsafe backend detail containing old-credential",
					})
				case "/api/agent/register":
					registrationRequests.Add(1)
					writer.WriteHeader(http.StatusInternalServerError)
				default:
					http.NotFound(writer, request)
				}
			}))
			defer server.Close()

			directory := t.TempDir()
			configPath := filepath.Join(directory, "etc", "config.json")
			stateDir := filepath.Join(directory, "state")
			machineIdentity, _, err := identity.Ensure(stateDir)
			if err != nil {
				t.Fatal(err)
			}
			old := config.Config{
				ServerURL: server.URL, AgentID: "agent-a", Credential: "old-credential", DisplayName: "Agent A",
				HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
				InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
			}
			if err := config.Save(configPath, old); err != nil {
				t.Fatal(err)
			}
			app, stdout, stderr := testApplication()
			code := app.execute([]string{"re-enroll", "--token", "unused-enrollment-token", "--replace-existing", "--config", configPath, "--state-dir", stateDir})
			if code != testCase.wantExit {
				t.Fatalf("re-enroll exit=%d, want %d; stderr=%s", code, testCase.wantExit, stderr.String())
			}
			if heartbeatRequests.Load() != 1 || registrationRequests.Load() != 0 {
				t.Fatalf("unsafe binding consumed enrollment path: heartbeat=%d registration=%d", heartbeatRequests.Load(), registrationRequests.Load())
			}
			loaded, err := config.Load(configPath)
			if err != nil || loaded.Credential != old.Credential || loaded.AgentID != old.AgentID {
				t.Fatalf("old registration changed: loaded=%#v err=%v", loaded, err)
			}
			if preserved, err := identity.Load(stateDir); err != nil || preserved != machineIdentity {
				t.Fatalf("stable identity changed: %q err=%v", preserved, err)
			}
			combined := stdout.String() + stderr.String()
			for _, secret := range []string{"unused-enrollment-token", "old-credential", "unsafe backend detail"} {
				if strings.Contains(combined, secret) {
					t.Fatalf("secret %q leaked in output", secret)
				}
			}
			if !strings.Contains(stderr.String(), "no enrollment request was sent and no credentials were changed") {
				t.Fatalf("failure was not safely actionable: %s", stderr.String())
			}
		})
	}
}

func TestReEnrollContinuesWhenOldCredentialIsDefinitivelyRejected(t *testing.T) {
	var registrationRequests atomic.Int32
	var registration model.RegistrationRequest
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/agent/heartbeat":
			writer.Header().Set("Content-Type", "application/json")
			writer.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(writer).Encode(map[string]string{"error": "invalid_agent_credentials"})
		case "/api/agent/register":
			registrationRequests.Add(1)
			if err := json.NewDecoder(request.Body).Decode(&registration); err != nil {
				http.Error(writer, "invalid registration", http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(writer).Encode(responseFor("recovered-agent", registration.RequestedCredential))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()
	directory := t.TempDir()
	configPath := filepath.Join(directory, "etc", "config.json")
	stateDir := filepath.Join(directory, "state")
	if _, _, err := identity.Ensure(stateDir); err != nil {
		t.Fatal(err)
	}
	if err := config.Save(configPath, config.Config{
		ServerURL: server.URL, AgentID: "deleted-agent", Credential: "rejected-old-credential", DisplayName: "Recovered",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
	}); err != nil {
		t.Fatal(err)
	}
	app, _, stderr := testApplication()
	if code := app.execute([]string{"re-enroll", "--token", "fresh-token", "--replace-existing", "--config", configPath, "--state-dir", stateDir}); code != exitSuccess {
		t.Fatalf("recovery exit=%d stderr=%s", code, stderr.String())
	}
	if registrationRequests.Load() != 1 || !registration.ReplaceExisting {
		t.Fatalf("recovery registration was not sent safely: %#v", registration)
	}
}

func TestReEnrollAfterNormalUninstallUsesPreservedIdentity(t *testing.T) {
	var registration model.RegistrationRequest
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/agent/register" {
			http.NotFound(writer, request)
			return
		}
		if err := json.NewDecoder(request.Body).Decode(&registration); err != nil {
			t.Fatal(err)
		}
		_ = json.NewEncoder(writer).Encode(responseFor("reclaimed-agent", registration.RequestedCredential))
	}))
	defer server.Close()
	directory := t.TempDir()
	stateDir := filepath.Join(directory, "state")
	preserved, _, err := identity.Ensure(stateDir)
	if err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(directory, "removed-config", "config.json")
	app, _, stderr := testApplication()
	code := app.execute([]string{"re-enroll", "--server", server.URL, "--token", "fresh-token", "--replace-existing", "--config", configPath, "--state-dir", stateDir})
	if code != exitSuccess {
		t.Fatalf("re-enroll after uninstall exit=%d stderr=%s", code, stderr.String())
	}
	if registration.MachineIdentity != preserved || !registration.ReplaceExisting {
		t.Fatalf("preserved identity was not reclaimed: %#v", registration)
	}
	if _, err := config.Load(configPath); err != nil {
		t.Fatalf("new credential was not installed: %v", err)
	}
}

func TestReEnrollFailurePreservesOldCredentialAndIdentity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/api/agent/heartbeat" {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusUnauthorized)
		_, _ = writer.Write([]byte(`{"error":"invalid_enrollment_token","message":"invalid"}`))
	}))
	defer server.Close()
	directory := t.TempDir()
	configPath := filepath.Join(directory, "etc", "config.json")
	stateDir := filepath.Join(directory, "state")
	machineIdentity, _, err := identity.Ensure(stateDir)
	if err != nil {
		t.Fatal(err)
	}
	old := config.Config{
		ServerURL: server.URL, AgentID: "agent", Credential: "credential-that-must-survive", DisplayName: "Test",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
	}
	if err := config.Save(configPath, old); err != nil {
		t.Fatal(err)
	}
	app, stdout, stderr := testApplication()
	code := app.execute([]string{"re-enroll", "--token", "bad-token", "--replace-existing", "--config", configPath, "--state-dir", stateDir})
	if code != exitAuthentication {
		t.Fatalf("re-enroll exit=%d, want %d", code, exitAuthentication)
	}
	loaded, err := config.Load(configPath)
	if err != nil || loaded.Credential != old.Credential {
		t.Fatalf("old credential was not preserved: cfg=%#v err=%v", loaded, err)
	}
	if after, err := identity.Load(stateDir); err != nil || after != machineIdentity {
		t.Fatalf("identity changed: %q err=%v", after, err)
	}
	combined := stdout.String() + stderr.String()
	if strings.Contains(combined, "bad-token") || strings.Contains(combined, old.Credential) {
		t.Fatal("secret leaked during failed re-enrollment")
	}
}

func TestEnrollmentPreflightFailsBeforeNetwork(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests++
		writer.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	directory := t.TempDir()
	blocker := filepath.Join(directory, "not-a-directory")
	if err := os.WriteFile(blocker, []byte("blocked"), 0o600); err != nil {
		t.Fatal(err)
	}
	app, _, _ := testApplication()
	code := app.execute([]string{"enroll", "--server", server.URL, "--token", "token", "--config", filepath.Join(blocker, "config.json"), "--state-dir", filepath.Join(directory, "state")})
	if code != exitGeneral {
		t.Fatalf("preflight exit=%d, want %d", code, exitGeneral)
	}
	if requests != 0 {
		t.Fatalf("enrollment reached backend before safe-write preflight: %d requests", requests)
	}
}

func TestPostRegistrationCommitFailureKeepsProtectedRecoveryCredential(t *testing.T) {
	directory := t.TempDir()
	configPath := filepath.Join(directory, "etc", "config.json")
	stateDir := filepath.Join(directory, "state")
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if err := os.Mkdir(configPath, 0o700); err != nil {
			t.Fatal(err)
		}
		var requestPayload model.RegistrationRequest
		if err := json.NewDecoder(request.Body).Decode(&requestPayload); err != nil {
			t.Fatal(err)
		}
		_ = json.NewEncoder(writer).Encode(responseFor("agent", requestPayload.RequestedCredential))
	}))
	defer server.Close()
	app, stdout, stderr := testApplication()
	code := app.execute([]string{"enroll", "--server", server.URL, "--token", "token", "--config", configPath, "--state-dir", stateDir})
	if code != exitGeneral {
		t.Fatalf("commit failure exit=%d, want %d", code, exitGeneral)
	}
	if !strings.Contains(stderr.String(), "protected recovery configuration") {
		t.Fatalf("recovery message was unsafe or missing: %s", stdout.String()+stderr.String())
	}
	matches, err := filepath.Glob(filepath.Join(filepath.Dir(configPath), ".config-recovery-*"))
	if err != nil || len(matches) != 1 {
		t.Fatalf("recovery files=%v err=%v", matches, err)
	}
	data, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "ng_agent_") {
		t.Fatal("new credential was lost after commit failure")
	}
	info, err := os.Stat(matches[0])
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("recovery file mode is unsafe: info=%v err=%v", info, err)
	}
}

func TestEnrollmentErrorExitCodeMapping(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		apiCode  string
		status   int
		exitCode int
		message  string
	}{
		{"invalid-token", "invalid_enrollment_token", http.StatusUnauthorized, exitAuthentication, "token is invalid"},
		{"identity-conflict", "machine_identity_conflict", http.StatusConflict, exitAuthentication, "already registered"},
		{"identity-mismatch", "machine_identity_mismatch", http.StatusConflict, exitAuthentication, "does not match"},
		{"identity-required", "machine_identity_required", http.StatusBadRequest, exitAuthentication, "stable machine identity"},
		{"rate-limited", "rate_limited", http.StatusTooManyRequests, exitNetwork, "wait before retrying"},
		{"backend-unavailable", "internal_error", http.StatusServiceUnavailable, exitNetwork, "temporarily unavailable"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				writer.Header().Set("Content-Type", "application/json")
				writer.WriteHeader(testCase.status)
				_ = json.NewEncoder(writer).Encode(map[string]string{"error": testCase.apiCode, "message": "unsafe backend detail"})
			}))
			defer server.Close()
			app, stdout, stderr := testApplication()
			code := app.execute([]string{"enroll", "--server", server.URL, "--token", "secret-token", "--config", filepath.Join(t.TempDir(), "etc", "config.json"), "--state-dir", filepath.Join(t.TempDir(), "state")})
			if code != testCase.exitCode {
				t.Fatalf("exit=%d, want %d", code, testCase.exitCode)
			}
			combined := stdout.String() + stderr.String()
			if !strings.Contains(combined, testCase.message) {
				t.Fatalf("missing actionable error %q: %s", testCase.message, combined)
			}
			if strings.Contains(combined, "secret-token") || strings.Contains(combined, "unsafe backend detail") {
				t.Fatalf("sensitive data leaked: %s", combined)
			}
		})
	}
}

func TestEnrollRejectsReplacementLifecycle(t *testing.T) {
	app, _, stderr := testApplication()
	code := app.execute([]string{"enroll", "--server", "http://127.0.0.1:3000", "--token", "token", "--replace-existing"})
	if code != exitInvalid || !strings.Contains(stderr.String(), "available only with re-enroll") {
		t.Fatalf("unsafe enroll replacement was not rejected: code=%d stderr=%s", code, stderr.String())
	}
}

func TestEnrollmentTokenEnvironmentIsCapturedAndUnset(t *testing.T) {
	t.Setenv("NODEGUARD_ENROLLMENT_TOKEN", "environment-secret")
	options, err := enrollmentFlags(&bytes.Buffer{}, "enroll", []string{"--server", "http://127.0.0.1:3000"})
	if err != nil {
		t.Fatal(err)
	}
	if options.token != "environment-secret" || os.Getenv("NODEGUARD_ENROLLMENT_TOKEN") != "" {
		t.Fatal("enrollment token environment was not captured and unset")
	}
}

func TestNonInteractiveEnrollmentRequiresToken(t *testing.T) {
	app, _, stderr := testApplication()
	code := app.execute([]string{"enroll", "--server", "http://127.0.0.1:3000", "--non-interactive"})
	if code != exitInvalid || !strings.Contains(stderr.String(), "NODEGUARD_ENROLLMENT_TOKEN") {
		t.Fatalf("missing non-interactive token was not actionable: code=%d stderr=%s", code, stderr.String())
	}
}

func TestReEnrollDoesNotUseUnsafeOldCredential(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests++
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	directory := t.TempDir()
	configPath := filepath.Join(directory, "etc", "config.json")
	cfg := config.Config{
		ServerURL: server.URL, AgentID: "agent", Credential: "old-secret", DisplayName: "Test",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
	}
	if err := config.Save(configPath, cfg); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(configPath, 0o644); err != nil {
		t.Fatal(err)
	}
	app, _, _ := testApplication()
	code := app.execute([]string{"re-enroll", "--token", "new-token", "--replace-existing", "--config", configPath, "--state-dir", filepath.Join(directory, "state")})
	if code != exitInvalid {
		t.Fatalf("unsafe credential file exit=%d, want %d", code, exitInvalid)
	}
	if requests != 0 {
		t.Fatal("unsafe old credential was sent to the backend")
	}
}

func TestRegisterCompatibilityAliasUsesSafeExistingLifecycle(t *testing.T) {
	var registration model.RegistrationRequest
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/api/agent/heartbeat" {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		if err := json.NewDecoder(request.Body).Decode(&registration); err != nil {
			t.Fatal(err)
		}
		_ = json.NewEncoder(writer).Encode(responseFor("agent", registration.RequestedCredential))
	}))
	defer server.Close()
	directory := t.TempDir()
	configPath := filepath.Join(directory, "etc", "config.json")
	stateDir := filepath.Join(directory, "state")
	if _, _, err := identity.Ensure(stateDir); err != nil {
		t.Fatal(err)
	}
	old := config.Config{
		ServerURL: server.URL, AgentID: "agent", Credential: "old", DisplayName: "Test",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
	}
	if err := config.Save(configPath, old); err != nil {
		t.Fatal(err)
	}
	app, _, stderr := testApplication()
	if code := app.execute([]string{"register", "--token", "legacy-rotation-token", "--config", configPath, "--state-dir", stateDir}); code != exitSuccess {
		t.Fatalf("register alias exit=%d stderr=%s", code, stderr.String())
	}
	if registration.MachineIdentity == "" || registration.RequestedCredential == "" {
		t.Fatalf("compatibility registration omitted safe identity/credential: %#v", registration)
	}
}

func TestDoctorReportsFailuresWithoutModifyingHost(t *testing.T) {
	app, stdout, _ := testApplication()
	code := app.execute([]string{"doctor", "--config", filepath.Join(t.TempDir(), "missing"), "--state-dir", filepath.Join(t.TempDir(), "missing-state")})
	if code != exitGeneral {
		t.Fatalf("doctor exit=%d, want %d", code, exitGeneral)
	}
	if !strings.Contains(stdout.String(), "Configuration invalid or unavailable") || !strings.Contains(stdout.String(), "Stable machine identity unavailable") {
		t.Fatalf("doctor output missing actionable checks: %s", stdout.String())
	}
}

func TestConfigValidateRejectsUnsafePermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	cfg := config.Config{
		ServerURL: "http://127.0.0.1:3000", AgentID: "agent", Credential: "secret", DisplayName: "Test",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
	}
	if err := config.Save(path, cfg); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	app, _, _ := testApplication()
	if code := app.execute([]string{"config", "validate", "--config", path}); code != exitInvalid {
		t.Fatalf("config validate exit=%d, want %d", code, exitInvalid)
	}
}
