import type { AgentDetail, AgentSummary, Alert, Container, DockerSnapshot, DomainCheck, MachineUpdateDetail, MetricHistory, MetricHistoryRange, MetricSnapshot, MonitoredServerStatus, Overview, Server, UpdateCenterSnapshot } from "./types/nodeguard";
import { AGENT_UPDATE_PROVIDER } from "./generated/agentContract";

const now = () => new Date().toISOString();
const ago = ({ minutes = 0, hours = 0, days = 0 }: { minutes?: number; hours?: number; days?: number }) => new Date(Date.now() - (((days * 24 + hours) * 60 + minutes) * 60 * 1000)).toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

export const demoServer: Server = {
  id: "local-node",
  name: "nodeguard-demo-host",
  hostname: "demo-control-01",
  status: "healthy",
  os: "Ubuntu 24.04.2 LTS",
  kernel: "6.8.0-63-generic",
  architecture: "x64",
  platform: "linux",
  cpuManufacturer: "AMD",
  cpuModel: "Ryzen 7 5700G with Radeon Graphics",
  cpuCores: 16,
  cpuPhysicalCores: 8,
  cpuSpeedGhz: 3.8,
  totalMemoryGb: 32,
  totalDiskGb: 1000,
  swapTotalGb: 8,
  primaryIp: "192.0.2.20",
  ipAddresses: ["192.0.2.20", "172.20.0.1", "172.21.0.1"],
  uptimeSeconds: 1_130_400,
  lastCheckedAt: now(),
  dockerVersion: "27.5.1",
  dockerAvailable: true,
  runningContainers: 9,
  stoppedContainers: 3
};

export const demoMetrics: MetricSnapshot = {
  serverId: "local-node",
  cpu: { usagePercent: 18.7, loadAverage: 1.24 },
  memory: { usedGb: 16.8, totalGb: 32, usagePercent: 52.5 },
  disk: { usedGb: 386.4, totalGb: 1000, usagePercent: 38.6 },
  swap: { usedGb: 0.6, totalGb: 8, usagePercent: 7.5 },
  network: { downloadMbps: 42.8, uploadMbps: 8.7 },
  uptimeSeconds: 1_130_400,
  createdAt: now()
};

const demoAgentDefinitions = [
  { id: "agent-docker-main", displayName: "Docker main", hostname: "docker-main", status: "online" as const, os: "Ubuntu 24.04.2 LTS", version: "0.2.0", cpu: 21.8, memory: 48.2, disk: 37.4, swap: 4.1, ip: "192.0.2.41", docker: true, dockerVersion: "27.5.1", lastSeenMinutes: 0, registeredDays: 34 },
  { id: "agent-photos-vm", displayName: "Photos VM", hostname: "photos-vm", status: "online" as const, os: "Debian GNU/Linux 12", version: "0.2.0", cpu: 38.6, memory: 76.4, disk: 61.2, swap: 12.8, ip: "192.0.2.42", docker: true, dockerVersion: "27.5.1", lastSeenMinutes: 0, registeredDays: 27 },
  { id: "agent-pve-main", displayName: "PVE main", hostname: "pve-main", status: "online" as const, os: "Proxmox VE 8.4", version: "0.2.0", cpu: 14.7, memory: 43.1, disk: 54.8, swap: 2.4, ip: "192.0.2.40", docker: false, dockerVersion: null, lastSeenMinutes: 0, registeredDays: 48 },
  { id: "agent-backup-node", displayName: "Backup appliance", hostname: "backup-appliance", status: "stale" as const, os: "Alpine Linux 3.21", version: "0.2.0", cpu: 7.2, memory: 31.5, disk: 72.1, swap: null, ip: "192.0.2.43", docker: false, dockerVersion: null, lastSeenMinutes: 2, registeredDays: 18 },
  { id: "agent-edge-node", displayName: "Edge node", hostname: "edge-node", status: "offline" as const, os: "Ubuntu Server 22.04 LTS", version: "0.2.0", cpu: null, memory: null, disk: null, swap: null, ip: "198.51.100.44", docker: false, dockerVersion: null, lastSeenMinutes: 43, registeredDays: 9 }
];

export const demoAgents: AgentSummary[] = demoAgentDefinitions.map((agent) => ({
  id: agent.id,
  displayName: agent.displayName,
  hostname: agent.hostname,
  status: agent.status,
  agentVersion: agent.version,
  osName: agent.os,
  osVersion: null,
  kernel: "6.8.0-63-generic",
  architecture: "amd64",
  cpuUsagePercent: agent.cpu,
  memoryUsagePercent: agent.memory,
  diskUsagePercent: agent.disk,
  swapUsagePercent: agent.swap,
  dockerAvailable: agent.docker,
  dockerVersion: agent.dockerVersion,
  containerCount: 0,
  registeredAt: ago({ days: agent.registeredDays }),
  lastSeenAt: ago({ minutes: agent.lastSeenMinutes }),
  lastMetricsAt: agent.status === "offline" ? ago({ minutes: 43 }) : ago({ minutes: agent.lastSeenMinutes }),
  lastInventoryAt: ago({ hours: 3 }),
  lastDockerAt: agent.docker ? ago({ minutes: agent.lastSeenMinutes }) : ago({ hours: 1 }),
  credentialStatus: "active"
}));

