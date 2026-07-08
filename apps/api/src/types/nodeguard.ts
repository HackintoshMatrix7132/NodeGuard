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
  createdAt: string;
};

export type MonitoredServerStatus = {
  id: string;
  name: string;
  backendUrl: string;
  apiKeyPreview: string | null;
  status: HealthStatus;
  lastCheckedAt: string;
  lastError: string | null;
};

export type CreateMonitoredServerInput = {
  name: string;
  backendUrl: string;
  apiKey?: string;
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

export type Container = {
  id: string;
  serverId: string;
  name: string;
  image: string;
  status: ContainerStatus;
  state: string;
  health: ContainerHealth;
  uptime: string;
  cpuPercent: number | null;
  memoryMb: number | null;
  memoryLimitMb: number | null;
  ports: string[];
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
  editable: boolean;
  status: HealthStatus;
  statusCode: number | null;
  responseTimeMs: number | null;
  https: boolean;
  sslExpiresAt: string | null;
  sslExpiresInDays: number | null;
  lastCheckedAt: string;
  error: string | null;
};

export type CreateDomainInput = {
  domain: string;
};

export type Alert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  affectedResource: string;
  status: AlertStatus;
  createdAt: string;
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
