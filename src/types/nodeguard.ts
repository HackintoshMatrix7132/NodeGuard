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
  os: string;
  kernel: string;
  uptimeSeconds: number;
  lastCheckedAt: string;
  dockerVersion: string;
  runningContainers: number;
  stoppedContainers: number;
};

export type MetricSnapshot = {
  serverId: string;
  cpu: {
    usagePercent: number;
    loadAverage: number;
  };
  memory: {
    usedGb: number;
    totalGb: number;
    usagePercent: number;
  };
  disk: {
    usedGb: number;
    totalGb: number;
    usagePercent: number;
  };
  swap: {
    usedGb: number;
    totalGb: number;
    usagePercent: number;
  };
  network: {
    downloadMbps: number;
    uploadMbps: number;
  };
  uptimeSeconds: number;
  createdAt: string;
};

export type Container = {
  id: string;
  serverId: string;
  name: string;
  image: string;
  status: ContainerStatus;
  health: ContainerHealth;
  uptime: string;
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
  ports: string[];
  restartPolicy: string;
  startedAt: string;
  logs: string[];
};

export type DomainCheck = {
  id: string;
  domain: string;
  status: HealthStatus;
  statusCode: number | null;
  responseTimeMs: number | null;
  https: boolean;
  sslExpiresAt: string | null;
  lastCheckedAt: string;
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
  suggestedNextSteps: string[];
};

export type BackendConfig = {
  backendUrl: string;
  apiKeyPreview: string;
  connectedAt: string;
};