const demoAgentMetrics = Object.fromEntries(demoAgentDefinitions.map((agent) => [agent.id, {
  serverId: agent.id,
  cpu: { usagePercent: agent.cpu, loadAverage: agent.cpu === null ? null : Number((agent.cpu / 20).toFixed(2)), loadAverage5: agent.cpu === null ? null : Number((agent.cpu / 22).toFixed(2)), loadAverage15: agent.cpu === null ? null : Number((agent.cpu / 24).toFixed(2)) },
  memory: { usedGb: agent.memory === null ? null : Number((agent.memory / 100 * 16).toFixed(1)), totalGb: agent.memory === null ? null : 16, usagePercent: agent.memory },
  disk: { usedGb: agent.disk === null ? null : Number((agent.disk / 100 * 500).toFixed(1)), totalGb: agent.disk === null ? null : 500, usagePercent: agent.disk },
  swap: { usedGb: agent.swap === null ? null : Number((agent.swap / 100 * 4).toFixed(1)), totalGb: agent.swap === null ? null : 4, usagePercent: agent.swap },
  network: { downloadMbps: null, uploadMbps: null },
  uptimeSeconds: agent.status === "offline" ? 610200 : 1123000,
  createdAt: ago({ minutes: agent.lastSeenMinutes })
} satisfies MetricSnapshot])) as Record<string, MetricSnapshot>;

const demoHistoryConfig: Record<MetricHistoryRange, { durationMs: number; intervalSeconds: number }> = {
  "1h": { durationMs: 60 * 60 * 1000, intervalSeconds: 60 },
  "6h": { durationMs: 6 * 60 * 60 * 1000, intervalSeconds: 5 * 60 },
  "24h": { durationMs: 24 * 60 * 60 * 1000, intervalSeconds: 15 * 60 },
  "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, intervalSeconds: 60 * 60 },
  "30d": { durationMs: 30 * 24 * 60 * 60 * 1000, intervalSeconds: 4 * 60 * 60 }
};

function demoWave(index: number, total: number, base: number, amplitude: number, phase: number) {
  const progress = index / Math.max(total - 1, 1);
  const primary = Math.sin(progress * Math.PI * 4 + phase);
  const secondary = Math.sin(progress * Math.PI * 13 + phase * 0.7) * 0.32;
  return base + amplitude * (primary + secondary);
}

