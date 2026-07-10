export type HealthStatus = "healthy" | "warning" | "critical" | "offline" | "unknown";
export type ContainerStatus = "running" | "stopped" | "restarting" | "exited";
export type ContainerHealth = "healthy" | "unhealthy" | "starting" | "none";
export type AlertSeverity = "critical" | "warning" | "info" | "resolved";
export type AlertStatus = "active" | "resolved";

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
