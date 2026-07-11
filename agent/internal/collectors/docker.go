package collectors

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

const defaultDockerSocket = "/var/run/docker.sock"

type DockerCollector struct {
	client *http.Client
}

type dockerVersion struct {
	Version string `json:"Version"`
}

type listedPort struct {
	IP          string `json:"IP"`
	PrivatePort uint16 `json:"PrivatePort"`
	PublicPort  uint16 `json:"PublicPort"`
	Type        string `json:"Type"`
}

type listedContainer struct {
	ID      string            `json:"Id"`
	Names   []string          `json:"Names"`
	Image   string            `json:"Image"`
	State   string            `json:"State"`
	Status  string            `json:"Status"`
	Created int64             `json:"Created"`
	Ports   []listedPort      `json:"Ports"`
	Labels  map[string]string `json:"Labels"`
}

type inspectedContainer struct {
	Created      string `json:"Created"`
	RestartCount int    `json:"RestartCount"`
	Config       struct {
		Labels       map[string]string `json:"Labels"`
		ExposedPorts map[string]any    `json:"ExposedPorts"`
	} `json:"Config"`
	State struct {
		Status    string `json:"Status"`
		Running   bool   `json:"Running"`
		StartedAt string `json:"StartedAt"`
		Health    *struct {
			Status string `json:"Status"`
		} `json:"Health"`
	} `json:"State"`
	NetworkSettings struct {
		Networks map[string]struct {
			IPAddress string `json:"IPAddress"`
		} `json:"Networks"`
	} `json:"NetworkSettings"`
}

type containerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     uint64 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
		Stats struct {
			Cache        uint64 `json:"cache"`
			InactiveFile uint64 `json:"inactive_file"`
		} `json:"stats"`
	} `json:"memory_stats"`
}

func NewDockerCollector(socketPath string) *DockerCollector {
	if socketPath == "" {
		socketPath = defaultDockerSocket
	}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "unix", socketPath)
		},
		DisableCompression: true,
	}
	return &DockerCollector{client: &http.Client{Transport: transport, Timeout: 12 * time.Second}}
}

func (collector *DockerCollector) get(ctx context.Context, path string, output any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://docker"+path, nil)
	if err != nil {
		return err
	}
	response, err := collector.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return fmt.Errorf("Docker API returned %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
	}
	return json.NewDecoder(io.LimitReader(response.Body, 16*1024*1024)).Decode(output)
}

func parseDockerTime(value string) *time.Time {
	if value == "" || strings.HasPrefix(value, "0001-") {
		return nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return nil
	}
	parsed = parsed.UTC()
	return &parsed
}

func safeLabels(labels map[string]string) map[string]string {
	allowed := []string{
		"com.docker.compose.project", "com.docker.compose.service", "com.docker.stack.namespace",
		"org.opencontainers.image.title", "org.opencontainers.image.version", "org.opencontainers.image.source",
	}
	result := map[string]string{}
	for _, key := range allowed {
		if value := labels[key]; value != "" {
			result[key] = value
		}
	}
	return result
}

func stackName(labels map[string]string) *string {
	for _, key := range []string{"com.docker.compose.project", "com.docker.stack.namespace"} {
		if value := strings.TrimSpace(labels[key]); value != "" {
			return &value
		}
	}
	return nil
}

func portLists(ports []listedPort) ([]string, []string) {
	containerPorts := []string{}
	publishedPorts := []string{}
	for _, port := range ports {
		protocol := port.Type
		if protocol == "" {
			protocol = "tcp"
		}
		containerPorts = append(containerPorts, fmt.Sprintf("%d/%s", port.PrivatePort, protocol))
		if port.PublicPort > 0 {
			publishedPorts = append(publishedPorts, fmt.Sprintf("%d:%d/%s", port.PublicPort, port.PrivatePort, protocol))
		}
	}
	sort.Strings(containerPorts)
	sort.Strings(publishedPorts)
	return publishedPorts, containerPorts
}

func healthState(details inspectedContainer) string {
	if details.State.Health == nil {
		return "none"
	}
	switch details.State.Health.Status {
	case "healthy", "unhealthy", "starting":
		return details.State.Health.Status
	default:
		return "none"
	}
}

