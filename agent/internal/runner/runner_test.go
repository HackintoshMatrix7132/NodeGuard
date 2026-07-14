package runner

import (
	"context"
	"io"
	"log/slog"
	"strings"
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
	expected := []time.Duration{15 * time.Minute, 30 * time.Minute, 60 * time.Minute, 60 * time.Minute}
	for index, want := range expected {
		if actual := updateRetryDelay(index + 1); actual != want {
			t.Fatalf("retry %d = %s, want %s", index+1, actual, want)
		}
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