function metricValue(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function summarize(values: Array<number | null>) {
  const available = values.filter((value): value is number => typeof value === "number");
  return {
    current: available.at(-1) ?? null,
    average: available.length ? Number((available.reduce((total, value) => total + value, 0) / available.length).toFixed(2)) : null,
    peak: available.length ? Math.max(...available) : null
  };
}

export function getDemoMetricHistory(range: MetricHistoryRange): MetricHistory {
  const config = demoHistoryConfig[range];
  const toMs = Date.now();
  const fromMs = toMs - config.durationMs;
  const pointCount = Math.floor(config.durationMs / (config.intervalSeconds * 1000)) + 1;
  const points = Array.from({ length: pointCount }, (_, index) => {
    const progress = index / Math.max(pointCount - 1, 1);
    const backupSpike = progress > 0.54 && progress < 0.62 ? Math.sin(((progress - 0.54) / 0.08) * Math.PI) * 32 : 0;
    return {
      timestamp: new Date(fromMs + index * config.intervalSeconds * 1000).toISOString(),
      cpuUsagePercent: index === pointCount - 1 ? demoMetrics.cpu.usagePercent : metricValue(demoWave(index, pointCount, 27, 14, 0.4) + backupSpike),
      memoryUsagePercent: index === pointCount - 1 ? demoMetrics.memory.usagePercent : metricValue(demoWave(index, pointCount, 48 + progress * 4, 4.2, 1.1)),
      diskUsagePercent: index === pointCount - 1 ? demoMetrics.disk.usagePercent : metricValue(37.1 + progress * 1.5 + Math.sin(progress * Math.PI * 6) * 0.18),
      swapUsagePercent: index === pointCount - 1 ? demoMetrics.swap.usagePercent : metricValue(demoWave(index, pointCount, 5.4, 2.6, 2.2) + (progress > 0.55 ? 1.2 : 0))
    };
  });

  return {
    serverId: "local-node",
    range,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    intervalSeconds: config.intervalSeconds,
    points,
    summary: {
      cpu: summarize(points.map((point) => point.cpuUsagePercent)),
      memory: summarize(points.map((point) => point.memoryUsagePercent)),
      disk: summarize(points.map((point) => point.diskUsagePercent)),
      swap: summarize(points.map((point) => point.swapUsagePercent))
    }
  };
}

const baseDemoContainers: Container[] = [
  { id: "traefik001", serverId: "local-node", name: "traefik", image: "traefik:v3.4", stack: "edge", ipAddress: "172.18.0.2", status: "running", state: "running", health: "healthy", uptime: "13d 2h", cpuPercent: 1.2, memoryMb: 92, memoryLimitMb: 256, ports: ["80/tcp", "443/tcp"], publishedPorts: ["80:80", "443:443"], restartPolicy: "unless-stopped", startedAt: ago({ days: 13, hours: 2 }), logs: ["Configuration loaded from file", "Provider event received from docker", "Health check passed"] },
  { id: "vault001", serverId: "local-node", name: "vaultwarden", image: "vaultwarden/server:1.33.2", stack: "security", ipAddress: "172.18.0.3", status: "running", state: "running", health: "healthy", uptime: "12d 18h", cpuPercent: 0.8, memoryMb: 184, memoryLimitMb: 512, ports: ["80/tcp"], publishedPorts: ["8080:80"], restartPolicy: "unless-stopped", startedAt: ago({ days: 12, hours: 18 }), logs: ["Rocket has launched from http://0.0.0.0:80", "Database pool initialized", "Background jobs completed"] },
  { id: "next001", serverId: "local-node", name: "nextcloud", image: "nextcloud:30-apache", stack: "cloud", ipAddress: "172.18.0.4", status: "running", state: "running", health: "healthy", uptime: "8d 6h", cpuPercent: 3.4, memoryMb: 1360, memoryLimitMb: 2048, ports: ["80/tcp"], publishedPorts: ["8081:80"], restartPolicy: "unless-stopped", startedAt: ago({ days: 8, hours: 6 }), logs: ["Apache configured", "Background job finished", "No pending migrations"] },
  { id: "pg001", serverId: "local-node", name: "postgres", image: "postgres:16.9-alpine", stack: "cloud", ipAddress: "172.18.0.5", status: "running", state: "running", health: "healthy", uptime: "21d 4h", cpuPercent: 1.1, memoryMb: 428, memoryLimitMb: 1024, ports: ["5432/tcp"], publishedPorts: [], restartPolicy: "unless-stopped", startedAt: ago({ days: 21, hours: 4 }), logs: ["Database system is ready to accept connections", "Checkpoint complete"] },
  { id: "port001", serverId: "local-node", name: "portainer", image: "portainer/portainer-ce:2.27.6", stack: "management", ipAddress: "172.18.0.6", status: "running", state: "running", health: "none", uptime: "18d 9h", cpuPercent: 0.4, memoryMb: 146, memoryLimitMb: 512, ports: ["9443/tcp", "8000/tcp"], publishedPorts: ["9443:9443"], restartPolicy: "always", startedAt: ago({ days: 18, hours: 9 }), logs: ["Portainer instance started", "HTTPS server listening on :9443"] },
  { id: "immich001", serverId: "local-node", name: "immich-server", image: "ghcr.io/immich-app/immich-server:v1.135.3", stack: "photos", ipAddress: "172.19.0.7", status: "running", state: "running", health: "healthy", uptime: "5d 11h", cpuPercent: 4.8, memoryMb: 1120, memoryLimitMb: 2048, ports: ["2283/tcp"], publishedPorts: ["2283:2283"], restartPolicy: "unless-stopped", startedAt: ago({ days: 5, hours: 11 }), logs: ["Immich Server is listening on 0.0.0.0:2283", "Microservices worker ready", "Library scan completed"] },
  { id: "redis001", serverId: "local-node", name: "redis", image: "redis:7.4-alpine", stack: "photos", ipAddress: "172.19.0.8", status: "running", state: "running", health: "healthy", uptime: "21d 4h", cpuPercent: 0.2, memoryMb: 74, memoryLimitMb: 256, ports: ["6379/tcp"], publishedPorts: [], restartPolicy: "unless-stopped", startedAt: ago({ days: 21, hours: 4 }), logs: ["Ready to accept connections tcp"] },
  { id: "home001", serverId: "local-node", name: "homepage", image: "ghcr.io/gethomepage/homepage:v1.2.0", stack: "management", ipAddress: "172.18.0.11", status: "running", state: "running", health: "healthy", uptime: "7d 16h", cpuPercent: 0.3, memoryMb: 118, memoryLimitMb: 256, ports: ["3000/tcp"], publishedPorts: ["3001:3000"], restartPolicy: "unless-stopped", startedAt: ago({ days: 7, hours: 16 }), logs: ["Homepage started on port 3000", "Configuration validated"] },
  { id: "paper001", serverId: "local-node", name: "paperless-web", image: "ghcr.io/paperless-ngx/paperless-ngx:2.16.3", stack: "documents", ipAddress: "172.20.0.4", status: "running", state: "running", health: "unhealthy", uptime: "2d 3h", cpuPercent: 7.9, memoryMb: 946, memoryLimitMb: 1536, ports: ["8000/tcp"], publishedPorts: ["8010:8000"], restartPolicy: "unless-stopped", startedAt: ago({ days: 2, hours: 3 }), logs: ["Web server ready", "Health probe exceeded 5 seconds", "Task queue is responding slowly"] },
  { id: "backup001", serverId: "local-node", name: "restic-backup", image: "restic/restic:0.17.3", stack: "backup", ipAddress: "172.21.0.3", status: "restarting", state: "restarting (2)", health: "starting", uptime: "Restarting for 4m", cpuPercent: null, memoryMb: 42, memoryLimitMb: 256, ports: [], publishedPorts: [], restartPolicy: "on-failure:5", startedAt: ago({ minutes: 4 }), logs: ["Repository check failed: temporary network timeout", "Retrying backup in 30 seconds"] },
  { id: "ente001", serverId: "local-node", name: "ente-server", image: "ghcr.io/ente-io/server:latest", stack: "photos", ipAddress: null, status: "exited", state: "exited (1)", health: "none", uptime: "Exited 18 minutes ago", cpuPercent: null, memoryMb: null, memoryLimitMb: 1024, ports: ["8080/tcp"], publishedPorts: ["8082:8080"], restartPolicy: "unless-stopped", startedAt: null, logs: ["Database connection refused", "Process exited with code 1"] },
  { id: "worker001", serverId: "local-node", name: "legacy-worker", image: "node:20-alpine", stack: "archive", ipAddress: null, status: "stopped", state: "created", health: "none", uptime: "Stopped 6d ago", cpuPercent: null, memoryMb: null, memoryLimitMb: null, ports: [], publishedPorts: [], restartPolicy: "no", startedAt: null, logs: [] }
];

const agentHostByContainer: Record<string, { serverId: string; hostName: string }> = {
  traefik001: { serverId: "agent-docker-main", hostName: "Docker main" },
  vault001: { serverId: "agent-docker-main", hostName: "Docker main" },
  port001: { serverId: "agent-docker-main", hostName: "Docker main" },
  home001: { serverId: "agent-docker-main", hostName: "Docker main" },
  immich001: { serverId: "agent-photos-vm", hostName: "Photos VM" },
  pg001: { serverId: "agent-photos-vm", hostName: "Photos VM" },
  redis001: { serverId: "agent-photos-vm", hostName: "Photos VM" },
  paper001: { serverId: "agent-photos-vm", hostName: "Photos VM" }
};

export const demoContainers: Container[] = baseDemoContainers.map((container) => ({
  ...container,
  ...(agentHostByContainer[container.id] ?? { serverId: "local-node", hostName: "Demo control host" })
}));

for (const agent of demoAgents) {
  agent.containerCount = demoContainers.filter((container) => container.serverId === agent.id).length;
}

export const demoAgentDetails: Record<string, AgentDetail> = Object.fromEntries(demoAgents.map((agent) => {
  const definition = demoAgentDefinitions.find((item) => item.id === agent.id)!;
  return [agent.id, {
    ...agent,
    cpuModel: "AMD EPYC 7282 16-Core Processor",
    physicalCoreCount: 4,
    logicalCpuCount: 8,
    totalMemoryBytes: agent.memoryUsagePercent === null ? null : 16 * 1024 ** 3,
    totalSwapBytes: agent.swapUsagePercent === null ? null : 4 * 1024 ** 3,
    filesystems: [{ device: "/dev/vda1", mount: "/", filesystem: "ext4", totalBytes: 500 * 1024 ** 3 }],
    ipAddresses: [definition.ip],
    bootTime: ago({ days: 13 }),
    systemUptimeSeconds: demoAgentMetrics[agent.id].uptimeSeconds,
    latestMetrics: demoAgentMetrics[agent.id],
    containers: demoContainers.filter((container) => container.serverId === agent.id)
  } satisfies AgentDetail];
}));

export const demoAgentServers: Server[] = demoAgents.map((agent) => {
  const detail = demoAgentDetails[agent.id];
  const metrics = detail.latestMetrics;
  return {
    id: agent.id,
    name: agent.displayName,
    hostname: agent.hostname,
    status: agent.status === "online" ? "healthy" : agent.status === "stale" ? "warning" : "offline",
    source: "agent",
    agentStatus: agent.status,
    os: [agent.osName, agent.osVersion].filter(Boolean).join(" "),
    kernel: agent.kernel,
    architecture: agent.architecture,
    platform: "linux",
    cpuManufacturer: "AMD",
    cpuModel: detail.cpuModel,
    cpuCores: detail.logicalCpuCount,
    cpuPhysicalCores: detail.physicalCoreCount,
    cpuSpeedGhz: null,
    totalMemoryGb: metrics?.memory.totalGb ?? null,
    totalDiskGb: metrics?.disk.totalGb ?? null,
    swapTotalGb: metrics?.swap.totalGb ?? null,
    primaryIp: detail.ipAddresses[0] ?? null,
    ipAddresses: detail.ipAddresses,
    uptimeSeconds: detail.systemUptimeSeconds,
    lastCheckedAt: agent.lastSeenAt ?? agent.registeredAt,
    dockerVersion: agent.dockerVersion,
    dockerAvailable: agent.dockerAvailable,
    runningContainers: detail.containers.filter((container) => container.status === "running").length,
    stoppedContainers: detail.containers.filter((container) => container.status !== "running").length
  };
});

export const demoServers: Server[] = [demoServer, ...demoAgentServers];

export const demoDocker: DockerSnapshot = {
  dockerAvailable: true,
  dockerVersion: "27.5.1",
  containers: demoContainers,
  containerMonitors: [
    { id: "vaultwarden", name: "Vaultwarden", containerRef: "vaultwarden", status: "healthy", matchedContainerId: "vault001", matchedContainerName: "vaultwarden", lastCheckedAt: now(), lastError: null },
    { id: "immich-server", name: "Immich", containerRef: "immich-server", status: "healthy", matchedContainerId: "immich001", matchedContainerName: "immich-server", lastCheckedAt: now(), lastError: null },
    { id: "paperless-web", name: "Paperless", containerRef: "paperless-web", status: "warning", matchedContainerId: "paper001", matchedContainerName: "paperless-web", lastCheckedAt: now(), lastError: "Container is running but its Docker health check is unhealthy." },
    { id: "restic-backup", name: "Nightly backup", containerRef: "restic-backup", status: "warning", matchedContainerId: "backup001", matchedContainerName: "restic-backup", lastCheckedAt: now(), lastError: "Container is restarting while retrying the repository connection." },
    { id: "ente-server", name: "Ente", containerRef: "ente-server", status: "offline", matchedContainerId: "ente001", matchedContainerName: "ente-server", lastCheckedAt: now(), lastError: "Container exited with code 1." }
  ]
};

export const demoDomains: DomainCheck[] = [
  { id: "vault-demo-example", domain: "https://vault.demo.example", path: "/", expectedStatusCodes: [200, 301, 302, 401], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 142, previousResponseTimeMs: 151, latencyTrendPercent: -6, uptimePercent: 99.99, checkSamples: 43200, https: true, sslExpiresAt: inDays(72), sslExpiresInDays: 72, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ days: 18 }), error: null },
  { id: "cloud-demo-example", domain: "https://cloud.demo.example", path: "/status.php", expectedStatusCodes: [200], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 318, previousResponseTimeMs: 344, latencyTrendPercent: -7.6, uptimePercent: 99.97, checkSamples: 43198, https: true, sslExpiresAt: inDays(72), sslExpiresInDays: 72, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ days: 4 }), error: null },
  { id: "status-demo-example", domain: "https://status.demo.example", path: "/api/heartbeat", expectedStatusCodes: [200], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 67, previousResponseTimeMs: 72, latencyTrendPercent: -6.9, uptimePercent: 100, checkSamples: 43200, https: true, sslExpiresAt: inDays(118), sslExpiresInDays: 118, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: null, error: null },
  { id: "storage-demo-example", domain: "https://storage.demo.example", path: "/", expectedStatusCodes: [200, 401], editable: true, status: "healthy", statusCode: 401, responseTimeMs: 24, previousResponseTimeMs: 26, latencyTrendPercent: -7.7, uptimePercent: 99.99, checkSamples: 43200, https: true, sslExpiresAt: inDays(164), sslExpiresInDays: 164, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ days: 23 }), error: null },
  { id: "home-demo-example", domain: "https://home.demo.example", path: "/", expectedStatusCodes: [200], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 104, previousResponseTimeMs: 110, latencyTrendPercent: -5.5, uptimePercent: 99.96, checkSamples: 43190, https: true, sslExpiresAt: inDays(72), sslExpiresInDays: 72, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ hours: 12 }), error: null },
  { id: "metrics-demo-example", domain: "https://metrics.demo.example", path: "/api/health", expectedStatusCodes: [200], editable: true, status: "warning", statusCode: 200, responseTimeMs: 1840, previousResponseTimeMs: 620, latencyTrendPercent: 196.8, uptimePercent: 99.91, checkSamples: 43160, https: true, sslExpiresAt: inDays(19), sslExpiresInDays: 19, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ hours: 3 }), error: "Endpoint is reachable but response latency exceeds the warning threshold." },
  { id: "photos-demo-example", domain: "https://photos.demo.example", path: "/api/server/ping", expectedStatusCodes: [200], editable: true, status: "critical", statusCode: 502, responseTimeMs: 93, previousResponseTimeMs: 89, latencyTrendPercent: 4.5, uptimePercent: 98.74, checkSamples: 43196, https: true, sslExpiresAt: inDays(52), sslExpiresInDays: 52, lastCheckedAt: now(), lastSuccessfulAt: ago({ minutes: 21 }), lastFailedAt: now(), error: "Expected HTTP 200 but received HTTP 502." },
  { id: "dns-console", domain: "http://192.0.2.53", path: "/admin/", expectedStatusCodes: [200, 302], editable: true, status: "offline", statusCode: null, responseTimeMs: null, previousResponseTimeMs: 18, latencyTrendPercent: null, uptimePercent: 97.42, checkSamples: 42910, https: false, sslExpiresAt: null, sslExpiresInDays: null, lastCheckedAt: now(), lastSuccessfulAt: ago({ minutes: 14 }), lastFailedAt: now(), error: "Connection timed out after 5 seconds." },
  { id: "legacy-console", domain: "https://198.51.100.44:8443", path: "/", expectedStatusCodes: [200], editable: true, status: "unknown", statusCode: null, responseTimeMs: null, previousResponseTimeMs: null, latencyTrendPercent: null, uptimePercent: null, checkSamples: 0, https: true, sslExpiresAt: null, sslExpiresInDays: null, lastCheckedAt: now(), lastSuccessfulAt: null, lastFailedAt: now(), error: "TLS certificate details are unavailable for this internal endpoint." }
];

