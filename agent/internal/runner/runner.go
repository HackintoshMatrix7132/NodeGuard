package runner

import (
	"context"
	"errors"
	"log/slog"
	"math/rand"
	"sync"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/client"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/collectors"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/contract"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/queue"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/updates"
)

type Runner struct {
	config            config.Config
	api               *client.Client
	metrics           *collectors.MetricsCollector
	docker            *collectors.DockerCollector
	queue             *queue.Queue
	logger            *slog.Logger
	version           string
	machineIdentity   string
	startedAt         time.Time
	nextAttempt       time.Time
	failures          int
	connectionFailed  bool
	dockerAvailable   *bool
	updateProvider    updates.UpdateProvider
	lastUpdateSuccess *time.Time
	updateWaitGroup   sync.WaitGroup
	updateStartDelay  func(time.Duration) time.Duration
}

func (runner *Runner) WithMachineIdentity(machineIdentity string) *Runner {
	runner.machineIdentity = machineIdentity
	return runner
}

func New(cfg config.Config, version string, logger *slog.Logger) *Runner {
	cfg = config.WithDefaults(cfg)
	return &Runner{
		config: cfg, api: client.New(cfg), metrics: &collectors.MetricsCollector{},
		docker: collectors.NewDockerCollector(""), queue: queue.New(100, 15*time.Minute),
		logger: logger, version: version, startedAt: time.Now(), updateProvider: updates.NewAPTProvider(),
		updateStartDelay: updateStartupDelay,
	}
}

func (runner *Runner) enqueue(path string, payload any) {
	coalesceKey := ""
	if path == contract.AgentEndpointUpdates {
		coalesceKey = "agent-updates-state"
		if inventory, ok := payload.(model.UpdateInventory); ok && inventory.Status == model.UpdateStatusOK {
			coalesceKey = "agent-updates-success"
		}
	}
	runner.queue.Add(queue.Item{
		Path: path, CoalesceKey: coalesceKey, Payload: payload, CreatedAt: time.Now(),
		RetainUntilReplaced: path == contract.AgentEndpointUpdates,
	})
}

func (runner *Runner) heartbeat() {
	runner.enqueue(contract.AgentEndpointHeartbeat, model.Heartbeat{
		AgentID: runner.config.AgentID, MachineIdentity: runner.machineIdentity, AgentVersion: runner.version,
		ProcessUptimeSeconds: int64(time.Since(runner.startedAt).Seconds()), Timestamp: time.Now().UTC(),
	})
}

func (runner *Runner) collectInventory() {
	inventory, err := collectors.CollectInventory(runner.version)
	if err != nil {
		runner.logger.Error("host inventory collection failed", "event", "inventory_failed", "error", err.Error())
		return
	}
	runner.enqueue(contract.AgentEndpointInventory, inventory)
}

