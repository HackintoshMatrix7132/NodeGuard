export type HealthStatus = "healthy" | "warning" | "critical" | "offline" | "unknown";
export type ContainerStatus = "running" | "stopped" | "restarting" | "exited";
export type ContainerHealth = "healthy" | "unhealthy" | "starting" | "none";
export type AlertSeverity = "critical" | "warning" | "info" | "resolved";
export type AlertStatus = "active" | "resolved";
export type AgentStatus = "online" | "stale" | "offline" | "revoked";
export type AgentCredentialStatus = "active" | "revoked";

export type AgentFilesystem = {
  device: string | null;
  mount: string;
  filesystem: string | null;
  totalBytes: number | null;
};

export type AgentSummary = {
  id: string;
  displayName: string;
  hostname: string;
  status: AgentStatus;
  agentVersion: string;
  osName: string | null;
  osVersion: string | null;
  kernel: string | null;
  architecture: string | null;
  cpuUsagePercent: number | null;
  memoryUsagePercent: number | null;
  diskUsagePercent: number | null;
  swapUsagePercent: number | null;
  dockerAvailable: boolean;
  dockerVersion: string | null;
  containerCount: number;
  registeredAt: string;
  lastSeenAt: string | null;
  lastMetricsAt: string | null;
  lastInventoryAt: string | null;
  lastDockerAt: string | null;
  credentialStatus: AgentCredentialStatus;
};

export type AgentDetail = AgentSummary & {
  cpuModel: string | null;
  physicalCoreCount: number | null;
  logicalCpuCount: number | null;
  totalMemoryBytes: number | null;
  totalSwapBytes: number | null;
  filesystems: AgentFilesystem[];
  ipAddresses: string[];
  bootTime: string | null;
  systemUptimeSeconds: number | null;
  latestMetrics: MetricSnapshot | null;
  containers: Container[];
};

export type AgentEnrollmentToken = {
  id: string;
  displayName: string | null;
  purpose: "enroll" | "rotate";
  agentId: string | null;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
};

export type CreatedAgentEnrollmentToken = AgentEnrollmentToken & {
  token: string;
};

export type CreateAgentEnrollmentInput = {
  displayName?: string;
};

export type AgentRegistrationInput = {
  enrollmentToken: string;
  displayName?: string;
  hostname: string;
  agentVersion: string;
  osName?: string | null;
  osVersion?: string | null;
  kernel?: string | null;
  architecture?: string | null;
};

export type AgentRegistrationResponse = {
  agentId: string;
  credential: string;
  displayName: string;
  heartbeatIntervalSeconds: number;
  metricsIntervalSeconds: number;
  dockerIntervalSeconds: number;
  inventoryIntervalSeconds: number;
};

export type AgentHeartbeatInput = {
  agentId?: string;
  agentVersion: string;
  processUptimeSeconds: number;
  timestamp: string;
};

export type AgentInventoryInput = {
  timestamp: string;
  hostname: string;
  osName?: string | null;
  osVersion?: string | null;
  kernel?: string | null;
  architecture?: string | null;
  cpuModel?: string | null;
  physicalCoreCount?: number | null;
  logicalCpuCount?: number | null;
  totalMemoryBytes?: number | null;
  totalSwapBytes?: number | null;
  filesystems?: AgentFilesystem[];
  ipAddresses?: string[];
  bootTime?: string | null;
  systemUptimeSeconds?: number | null;
  agentVersion: string;
};

export type AgentMetricSampleInput = {
  timestamp: string;
  cpuUsagePercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  memoryUsagePercent: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  diskUsagePercent: number | null;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  swapUsagePercent: number | null;
  loadAverage1: number | null;
  loadAverage5: number | null;
  loadAverage15: number | null;
  systemUptimeSeconds: number | null;
};

export type AgentMetricsInput = {
  samples: AgentMetricSampleInput[];
};

export type AgentContainerInput = {
  id: string;
  name: string;
  image: string;
  runtimeState: string;
  health: ContainerHealth;
  createdAt: string | null;
  startedAt: string | null;
  uptimeSeconds: number | null;
  restartCount: number | null;
  stack: string | null;
  ipAddresses: string[];
  networks: string[];
  publishedPorts: string[];
  containerPorts: string[];
  labels: Record<string, string>;
  cpuPercent: number | null;
  memoryUsedBytes: number | null;
  memoryLimitBytes: number | null;
};

export type AgentDockerInput = {
  timestamp: string;
  available: boolean;
  version: string | null;
  inventoryHash: string | null;
  containers: AgentContainerInput[];
};

export type UpdateCategory = "core" | "add-on" | "integration" | "application" | "firmware" | "system" | "container" | "other";
export type UpdateStatus = "available" | "up_to_date" | "installing" | "unknown";

export type UpdateItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  name: string;
  installedVersion: string | null;
  availableVersion: string | null;
  category: UpdateCategory;
  status: UpdateStatus;
  securityCritical: boolean;
  lastCheckedAt: string;
  openUrl: string | null;
  releaseNotesUrl: string | null;
};

export type UpdateSource = {
  id: string;
  name: string;
  configured: boolean;
  connected: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
};

export type UpdateCenterSnapshot = {
  updates: UpdateItem[];
  sources: UpdateSource[];
  availableCount: number;
  securityCriticalCount: number;
  lastCheckedAt: string | null;
};

export type HomeAssistantSettings = {
  configured: boolean;
  url: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
};

export type HomeAssistantSettingsInput = {
  url: string;
  accessToken?: string;
};