export const demoAlerts: Alert[] = [
  { id: "agent-backup-node-stale", severity: "warning", title: "Backup node agent is stale", message: "The latest heartbeat is overdue but remains within the configured grace period.", affectedResource: "Backup node", status: "active", createdAt: ago({ minutes: 2 }), firstSeenAt: ago({ minutes: 2 }), lastSeenAt: now(), occurrenceCount: 2, resolvedAt: null, failedChecks: ["agent status: stale"], possibleCause: "The backup host may have intermittent outbound connectivity.", suggestedNextSteps: ["Check the systemd service.", "Inspect the agent journal."] },
  { id: "agent-edge-node-offline", severity: "critical", title: "Edge node agent is offline", message: "No heartbeat has arrived within the offline threshold.", affectedResource: "Edge node", status: "active", createdAt: ago({ minutes: 43 }), firstSeenAt: ago({ minutes: 43 }), lastSeenAt: now(), occurrenceCount: 9, resolvedAt: null, failedChecks: ["agent status: offline"], possibleCause: "The edge host may be powered off or disconnected.", suggestedNextSteps: ["Check host power and network.", "Inspect the agent systemd service."] },
  { id: "updates-available", severity: "info", title: "17 operating-system updates available", message: "NodeGuard Agents reported package updates for monitored machines.", affectedResource: "Update Center", status: "active", createdAt: ago({ minutes: 11 }), firstSeenAt: ago({ minutes: 11 }), lastSeenAt: now(), occurrenceCount: 1, resolvedAt: null, failedChecks: ["17 package updates available"], possibleCause: null, suggestedNextSteps: ["Open the Update Center.", "Review the affected machines and package details.", "Schedule maintenance on each machine when appropriate."] },
  { id: "security-updates-available", severity: "warning", title: "4 security updates available", message: "NodeGuard Agents reported security-classified package updates for monitored machines.", affectedResource: "Update Center", status: "active", createdAt: ago({ minutes: 11 }), firstSeenAt: ago({ minutes: 11 }), lastSeenAt: now(), occurrenceCount: 1, resolvedAt: null, failedChecks: ["4 security updates available"], possibleCause: null, suggestedNextSteps: ["Open the Update Center.", "Review the affected machines and security-classified packages.", "Schedule maintenance on each machine when appropriate."] },
  { id: "domain-photos-502", severity: "critical", title: "photos.demo.example returned HTTP 502", message: "The reverse proxy cannot reach the photo-service upstream.", affectedResource: "https://photos.demo.example", status: "active", createdAt: ago({ minutes: 21 }), firstSeenAt: ago({ minutes: 21 }), lastSeenAt: now(), occurrenceCount: 7, resolvedAt: null, failedChecks: ["HTTP 502", "upstream ping failed"], possibleCause: "The reverse proxy route points to an unavailable upstream service.", suggestedNextSteps: ["Inspect reverse proxy logs.", "Verify the photo-service container network.", "Confirm the upstream port is 2283."] },
  { id: "domain-dns-timeout", severity: "critical", title: "DNS console is unreachable", message: "The internal DNS dashboard timed out after 5 seconds.", affectedResource: "http://192.0.2.53", status: "active", createdAt: ago({ minutes: 14 }), firstSeenAt: ago({ minutes: 14 }), lastSeenAt: now(), occurrenceCount: 5, resolvedAt: null, failedChecks: ["TCP connection timeout", "HTTP check unavailable"], possibleCause: "The DNS console host may be offline or isolated from the monitoring network.", suggestedNextSteps: ["Ping 192.0.2.53 from the NodeGuard host.", "Check the DNS console VM state.", "Verify firewall rules."] },
  { id: "container-ente-stopped", severity: "warning", title: "archive-service is not running", message: "The monitored archive-service container exited with code 1.", affectedResource: "archive-service", status: "active", createdAt: ago({ minutes: 18 }), firstSeenAt: ago({ minutes: 18 }), lastSeenAt: now(), occurrenceCount: 6, resolvedAt: null, failedChecks: ["container state: exited", "database connection refused"], possibleCause: "The service cannot establish its database connection.", suggestedNextSteps: ["Inspect container logs.", "Verify database credentials.", "Check the Compose dependency health."] },
  { id: "domain-metrics-latency", severity: "warning", title: "Metrics endpoint response time is elevated", message: "The endpoint is healthy but responded in 1840 ms.", affectedResource: "https://metrics.demo.example", status: "active", createdAt: ago({ minutes: 9 }), firstSeenAt: ago({ minutes: 9 }), lastSeenAt: now(), occurrenceCount: 3, resolvedAt: null, failedChecks: ["latency above 1500 ms"], possibleCause: "A dashboard query or storage operation may be saturating the metrics service.", suggestedNextSteps: ["Review service logs.", "Inspect host I/O usage.", "Check datasource latency."] },
  { id: "resolved-vaultwarden-health", severity: "warning", title: "Vaultwarden health check recovered", message: "The container returned to a healthy state after one failed probe.", affectedResource: "vaultwarden", status: "resolved", createdAt: ago({ hours: 4 }), firstSeenAt: ago({ hours: 4 }), lastSeenAt: ago({ hours: 3, minutes: 51 }), occurrenceCount: 2, resolvedAt: ago({ hours: 3, minutes: 51 }), failedChecks: ["Docker health: unhealthy"], possibleCause: "A short database lock delayed the health endpoint.", suggestedNextSteps: ["No immediate action required.", "Review logs if the event repeats."] },
  { id: "resolved-compute-node", severity: "critical", title: "Compute node recovered", message: "The monitored compute node is reachable again.", affectedResource: "Compute node", status: "resolved", createdAt: ago({ days: 1, hours: 2 }), firstSeenAt: ago({ days: 1, hours: 2 }), lastSeenAt: ago({ days: 1, hours: 1, minutes: 42 }), occurrenceCount: 12, resolvedAt: ago({ days: 1, hours: 1, minutes: 42 }), failedChecks: ["HTTPS connection refused", "server monitor offline"], possibleCause: "The host rebooted after scheduled package updates.", suggestedNextSteps: ["Confirm the maintenance completed.", "Review boot logs if downtime was unexpected."] },
  { id: "resolved-cpu-elevated", severity: "warning", title: "CPU usage returned to normal", message: "CPU usage remained above 80% during the backup window.", affectedResource: "demo-control-01", status: "resolved", createdAt: ago({ days: 2, hours: 3 }), firstSeenAt: ago({ days: 2, hours: 3 }), lastSeenAt: ago({ days: 2, hours: 2, minutes: 36 }), occurrenceCount: 24, resolvedAt: ago({ days: 2, hours: 2, minutes: 36 }), failedChecks: ["CPU usage: 87.4%", "warning threshold: 80%"], possibleCause: "Backup compression and media indexing overlapped.", suggestedNextSteps: ["Stagger scheduled jobs.", "Limit backup CPU priority."] },
  { id: "resolved-cloud-route", severity: "resolved", title: "Cloud route recovered", message: "The reverse proxy route is serving traffic normally.", affectedResource: "https://cloud.demo.example", status: "resolved", createdAt: ago({ days: 4 }), firstSeenAt: ago({ days: 4 }), lastSeenAt: ago({ days: 3, hours: 23, minutes: 49 }), occurrenceCount: 4, resolvedAt: ago({ days: 3, hours: 23, minutes: 49 }), failedChecks: ["HTTP 504"], possibleCause: "The cloud service was restarting after an application update.", suggestedNextSteps: ["No action required.", "Confirm future updates run inside the maintenance window."] }
];

