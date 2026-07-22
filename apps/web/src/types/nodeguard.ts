import type {
  AgentUpdateErrorCode,
  AgentUpdateProvider,
  AgentUpdateStatus
} from "../generated/agentContract";

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

export type AgentEnrollmentProgress = {
  id: string;
  purpose: "enroll" | "rotate";
  displayName: string | null;
  expiresAt: string;
  state: "waiting" | "registered" | "connected" | "online" | "expired" | "revoked";
  agent: {
    id: string;
    displayName: string;
    status: AgentStatus;
    lastSeenAt: string | null;
  } | null;
};

export type CreateAgentEnrollmentInput = {
  displayName?: string;
};

export type UpdateCheckStatus = "waiting" | AgentUpdateStatus;
export type UpdateInventoryFreshness = "waiting" | "current" | "retained" | "stale" | "unsupported";
export type UpdateErrorCode = AgentUpdateErrorCode;

export type MachinePackageUpdate = {
  name: string;
  installedVersion: string;
  candidateVersion: string;
  security: boolean;
  source: string | null;
};

export type MachineUpdateSummary = {
  agentId: string;
  displayName: string;
  hostname: string;
  agentStatus: AgentStatus;
  provider: AgentUpdateProvider | null;
  supported: boolean | null;
  status: UpdateCheckStatus;
  freshness: UpdateInventoryFreshness;
  os: {
    id: string | null;
    versionId: string | null;
    prettyName: string | null;
  };
  checkedAt: string | null;
  lastSuccessfulAt: string | null;
  updateCount: number | null;
  securityUpdateCount: number | null;
  rebootRequired: boolean | null;
  truncated: boolean;
  lastError: string | null;
  lastErrorCode: UpdateErrorCode | null;
  packages?: MachinePackageUpdate[];
};

export type MachineUpdateDetail = MachineUpdateSummary & {
  packages: MachinePackageUpdate[];
};

export type UpdateCenterSummaryState = "empty" | "waiting" | "current" | "partial" | "retained";

export type UpdateCenterSnapshot = {
  availableCount: number | null;
  securityCriticalCount: number | null;
  reportingMachineCount: number;
  currentReportingMachineCount: number;
  retainedMachineCount: number;
  totalMachineCount: number;
  lastCheckedAt: string | null;
  lastSuccessfulAt: string | null;
  summaryState: UpdateCenterSummaryState;
  machines: MachineUpdateSummary[];
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

export type ServerListItem = Server | MonitoredServerStatus;

export type CreateMonitoredServerInput = {
  name: string;
  backendUrl: string;
  apiKey?: string;
  allowInsecureTls?: boolean;
};

export type MetricSnapshot = {
  serverId: string;
  cpu: { usagePercent: number | null; loadAverage: number | null; loadAverage5?: number | null; loadAverage15?: number | null };
  memory: { usedGb: number | null; totalGb: number | null; usagePercent: number | null };
  disk: { usedGb: number | null; totalGb: number | null; usagePercent: number | null };
  swap: { usedGb: number | null; totalGb: number | null; usagePercent: number | null };
  network: { downloadMbps: number | null; uploadMbps: number | null };
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

export type AuthUser = {
  id: string;
  username: string;
  role: string;
  dataMode: "live" | "demo";
};

export type AuthSession = {
  authenticated: boolean;
  user: AuthUser | null;
};

export type LoginInput = {
  username: string;
  password: string;
  rememberMe: boolean;
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

export type BackendConfig = {
  backendUrl: string;
  user: AuthUser;
  connectedAt: string;
};

export type ProxmoxNodeHistoryRange = "1h" | "6h" | "12h" | "24h" | "7d" | "30d" | "90d";
export type ProxmoxNodeTab = "overview" | "history";

export type ProxmoxNodeDetail = {
  connectionId: string;
  connectionName: string;
  connectionStatus: string;
  displayName: string;
  node: string;
  status: string;
  uptimeSeconds: number | null;
  lastSyncAt: string | null;
  lastTelemetryAt: string | null;
  stale: boolean;
  platform: {
    pveVersion: string | null;
    kernelVersion: string | null;
    cluster: string | null;
    connection: string | null;
  };
  hardware: {
    cpuModel: string | null;
    cpuCores: number | null;
    cpuSockets: number | null;
    architecture: string | null;
  };
  memory: {
    usagePercent: number | null;
    usedBytes: number | null;
    totalBytes: number | null;
    freeBytes: number | null;
    reclaimableBytes: number | null;
  };
  storage: {
    usagePercent: number | null;
    usedBytes: number | null;
    totalBytes: number | null;
    freeBytes: number | null;
    readBytesPerSecond: number | null;
    writeBytesPerSecond: number | null;
  };
  telemetry: {
    networkInBytesPerSecond: number | null;
    networkOutBytesPerSecond: number | null;
    source: string;
    state: string;
  };
  thermals: {
    sensors: Array<{ name: string; celsius: number }>;
    lastUpdatedAt: string | null;
  };
};

export type ProxmoxNodeHistoryPoint = {
  timestamp: string;
  cpuUsagePercent: number | null;
  memoryUsagePercent: number | null;
  rootUsagePercent: number | null;
  networkInBytesPerSecond: number | null;
  networkOutBytesPerSecond: number | null;
  diskReadBytesPerSecond: number | null;
  diskWriteBytesPerSecond: number | null;
  temperaturesCelsius: Record<string, number>;
};

export type ProxmoxNodeHistory = {
  connectionId: string;
  node: string;
  range: ProxmoxNodeHistoryRange;
  sourceTimeframe: "hour" | "day" | "week" | "month" | "year";
  from: string;
  to: string;
  fetchedAt: string;
  stale: boolean;
  points: ProxmoxNodeHistoryPoint[];
  availableMetrics: {
    utilization: boolean;
    network: boolean;
    disk: boolean;
    thermals: boolean;
  };
};
