package model

import "time"

type Filesystem struct {
	Device     *string `json:"device"`
	Mount      string  `json:"mount"`
	Filesystem *string `json:"filesystem"`
	TotalBytes *uint64 `json:"totalBytes"`
}

type RegistrationRequest struct {
	EnrollmentToken string  `json:"enrollmentToken"`
	DisplayName     string  `json:"displayName,omitempty"`
	Hostname        string  `json:"hostname"`
	AgentVersion    string  `json:"agentVersion"`
	OSName          *string `json:"osName"`
	OSVersion       *string `json:"osVersion"`
	Kernel          *string `json:"kernel"`
	Architecture    *string `json:"architecture"`
}

type RegistrationResponse struct {
	AgentID                  string `json:"agentId"`
	Credential               string `json:"credential"`
	DisplayName              string `json:"displayName"`
	HeartbeatIntervalSeconds int    `json:"heartbeatIntervalSeconds"`
	MetricsIntervalSeconds   int    `json:"metricsIntervalSeconds"`
	DockerIntervalSeconds    int    `json:"dockerIntervalSeconds"`
	InventoryIntervalSeconds int    `json:"inventoryIntervalSeconds"`
}

type Heartbeat struct {
	AgentID              string    `json:"agentId"`
	AgentVersion         string    `json:"agentVersion"`
	ProcessUptimeSeconds int64     `json:"processUptimeSeconds"`
	Timestamp            time.Time `json:"timestamp"`
}

type Inventory struct {
	Timestamp           time.Time    `json:"timestamp"`
	Hostname            string       `json:"hostname"`
	OSName              *string      `json:"osName"`
	OSVersion           *string      `json:"osVersion"`
	Kernel              *string      `json:"kernel"`
	Architecture        *string      `json:"architecture"`
	CPUModel            *string      `json:"cpuModel"`
	PhysicalCoreCount   *int         `json:"physicalCoreCount"`
	LogicalCPUCount     *int         `json:"logicalCpuCount"`
	TotalMemoryBytes    *uint64      `json:"totalMemoryBytes"`
	TotalSwapBytes      *uint64      `json:"totalSwapBytes"`
	Filesystems         []Filesystem `json:"filesystems"`
	IPAddresses         []string     `json:"ipAddresses"`
	BootTime            *time.Time   `json:"bootTime"`
	SystemUptimeSeconds *int64       `json:"systemUptimeSeconds"`
	AgentVersion        string       `json:"agentVersion"`
}

type MetricSample struct {
	Timestamp           time.Time `json:"timestamp"`
	CPUUsagePercent     *float64  `json:"cpuUsagePercent"`
	MemoryUsedBytes     *uint64   `json:"memoryUsedBytes"`
	MemoryTotalBytes    *uint64   `json:"memoryTotalBytes"`
	MemoryUsagePercent  *float64  `json:"memoryUsagePercent"`
	DiskUsedBytes       *uint64   `json:"diskUsedBytes"`
	DiskTotalBytes      *uint64   `json:"diskTotalBytes"`
	DiskUsagePercent    *float64  `json:"diskUsagePercent"`
	SwapUsedBytes       *uint64   `json:"swapUsedBytes"`
	SwapTotalBytes      *uint64   `json:"swapTotalBytes"`
	SwapUsagePercent    *float64  `json:"swapUsagePercent"`
	LoadAverage1        *float64  `json:"loadAverage1"`
	LoadAverage5        *float64  `json:"loadAverage5"`
	LoadAverage15       *float64  `json:"loadAverage15"`
	SystemUptimeSeconds *int64    `json:"systemUptimeSeconds"`
}

type MetricsPayload struct {
	Samples []MetricSample `json:"samples"`
}

type Container struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Image            string            `json:"image"`
	RuntimeState     string            `json:"runtimeState"`
	Health           string            `json:"health"`
	CreatedAt        *time.Time        `json:"createdAt"`
	StartedAt        *time.Time        `json:"startedAt"`
	UptimeSeconds    *int64            `json:"uptimeSeconds"`
	RestartCount     *int              `json:"restartCount"`
	Stack            *string           `json:"stack"`
	IPAddresses      []string          `json:"ipAddresses"`
	Networks         []string          `json:"networks"`
	PublishedPorts   []string          `json:"publishedPorts"`
	ContainerPorts   []string          `json:"containerPorts"`
	Labels           map[string]string `json:"labels"`
	CPUPercent       *float64          `json:"cpuPercent"`
	MemoryUsedBytes  *uint64           `json:"memoryUsedBytes"`
	MemoryLimitBytes *uint64           `json:"memoryLimitBytes"`
}

type DockerPayload struct {
	Timestamp     time.Time   `json:"timestamp"`
	Available     bool        `json:"available"`
	Version       *string     `json:"version"`
	InventoryHash *string     `json:"inventoryHash"`
	Containers    []Container `json:"containers"`
}

type AgentStatus struct {
	ID               string     `json:"id"`
	DisplayName      string     `json:"displayName"`
	Hostname         string     `json:"hostname"`
	Status           string     `json:"status"`
	LastSeenAt       *time.Time `json:"lastSeenAt"`
	CredentialStatus string     `json:"credentialStatus"`
}