export const demoMachineUpdates: MachineUpdateDetail[] = [
  {
    agentId: "agent-photos-vm",
    displayName: "Photos VM",
    hostname: "photos-vm",
    agentStatus: "online",
    provider: AGENT_UPDATE_PROVIDER,
    supported: true,
    status: "ok",
    freshness: "current",
    os: { id: "debian", versionId: "12", prettyName: "Debian GNU/Linux 12" },
    checkedAt: ago({ minutes: 4 }),
    lastSuccessfulAt: ago({ minutes: 4 }),
    updateCount: 12,
    securityUpdateCount: 3,
    rebootRequired: false,
    truncated: true,
    lastError: null,
    lastErrorCode: null,
    packages: [
      { name: "openssl", installedVersion: "3.0.16-1~deb12u1", candidateVersion: "3.0.17-1~deb12u2", security: true, source: "debian-security" },
      { name: "libssl3", installedVersion: "3.0.16-1~deb12u1", candidateVersion: "3.0.17-1~deb12u2", security: true, source: "debian-security" },
      { name: "sudo", installedVersion: "1.9.13p3-1+deb12u1", candidateVersion: "1.9.13p3-1+deb12u2", security: true, source: "debian-security" },
      { name: "curl", installedVersion: "7.88.1-10+deb12u12", candidateVersion: "7.88.1-10+deb12u13", security: false, source: "debian" },
      { name: "git", installedVersion: "1:2.39.5-0+deb12u1", candidateVersion: "1:2.39.5-0+deb12u2", security: false, source: "debian" },
      { name: "ca-certificates", installedVersion: "20230311", candidateVersion: "20230311+deb12u1", security: false, source: "debian" },
      { name: "openssh-client", installedVersion: "1:9.2p1-2+deb12u5", candidateVersion: "1:9.2p1-2+deb12u6", security: false, source: "debian" },
      { name: "systemd", installedVersion: "252.36-1~deb12u1", candidateVersion: "252.38-1~deb12u1", security: false, source: "debian" },
      { name: "systemd-sysv", installedVersion: "252.36-1~deb12u1", candidateVersion: "252.38-1~deb12u1", security: false, source: "debian" },
      { name: "tzdata", installedVersion: "2026a-0+deb12u1", candidateVersion: "2026b-0+deb12u1", security: false, source: "debian" },
      { name: "apt", installedVersion: "2.6.1", candidateVersion: "2.6.1+deb12u1", security: false, source: "debian" },
      { name: "debian-archive-keyring", installedVersion: "2023.3+deb12u1", candidateVersion: "2023.3+deb12u2", security: false, source: "debian" }
    ]
  },
  {
    agentId: "agent-docker-main",
    displayName: "Docker main",
    hostname: "docker-main",
    agentStatus: "online",
    provider: AGENT_UPDATE_PROVIDER,
    supported: true,
    status: "ok",
    freshness: "current",
    os: { id: "ubuntu", versionId: "24.04", prettyName: "Ubuntu 24.04.2 LTS" },
    checkedAt: ago({ minutes: 7 }),
    lastSuccessfulAt: ago({ minutes: 7 }),
    updateCount: 0,
    securityUpdateCount: 0,
    rebootRequired: false,
    truncated: false,
    lastError: null,
    lastErrorCode: null,
    packages: []
  },
  {
    agentId: "agent-pve-main",
    displayName: "PVE main",
    hostname: "pve-main",
    agentStatus: "online",
    provider: AGENT_UPDATE_PROVIDER,
    supported: true,
    status: "ok",
    freshness: "current",
    os: { id: "debian", versionId: "12", prettyName: "Proxmox VE 8.4" },
    checkedAt: ago({ minutes: 12 }),
    lastSuccessfulAt: ago({ minutes: 12 }),
    updateCount: 5,
    securityUpdateCount: 1,
    rebootRequired: true,
    truncated: false,
    lastError: null,
    lastErrorCode: null,
    packages: [
      { name: "openssl", installedVersion: "3.0.16-1~deb12u1", candidateVersion: "3.0.17-1~deb12u2", security: true, source: "debian-security" },
      { name: "pve-manager", installedVersion: "8.4.1", candidateVersion: "8.4.2", security: false, source: "proxmox" },
      { name: "proxmox-widget-toolkit", installedVersion: "4.3.5", candidateVersion: "4.3.7", security: false, source: "proxmox" },
      { name: "qemu-server", installedVersion: "8.3.8", candidateVersion: "8.3.10", security: false, source: "proxmox" },
      { name: "pve-container", installedVersion: "5.2.4", candidateVersion: "5.2.5", security: false, source: "proxmox" }
    ]
  },
  {
    agentId: "agent-backup-node",
    displayName: "Backup appliance",
    hostname: "backup-appliance",
    agentStatus: "stale",
    provider: AGENT_UPDATE_PROVIDER,
    supported: false,
    status: "unsupported",
    freshness: "waiting",
    os: { id: "alpine", versionId: "3.21", prettyName: "Alpine Linux 3.21" },
    checkedAt: ago({ hours: 2 }),
    lastSuccessfulAt: null,
    updateCount: null,
    securityUpdateCount: null,
    rebootRequired: null,
    truncated: false,
    lastError: "Update discovery is not available for this operating system.",
    lastErrorCode: "unsupported_os",
    packages: []
  },
  {
    agentId: "agent-edge-node",
    displayName: "Edge node",
    hostname: "edge-node",
    agentStatus: "offline",
    provider: AGENT_UPDATE_PROVIDER,
    supported: true,
    status: "ok",
    freshness: "stale",
    os: { id: "ubuntu", versionId: "22.04", prettyName: "Ubuntu Server 22.04 LTS" },
    checkedAt: ago({ days: 2 }),
    lastSuccessfulAt: ago({ days: 2 }),
    updateCount: 0,
    securityUpdateCount: 0,
    rebootRequired: false,
    truncated: false,
    lastError: null,
    lastErrorCode: null,
    packages: []
  }
];