export type Overview = {
  status: HealthStatus;
  lastCheckedAt: string;
  serversOnline: number;
  serversTotal: number;
  containersRunning: number;
  containersTotal: number;
  domainsOnline: number;
  domainsTotal: number;
  criticalAlerts: number;
  warnings: number;
  agentsOnline: number;
  agentsTotal: number;
};

export type Server = {
  id: string;
  name: string;
  hostname: string;
  status: HealthStatus;
  os: string | null;
  kernel: string | null;
  architecture: string | null;
  platform: string | null;
  cpuManufacturer: string | null;
  cpuModel: string | null;
  cpuCores: number | null;
  cpuPhysicalCores: number | null;
  cpuSpeedGhz: number | null;
  totalMemoryGb: number | null;
  totalDiskGb: number | null;
  swapTotalGb: number | null;
  primaryIp: string | null;
  ipAddresses: string[];
  uptimeSeconds: number | null;
  lastCheckedAt: string;
  dockerVersion: string | null;
  dockerAvailable: boolean;
  runningContainers: number;
  stoppedContainers: number;
  source?: "local" | "agent";
  agentStatus?: AgentStatus;
};

export type MonitoredServer = {
  id: string;
  name: string;
  backendUrl: string;
  apiKey?: string;
  allowInsecureTls: boolean;
  createdAt: string;
};

export type MonitoredServerStatus = {
  id: string;
  name: string;
  backendUrl: string;
  apiKeyPreview: string | null;
  allowInsecureTls: boolean;
  status: HealthStatus;
  lastCheckedAt: string;
  lastError: string | null;
};

export type CreateMonitoredServerInput = {
  name: string;
  backendUrl: string;
  apiKey?: string;
  allowInsecureTls?: boolean;
};

export type MetricSnapshot = {
  serverId: string;
  cpu: {
    usagePercent: number | null;
    loadAverage: number | null;
    loadAverage5?: number | null;
    loadAverage15?: number | null;
  };
  memory: {
    usedGb: number | null;
    totalGb: number | null;
    usagePercent: number | null;
  };
  disk: {
    usedGb: number | null;
    totalGb: number | null;
    usagePercent: number | null;
  };
  swap: {
    usedGb: number | null;
    totalGb: number | null;
    usagePercent: number | null;
  };
  network: {
    downloadMbps: number | null;
    uploadMbps: number | null;
  };
  uptimeSeconds: number | null;
  createdAt: string;
};

export type MetricHistoryRange = "1h" | "6h" | "24h" | "7d" | "30d";

export type MetricHistoryPoint = {
  timestamp: string;
  cpuUsagePercent: number | null;
  memoryUsagePercent: number | null;
  diskUsagePercent: number | null;
  swapUsagePercent: number | null;
};

export type MetricHistorySummary = {
  current: number | null;
  average: number | null;
  peak: number | null;
};

export type MetricHistory = {
  serverId: string;
  range: MetricHistoryRange;
  from: string;
  to: string;
  intervalSeconds: number;
  points: MetricHistoryPoint[];
  summary: {
    cpu: MetricHistorySummary;
    memory: MetricHistorySummary;
    disk: MetricHistorySummary;
    swap: MetricHistorySummary;
  };
};

export type Container = {
  id: string;
  serverId: string;
  name: string;
  image: string;
  stack: string | null;
  ipAddress: string | null;
  status: ContainerStatus;
  state: string;
  health: ContainerHealth;
  uptime: string;
  cpuPercent: number | null;
  memoryMb: number | null;
  memoryLimitMb: number | null;
  ports: string[];
  publishedPorts: string[];
  restartPolicy: string | null;
  startedAt: string | null;
  logs: string[];
  hostName?: string;
  restartCount?: number | null;
  networks?: string[];
  ipAddresses?: string[];
  uptimeSeconds?: number | null;
};

export type ContainerMonitor = {
  id: string;
  name: string;
  containerRef: string;
  createdAt: string;
};

export type ContainerMonitorStatus = {
  id: string;
  name: string;
  containerRef: string;
  status: HealthStatus;
  matchedContainerId: string | null;
  matchedContainerName: string | null;
  lastCheckedAt: string;
  lastError: string | null;
};

export type CreateContainerMonitorInput = {
  name: string;
  containerRef: string;
};

export type DockerSnapshot = {
  dockerAvailable: boolean;
  dockerVersion: string | null;
  containers: Container[];
  containerMonitors: ContainerMonitorStatus[];
  message?: string;
};

export type DomainCheck = {
  id: string;
  domain: string;
  path: string;
  expectedStatusCodes: number[];
  editable: boolean;
  status: HealthStatus;
  statusCode: number | null;
  responseTimeMs: number | null;
  previousResponseTimeMs: number | null;
  latencyTrendPercent: number | null;
  uptimePercent: number | null;
  checkSamples: number;
  https: boolean;
  sslExpiresAt: string | null;
  sslExpiresInDays: number | null;
  lastCheckedAt: string;
  lastSuccessfulAt: string | null;
  lastFailedAt: string | null;
  error: string | null;
};

export type CreateDomainInput = {
  domain: string;
  path?: string;
  expectedStatusCodes?: number[];
};

export type Alert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  affectedResource: string;
  status: AlertStatus;
  createdAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolvedAt: string | null;
  failedChecks: string[];
  possibleCause: string | null;
  suggestedNextSteps: string[];
};

export type MonitoringSnapshot = {
  overview: Overview;
  server: Server;
  serverMonitors: MonitoredServerStatus[];
  metrics: MetricSnapshot;
  docker: DockerSnapshot;
  domains: DomainCheck[];
  alerts: Alert[];
};
