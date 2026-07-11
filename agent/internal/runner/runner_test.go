package runner

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
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
		InventoryIntervalSeconds: 3600, DockerEnabled: false,
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := New(cfg, "test", logger).Run(ctx); err != nil {
		t.Fatal(err)
	}
}