function demoMachineMatchesStatus(machine: MachineUpdateDetail, status: string) {
  if (status === "all") return true;
  if (status === "updates") return (machine.updateCount ?? 0) > 0;
  if (status === "security") return (machine.securityUpdateCount ?? 0) > 0;
  if (status === "up_to_date") return machine.freshness === "current" && machine.updateCount === 0;
  if (status === "reboot") return machine.rebootRequired === true;
  if (status === "unsupported") return machine.supported === false || machine.status === "unsupported";
  if (status === "check_failed") return ["package_manager_busy", "metadata_refresh_failed", "check_failed"].includes(machine.status);
  if (status === "stale_offline") return machine.freshness === "stale" || machine.agentStatus === "stale" || machine.agentStatus === "offline" || machine.agentStatus === "revoked";
  return true;
}

export function getDemoUpdateCenter(search = "", status = "all"): UpdateCenterSnapshot {
  const eligibleMachines = demoMachineUpdates.filter((machine) => machine.supported !== false && machine.status !== "unsupported");
  const reportingMachines = eligibleMachines.filter((machine) => machine.lastSuccessfulAt !== null);
  const currentMachines = reportingMachines.filter((machine) => machine.freshness === "current");
  const retainedMachines = reportingMachines.filter((machine) => machine.freshness !== "current");
  const term = search.trim().toLowerCase();
  const machines = demoMachineUpdates.filter((machine) => {
    if (!demoMachineMatchesStatus(machine, status)) return false;
    if (!term) return true;
    return [machine.displayName, machine.hostname, machine.os.prettyName, machine.provider, ...machine.packages.flatMap((item) => [item.name, item.source])]
      .some((value) => value?.toLowerCase().includes(term));
  });
  const latest = (values: Array<string | null>) => values.reduce<string | null>((result, value) => value && (!result || value > result) ? value : result, null);
  const summaryState = eligibleMachines.length === 0
    ? "empty"
    : reportingMachines.length === 0
      ? "waiting"
      : currentMachines.length === eligibleMachines.length
        ? "current"
        : currentMachines.length === 0
          ? "retained"
          : "partial";
  return {
    availableCount: reportingMachines.length ? reportingMachines.reduce((total, machine) => total + (machine.updateCount ?? 0), 0) : null,
    securityCriticalCount: reportingMachines.length ? reportingMachines.reduce((total, machine) => total + (machine.securityUpdateCount ?? 0), 0) : null,
    reportingMachineCount: reportingMachines.length,
    currentReportingMachineCount: currentMachines.length,
    retainedMachineCount: retainedMachines.length,
    totalMachineCount: eligibleMachines.length,
    lastCheckedAt: latest(demoMachineUpdates.map((machine) => machine.checkedAt)),
    lastSuccessfulAt: latest(reportingMachines.map((machine) => machine.lastSuccessfulAt)),
    summaryState,
    machines: machines.map((machine) => ({ ...machine, packages: machine.packages.map((item) => ({ ...item })) }))
  };
}