func (runner *Runner) collectMetrics() {
	sample := runner.metrics.Collect()
	runner.enqueue(contract.AgentEndpointMetrics, model.MetricsPayload{Samples: []model.MetricSample{sample}})
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
	runner.enqueue(contract.AgentEndpointDocker, payload)
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

func updateStartupDelay(interval time.Duration) time.Duration {
	if interval <= 0 {
		return 0
	}
	maximum := min(30*time.Second, interval)
	minimum := min(5*time.Second, maximum)
	if maximum == minimum {
		return minimum
	}
	return minimum + time.Duration(rand.Int63n(int64(maximum-minimum)+1))
}

func updateStatusIsTransient(status model.UpdateStatus) bool {
	return status == model.UpdateStatusPackageManagerBusy || status == model.UpdateStatusMetadataRefreshFailed || status == model.UpdateStatusCheckFailed
}

func updateRetryDelay(failures int, interval time.Duration) time.Duration {
	delays := []time.Duration{30 * time.Second, 2 * time.Minute, 5 * time.Minute, 15 * time.Minute}
	index := failures - 1
	if index < 0 {
		index = 0
	}
	if index >= len(delays) {
		index = len(delays) - 1
	}
	delay := delays[index]
	if interval > 0 && delay > interval {
		return interval
	}
	return delay
}

func (runner *Runner) preserveLastSuccessfulUpdate(inventory model.UpdateInventory) model.UpdateInventory {
	if inventory.Status == model.UpdateStatusOK {
		successfulAt := inventory.CheckedAt.UTC()
		if inventory.LastSuccessfulAt != nil {
			successfulAt = inventory.LastSuccessfulAt.UTC()
		} else {
			inventory.LastSuccessfulAt = &successfulAt
		}
		runner.lastUpdateSuccess = &successfulAt
		return inventory
	}
	if updateStatusIsTransient(inventory.Status) && inventory.LastSuccessfulAt == nil && runner.lastUpdateSuccess != nil {
		successfulAt := *runner.lastUpdateSuccess
		inventory.LastSuccessfulAt = &successfulAt
	}
	return inventory
}

func (runner *Runner) startUpdateCheck(ctx context.Context, results chan<- model.UpdateInventory) {
	runner.updateWaitGroup.Add(1)
	go func() {
		defer runner.updateWaitGroup.Done()
		inventory := runner.updateProvider.Check(ctx)
		select {
		case results <- inventory:
		case <-ctx.Done():
		}
	}()
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
		var apiError *client.APIError
		if errors.As(err, &apiError) && (apiError.StatusCode == 400 || apiError.StatusCode == 413) {
			runner.queue.RemoveFirst()
			runner.logger.Error("agent report rejected and discarded", "event", "report_rejected", "path", item.Path,
				"status", apiError.StatusCode, "code", apiError.Code)
			return
		}
		if errors.Is(err, client.ErrRequestBodyTooLarge) {
			runner.queue.RemoveFirst()
			runner.logger.Error("agent report discarded because it exceeded the safe payload limit", "event", "report_too_large", "path", item.Path)
			return
		}
		runner.failures++
		delay := retryDelay(runner.failures)
		runner.nextAttempt = time.Now().Add(delay)
		if !runner.connectionFailed || item.Path == contract.AgentEndpointHeartbeat {
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
	updateInterval := time.Duration(runner.config.UpdateIntervalSeconds) * time.Second
	updateTimer := time.NewTimer(runner.updateStartDelay(updateInterval))
	updateResults := make(chan model.UpdateInventory, 1)
	updateRunning := false
	updateFailures := 0
	defer heartbeatTicker.Stop()
	defer metricsTicker.Stop()
	defer dockerTicker.Stop()
	defer inventoryTicker.Stop()
	defer senderTicker.Stop()
	defer updateTimer.Stop()

	for {
		select {
		case <-ctx.Done():
			runner.updateWaitGroup.Wait()
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
		case <-updateTimer.C:
			if !updateRunning {
				updateRunning = true
				runner.startUpdateCheck(ctx, updateResults)
			}
		case inventory := <-updateResults:
			updateRunning = false
			inventory = runner.preserveLastSuccessfulUpdate(inventory)
			runner.enqueue(contract.AgentEndpointUpdates, inventory)
			if updateStatusIsTransient(inventory.Status) {
				updateFailures++
				delay := updateRetryDelay(updateFailures, updateInterval)
				errorCode := ""
				if inventory.ErrorCode != nil {
					errorCode = *inventory.ErrorCode
				}
				runner.logger.Warn("package update discovery delayed", "event", "updates_delayed", "status", inventory.Status,
					"code", errorCode, "retryIn", delay.String())
				updateTimer.Reset(delay)
			} else {
				updateFailures = 0
				runner.logger.Info("package update inventory collected", "event", "updates_collected", "status", inventory.Status,
					"updates", inventory.UpdateCount, "securityUpdates", inventory.SecurityUpdateCount)
				updateTimer.Reset(updateInterval)
			}
		}
	}
}
