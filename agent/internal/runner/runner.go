package runner

import (
	"context"
	"log/slog"
	"math/rand"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/client"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/collectors"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/queue"
)

type Runner struct {
	config           config.Config
	api              *client.Client
	metrics          *collectors.MetricsCollector
	docker           *collectors.DockerCollector
	queue            *queue.Queue
	logger           *slog.Logger
	version          string
	startedAt        time.Time
	nextAttempt      time.Time
	failures         int
	connectionFailed bool
	dockerAvailable  *bool
}

func New(cfg config.Config, version string, logger *slog.Logger) *Runner {
	return &Runner{
		config: cfg, api: client.New(cfg), metrics: &collectors.MetricsCollector{},
		docker: collectors.NewDockerCollector(""), queue: queue.New(100, 15*time.Minute),
		logger: logger, version: version, startedAt: time.Now(),
	}
}

func (runner *Runner) enqueue(path string, payload any) {
	runner.queue.Add(queue.Item{Path: path, Payload: payload, CreatedAt: time.Now()})
}

func (runner *Runner) heartbeat() {
	runner.enqueue("/api/agent/heartbeat", model.Heartbeat{
		AgentID: runner.config.AgentID, AgentVersion: runner.version,
		ProcessUptimeSeconds: int64(time.Since(runner.startedAt).Seconds()), Timestamp: time.Now().UTC(),
	})
}

func (runner *Runner) collectInventory() {
	inventory, err := collectors.CollectInventory(runner.version)
	if err != nil {
		runner.logger.Error("host inventory collection failed", "event", "inventory_failed", "error", err.Error())
		return
	}
	runner.enqueue("/api/agent/inventory", inventory)
}

func (runner *Runner) collectMetrics() {
	sample := runner.metrics.Collect()
	runner.enqueue("/api/agent/metrics", model.MetricsPayload{Samples: []model.MetricSample{sample}})
	runner.logger.Info("host metrics collected", "event", "metrics_collected")
}

func (runner *Runner) collectDocker(ctx context.Context) {
	if !runner.config.DockerEnabled {
		return
	}
	payload, err := runner.docker.Collect(ctx)
	available := payload.Available
	if err != nil {
		if runner.dockerAvailable == nil || *runner.dockerAvailable {
			runner.logger.Warn("Docker is unavailable; host monitoring continues", "event", "docker_unavailable", "error", err.Error())
		}
	} else if runner.dockerAvailable != nil && !*runner.dockerAvailable {
		runner.logger.Info("Docker connection restored", "event", "docker_restored")
	}
	runner.dockerAvailable = &available
	runner.enqueue("/api/agent/docker", payload)
}

func retryDelay(failures int) time.Duration {
	delays := []time.Duration{5 * time.Second, 10 * time.Second, 30 * time.Second, 60 * time.Second}
	index := failures - 1
	if index < 0 {
		index = 0
	}
	if index >= len(delays) {
		index = len(delays) - 1
	}
	base := delays[index]
	jitter := time.Duration(rand.Int63n(max(1, int64(base/5))))
	return base + jitter
}

func (runner *Runner) sendNext(ctx context.Context) {
	if time.Now().Before(runner.nextAttempt) {
		return
	}
	item, found := runner.queue.Peek()
	if !found {
		return
	}
	requestContext, cancel := context.WithTimeout(ctx, 25*time.Second)
	err := runner.api.Post(requestContext, item.Path, item.Payload)
	cancel()
	if err != nil {
		runner.failures++
		delay := retryDelay(runner.failures)
		runner.nextAttempt = time.Now().Add(delay)
		if !runner.connectionFailed || item.Path == "/api/agent/heartbeat" {
			runner.logger.Warn("NodeGuard request failed", "event", "heartbeat_failed", "path", item.Path, "retryIn", delay.String(), "error", err.Error())
		}
		runner.connectionFailed = true
		return
	}
	runner.queue.RemoveFirst()
	if runner.connectionFailed {
		runner.logger.Info("NodeGuard connection restored", "event", "connection_restored", "queuedReports", runner.queue.Len())
	}
	runner.connectionFailed = false
	runner.failures = 0
	runner.nextAttempt = time.Time{}
}

func (runner *Runner) Run(ctx context.Context) error {
	runner.logger.Info("NodeGuard Agent started", "event", "agent_started", "version", runner.version)
	runner.heartbeat()
	runner.collectInventory()
	runner.collectMetrics()
	runner.collectDocker(ctx)

	heartbeatTicker := time.NewTicker(time.Duration(runner.config.HeartbeatIntervalSeconds) * time.Second)
	metricsTicker := time.NewTicker(time.Duration(runner.config.MetricsIntervalSeconds) * time.Second)
	dockerTicker := time.NewTicker(time.Duration(runner.config.DockerIntervalSeconds) * time.Second)
	inventoryTicker := time.NewTicker(time.Duration(runner.config.InventoryIntervalSeconds) * time.Second)
	senderTicker := time.NewTicker(time.Second)
	defer heartbeatTicker.Stop()
	defer metricsTicker.Stop()
	defer dockerTicker.Stop()
	defer inventoryTicker.Stop()
	defer senderTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			runner.logger.Info("NodeGuard Agent stopped gracefully", "event", "graceful_shutdown", "queuedReportsDiscarded", runner.queue.Len())
			return nil
		case <-heartbeatTicker.C:
			runner.heartbeat()
		case <-metricsTicker.C:
			runner.collectMetrics()
		case <-dockerTicker.C:
			runner.collectDocker(ctx)
		case <-inventoryTicker.C:
			runner.collectInventory()
		case <-senderTicker.C:
			runner.sendNext(ctx)
		}
	}
}