export function getDemoMachineUpdates(id: string): MachineUpdateDetail {
  const machine = demoMachineUpdates.find((item) => item.agentId === id);
  if (!machine) throw new Error("Machine update inventory not found.");
  return { ...machine, packages: machine.packages.map((item) => ({ ...item })) };
}

export const demoServerMonitors: MonitoredServerStatus[] = [
  { id: "storage-node", name: "Storage node", backendUrl: "https://storage.demo.example", apiKeyPreview: "demo...storage", allowInsecureTls: false, status: "healthy", lastCheckedAt: now(), lastError: null },
  { id: "compute-node", name: "Compute node", backendUrl: "https://198.51.100.11:8006", apiKeyPreview: null, allowInsecureTls: true, status: "healthy", lastCheckedAt: now(), lastError: null },
  { id: "backup-node", name: "Backup node", backendUrl: "http://192.0.2.31:3000", apiKeyPreview: "demo...backup", allowInsecureTls: false, status: "warning", lastCheckedAt: now(), lastError: "Metrics endpoint is responding slowly." },
  { id: "edge-lab", name: "Edge lab", backendUrl: "http://192.0.2.42:3000", apiKeyPreview: null, allowInsecureTls: false, status: "offline", lastCheckedAt: now(), lastError: "Connection timed out after 5 seconds." }
];

export function getDemoOverview(alerts: Alert[] = demoAlerts): Overview {
  const activeAlerts = alerts.filter((alert) => alert.status === "active");
  const criticalAlerts = activeAlerts.filter((alert) => alert.severity === "critical").length;
  const warnings = activeAlerts.filter((alert) => alert.severity === "warning").length;
  const activeDemoAgents = demoAgents.filter((agent) => agent.status !== "revoked");

  return {
    status: criticalAlerts > 0 ? "critical" : warnings > 0 ? "warning" : "healthy",
    lastCheckedAt: now(),
    serversOnline: demoServers.filter((server) => server.status === "healthy").length,
    serversTotal: demoServers.length,
    containersRunning: demoContainers.filter((container) => container.status === "running").length,
    containersTotal: demoContainers.length,
    domainsOnline: demoDomains.filter((domain) => domain.status === "healthy").length,
    domainsTotal: demoDomains.length,
    criticalAlerts,
    warnings,
    agentsOnline: activeDemoAgents.filter((agent) => agent.status === "online").length,
    agentsTotal: activeDemoAgents.length
  };
}
