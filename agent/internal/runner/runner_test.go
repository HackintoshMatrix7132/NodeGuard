package runner

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

func TestRetryBackoffIsCappedAndJittered(t *testing.T) {
	for failures := 1; failures <= 8; failures++ {
		delay := retryDelay(failures)
		minimum := []time.Duration{5, 10, 30, 60, 60, 60, 60, 60}[failures-1] * time.Second
		if delay < minimum || delay >= minimum+minimum/5 {
			t.Fatalf("retry delay %s is outside expected range for failure %d", delay, failures)
		}
	}
}

func TestGracefulShutdown(t *testing.T) {
	cfg := config.Config{
		ServerURL: "http://127.0.0.1:1", AgentID: "agent", Credential: "secret", DisplayName: "agent",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds, DockerEnabled: false,
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := New(cfg, "test", logger).Run(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestHeartbeatIncludesStableMachineIdentity(t *testing.T) {
	cfg := config.Config{
		ServerURL: "http://127.0.0.1:1", AgentID: "agent", Credential: "secret", DisplayName: "agent",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
	}
	instance := New(cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil))).WithMachineIdentity("78c1d45d-ddd3-4b12-9bf7-7da129950502")
	instance.heartbeat()
	item, found := instance.queue.Peek()
	if !found {
		t.Fatal("heartbeat was not queued")
	}
	heartbeat, ok := item.Payload.(model.Heartbeat)
	if !ok || heartbeat.MachineIdentity != "78c1d45d-ddd3-4b12-9bf7-7da129950502" {
		t.Fatalf("heartbeat missing machine identity: %#v", item.Payload)
	}
}

type blockingUpdateProvider struct {
	started chan struct{}
	calls   atomic.Int32
}

func (provider *blockingUpdateProvider) Name() string    { return "test" }
func (provider *blockingUpdateProvider) Supported() bool { return true }
func (provider *blockingUpdateProvider) Check(ctx context.Context) model.UpdateInventory {
	if provider.calls.Add(1) == 1 {
		close(provider.started)
	}
	<-ctx.Done()
	return model.UpdateInventory{SchemaVersion: 1, Provider: "test", Status: model.UpdateStatusCheckFailed, CheckedAt: time.Now()}
}

func TestUpdateCollectionIsCancellableAndSingleFlight(t *testing.T) {
	cfg := config.Config{
		ServerURL: "http://127.0.0.1:1", AgentID: "agent", Credential: "secret", DisplayName: "agent",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.MinimumUpdateIntervalSeconds, DockerEnabled: false,
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	provider := &blockingUpdateProvider{started: make(chan struct{})}
	runner := New(cfg, "test", logger)
	runner.updateProvider = provider
	runner.updateStartDelay = func(time.Duration) time.Duration { return 0 }
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- runner.Run(ctx) }()
	select {
	case <-provider.started:
	case <-time.After(2 * time.Second):
		cancel()
		t.Fatal("scheduled update collection did not start")
	}
	if provider.calls.Load() != 1 {
		cancel()
		t.Fatalf("update provider calls = %d, want 1", provider.calls.Load())
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("agent shutdown waited on a cancelled update check")
	}
}

func TestUpdateRetryScheduleIsBounded(t *testing.T) {
	expected := []time.Duration{30 * time.Second, 2 * time.Minute, 5 * time.Minute, 15 * time.Minute, 15 * time.Minute}
	for index, want := range expected {
		if actual := updateRetryDelay(index+1, config.DefaultUpdateIntervalSeconds*time.Second); actual != want {
			t.Fatalf("retry %d = %s, want %s", index+1, actual, want)
		}
	}
	if actual := updateRetryDelay(5, time.Minute); actual != time.Minute {
		t.Fatalf("retry was not capped by the configured interval: %s", actual)
	}
}

func TestUpdateStartupDelayIsSmallAndNonzero(t *testing.T) {
	for iteration := 0; iteration < 200; iteration++ {
		delay := updateStartupDelay(config.DefaultUpdateIntervalSeconds * time.Second)
		if delay < 5*time.Second || delay > 30*time.Second {
			t.Fatalf("startup delay %s is outside the 5-30 second window", delay)
		}
	}
	if delay := updateStartupDelay(0); delay != 0 {
		t.Fatalf("zero interval startup delay = %s, want 0", delay)
	}
}

func TestOversizedReportIsDroppedWithoutRetry(t *testing.T) {
	cfg := config.Config{
		ServerURL: "http://127.0.0.1:1", AgentID: "agent", Credential: "secret", DisplayName: "agent",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds, DockerEnabled: false,
	}
	runner := New(cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	runner.enqueue("/api/agent/updates", map[string]string{"payload": strings.Repeat("x", 500*1024)})
	runner.sendNext(context.Background())
	if runner.queue.Len() != 0 {
		t.Fatal("oversized report remained queued for retry")
	}
	if runner.failures != 0 {
		t.Fatal("oversized local report was treated as a connection failure")
	}
}

func TestTransientUpdateCarriesLastSuccessfulTimestamp(t *testing.T) {
	cfg := config.Config{
		ServerURL: "http://127.0.0.1:1", AgentID: "agent", Credential: "secret", DisplayName: "agent",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
	}
	instance := New(cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	successfulAt := time.Date(2026, 7, 16, 8, 30, 0, 0, time.UTC)
	success := instance.preserveLastSuccessfulUpdate(model.UpdateInventory{
		Status: model.UpdateStatusOK, CheckedAt: successfulAt,
	})
	if success.LastSuccessfulAt == nil || !success.LastSuccessfulAt.Equal(successfulAt) {
		t.Fatalf("successful inventory timestamp = %v, want %s", success.LastSuccessfulAt, successfulAt)
	}
	failure := instance.preserveLastSuccessfulUpdate(model.UpdateInventory{
		Status: model.UpdateStatusPackageManagerBusy, CheckedAt: successfulAt.Add(time.Minute),
	})
	if failure.LastSuccessfulAt == nil || !failure.LastSuccessfulAt.Equal(successfulAt) {
		t.Fatalf("failure last-success timestamp = %v, want %s", failure.LastSuccessfulAt, successfulAt)
	}
	if failure.UpdateCount != 0 || failure.SecurityUpdateCount != 0 {
		t.Fatal("failure inventory synthesized update counts")
	}
}

func TestPermanentReportRejectionDoesNotBlockNextItem(t *testing.T) {
	for _, statusCode := range []int{http.StatusBadRequest, http.StatusRequestEntityTooLarge} {
		t.Run(http.StatusText(statusCode), func(t *testing.T) {
			var requests atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				if requests.Add(1) == 1 {
					response.Header().Set("Content-Type", "application/json")
					response.WriteHeader(statusCode)
					_, _ = response.Write([]byte(`{"error":"invalid_agent_update_payload","message":"rejected"}`))
					return
				}
				response.WriteHeader(http.StatusNoContent)
			}))
			defer server.Close()

			cfg := config.Config{
				ServerURL: server.URL, AgentID: "agent", Credential: "secret", DisplayName: "agent",
				HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
				InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
			}
			instance := New(cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
			instance.enqueue("/api/agent/updates", model.UpdateInventory{Status: model.UpdateStatusOK, CheckedAt: time.Now()})
			instance.enqueue("/api/agent/heartbeat", model.Heartbeat{AgentID: "agent", Timestamp: time.Now()})

			instance.sendNext(context.Background())
			if instance.queue.Len() != 1 || instance.failures != 0 || !instance.nextAttempt.IsZero() {
				t.Fatalf("permanently rejected report blocked queue: len=%d failures=%d next=%s", instance.queue.Len(), instance.failures, instance.nextAttempt)
			}
			instance.sendNext(context.Background())
			if instance.queue.Len() != 0 || requests.Load() != 2 {
				t.Fatalf("next report was not delivered: len=%d requests=%d", instance.queue.Len(), requests.Load())
			}
		})
	}
}

func TestSuccessfulUpdateIsDeliveredBeforeLatestFailureAfterOutage(t *testing.T) {
	var recovered atomic.Bool
	var acceptedMu sync.Mutex
	accepted := []model.UpdateStatus{}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		var inventory model.UpdateInventory
		if err := json.NewDecoder(request.Body).Decode(&inventory); err != nil {
			http.Error(response, "invalid test payload", http.StatusBadRequest)
			return
		}
		if !recovered.Load() {
			response.Header().Set("Content-Type", "application/json")
			response.WriteHeader(http.StatusServiceUnavailable)
			_, _ = response.Write([]byte(`{"error":"temporarily_unavailable","message":"retry"}`))
			return
		}
		acceptedMu.Lock()
		accepted = append(accepted, inventory.Status)
		acceptedMu.Unlock()
		response.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	cfg := config.Config{
		ServerURL: server.URL, AgentID: "agent", Credential: "secret", DisplayName: "agent",
		HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30, DockerIntervalSeconds: 60,
		InventoryIntervalSeconds: 3600, UpdateIntervalSeconds: config.DefaultUpdateIntervalSeconds,
	}
	instance := New(cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	successfulAt := time.Date(2026, 7, 16, 8, 30, 0, 0, time.UTC)
	instance.enqueue("/api/agent/updates", model.UpdateInventory{
		Status: model.UpdateStatusOK, CheckedAt: successfulAt, UpdateCount: 7,
	})
	instance.enqueue("/api/agent/updates", model.UpdateInventory{
		Status: model.UpdateStatusPackageManagerBusy, CheckedAt: successfulAt.Add(time.Minute),
	})
	instance.enqueue("/api/agent/updates", model.UpdateInventory{
		Status: model.UpdateStatusMetadataRefreshFailed, CheckedAt: successfulAt.Add(2 * time.Minute),
	})
	if instance.queue.Len() != 2 {
		t.Fatalf("queued update reports = %d, want one success and one latest failure", instance.queue.Len())
	}

	instance.sendNext(context.Background())
	if instance.queue.Len() != 2 || instance.failures != 1 || instance.nextAttempt.IsZero() {
		t.Fatalf("temporary outage did not retain reports: len=%d failures=%d next=%s", instance.queue.Len(), instance.failures, instance.nextAttempt)
	}

	recovered.Store(true)
	instance.nextAttempt = time.Time{}
	instance.sendNext(context.Background())
	instance.sendNext(context.Background())
	if instance.queue.Len() != 0 || instance.failures != 0 || instance.connectionFailed {
		t.Fatalf("recovery did not flush reports: len=%d failures=%d connectionFailed=%v", instance.queue.Len(), instance.failures, instance.connectionFailed)
	}
	acceptedMu.Lock()
	defer acceptedMu.Unlock()
	if len(accepted) != 2 || accepted[0] != model.UpdateStatusOK || accepted[1] != model.UpdateStatusMetadataRefreshFailed {
		t.Fatalf("accepted update order = %v, want [ok metadata_refresh_failed]", accepted)
	}
}