func statsValues(stats containerStats) (*float64, *uint64, *uint64) {
	var cpu *float64
	cpuDelta := stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage
	systemDelta := stats.CPUStats.SystemCPUUsage - stats.PreCPUStats.SystemCPUUsage
	if stats.CPUStats.CPUUsage.TotalUsage >= stats.PreCPUStats.CPUUsage.TotalUsage &&
		stats.CPUStats.SystemCPUUsage >= stats.PreCPUStats.SystemCPUUsage && systemDelta > 0 {
		online := stats.CPUStats.OnlineCPUs
		if online == 0 {
			online = 1
		}
		value := float64(cpuDelta) / float64(systemDelta) * float64(online) * 100
		cpu = &value
	}
	var used, limit *uint64
	if stats.MemoryStats.Limit > 0 {
		memoryUsed := stats.MemoryStats.Usage
		cache := stats.MemoryStats.Stats.InactiveFile
		if cache == 0 {
			cache = stats.MemoryStats.Stats.Cache
		}
		if cache <= memoryUsed {
			memoryUsed -= cache
		}
		used, limit = &memoryUsed, &stats.MemoryStats.Limit
	}
	return cpu, used, limit
}

func (collector *DockerCollector) normalize(ctx context.Context, listed listedContainer) model.Container {
	var details inspectedContainer
	_ = collector.get(ctx, "/containers/"+url.PathEscape(listed.ID)+"/json", &details)
	createdAt := parseDockerTime(details.Created)
	if createdAt == nil && listed.Created > 0 {
		created := time.Unix(listed.Created, 0).UTC()
		createdAt = &created
	}
	startedAt := parseDockerTime(details.State.StartedAt)
	var uptimeSeconds *int64
	if startedAt != nil && (details.State.Running || strings.EqualFold(listed.State, "running")) {
		value := int64(time.Since(*startedAt).Seconds())
		if value >= 0 {
			uptimeSeconds = &value
		}
	}
	labels := details.Config.Labels
	if labels == nil {
		labels = listed.Labels
	}
	ipAddresses := []string{}
	networks := []string{}
	for name, network := range details.NetworkSettings.Networks {
		networks = append(networks, name)
		if network.IPAddress != "" {
			ipAddresses = append(ipAddresses, network.IPAddress)
		}
	}
	sort.Strings(networks)
	sort.Strings(ipAddresses)
	publishedPorts, containerPorts := portLists(listed.Ports)
	if len(containerPorts) == 0 {
		for port := range details.Config.ExposedPorts {
			containerPorts = append(containerPorts, port)
		}
		sort.Strings(containerPorts)
	}
	var stats containerStats
	var cpu *float64
	var memoryUsed, memoryLimit *uint64
	if details.State.Running && collector.get(ctx, "/containers/"+url.PathEscape(listed.ID)+"/stats?stream=false&one-shot=true", &stats) == nil {
		cpu, memoryUsed, memoryLimit = statsValues(stats)
	}
	name := strings.TrimPrefix(first(listed.Names, listed.ID[:min(12, len(listed.ID))]), "/")
	restartCount := details.RestartCount
	state := details.State.Status
	if state == "" {
		state = listed.State
	}
	return model.Container{
		ID: listed.ID, Name: name, Image: listed.Image, RuntimeState: state, Health: healthState(details),
		CreatedAt: createdAt, StartedAt: startedAt, UptimeSeconds: uptimeSeconds, RestartCount: &restartCount,
		Stack: stackName(labels), IPAddresses: ipAddresses, Networks: networks,
		PublishedPorts: publishedPorts, ContainerPorts: containerPorts, Labels: safeLabels(labels),
		CPUPercent: cpu, MemoryUsedBytes: memoryUsed, MemoryLimitBytes: memoryLimit,
	}
}

func first(values []string, fallback string) string {
	if len(values) > 0 && values[0] != "" {
		return values[0]
	}
	return fallback
}

func (collector *DockerCollector) Collect(ctx context.Context) (model.DockerPayload, error) {
	now := time.Now().UTC()
	var version dockerVersion
	if err := collector.get(ctx, "/version", &version); err != nil {
		return model.DockerPayload{Timestamp: now, Available: false, Containers: []model.Container{}}, err
	}
	var listed []listedContainer
	if err := collector.get(ctx, "/containers/json?all=1", &listed); err != nil {
		return model.DockerPayload{Timestamp: now, Available: false, Containers: []model.Container{}}, err
	}
	containers := make([]model.Container, len(listed))
	semaphore := make(chan struct{}, 8)
	var waitGroup sync.WaitGroup
	for index, item := range listed {
		waitGroup.Add(1)
		go func(index int, item listedContainer) {
			defer waitGroup.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			containers[index] = collector.normalize(ctx, item)
		}(index, item)
	}
	waitGroup.Wait()
	sort.Slice(containers, func(left, right int) bool { return containers[left].Name < containers[right].Name })
	encoded, _ := json.Marshal(containers)
	digest := sha256.Sum256(encoded)
	hash := hex.EncodeToString(digest[:])
	return model.DockerPayload{
		Timestamp: now, Available: true, Version: pointer(version.Version), InventoryHash: &hash, Containers: containers,
	}, nil
}
