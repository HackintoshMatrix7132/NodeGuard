import type { Alert, Container, DockerSnapshot, DomainCheck, MetricHistory, MetricHistoryRange, MetricSnapshot, MonitoredServerStatus, Overview, Server } from "./types/nodeguard";

const now = () => new Date().toISOString();
const ago = ({ minutes = 0, hours = 0, days = 0 }: { minutes?: number; hours?: number; days?: number }) => new Date(Date.now() - (((days * 24 + hours) * 60 + minutes) * 60 * 1000)).toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

export const demoServer: Server = {
  id: "local-node",
  name: "nodeguard-demo-host",
  hostname: "homelab-core",
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
  primaryIp: "10.0.0.20",
  ipAddresses: ["10.0.0.20", "172.18.0.1", "172.19.0.1"],
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

export const demoContainers: Container[] = [
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
  { id: "bit-muthu-eu", domain: "https://bit.muthu.eu", path: "/", expectedStatusCodes: [200, 301, 302, 401], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 142, previousResponseTimeMs: 151, latencyTrendPercent: -6, uptimePercent: 99.99, checkSamples: 43200, https: true, sslExpiresAt: inDays(72), sslExpiresInDays: 72, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ days: 18 }), error: null },
  { id: "nc-muthu-eu", domain: "https://nc.muthu.eu", path: "/status.php", expectedStatusCodes: [200], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 318, previousResponseTimeMs: 344, latencyTrendPercent: -7.6, uptimePercent: 99.97, checkSamples: 43198, https: true, sslExpiresAt: inDays(72), sslExpiresInDays: 72, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ days: 4 }), error: null },
  { id: "status-muthu-eu", domain: "https://status.muthu.eu", path: "/api/status-page/heartbeat", expectedStatusCodes: [200], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 67, previousResponseTimeMs: 72, latencyTrendPercent: -6.9, uptimePercent: 100, checkSamples: 43200, https: true, sslExpiresAt: inDays(118), sslExpiresInDays: 118, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: null, error: null },
  { id: "nas-muthu-eu", domain: "https://nas.muthu.eu", path: "/", expectedStatusCodes: [200, 401], editable: true, status: "healthy", statusCode: 401, responseTimeMs: 24, previousResponseTimeMs: 26, latencyTrendPercent: -7.7, uptimePercent: 99.99, checkSamples: 43200, https: true, sslExpiresAt: inDays(164), sslExpiresInDays: 164, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ days: 23 }), error: null },
  { id: "home-muthu-eu", domain: "https://home.muthu.eu", path: "/", expectedStatusCodes: [200], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 104, previousResponseTimeMs: 110, latencyTrendPercent: -5.5, uptimePercent: 99.96, checkSamples: 43190, https: true, sslExpiresAt: inDays(72), sslExpiresInDays: 72, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ hours: 12 }), error: null },
  { id: "grafana-muthu-eu", domain: "https://grafana.muthu.eu", path: "/api/health", expectedStatusCodes: [200], editable: true, status: "warning", statusCode: 200, responseTimeMs: 1840, previousResponseTimeMs: 620, latencyTrendPercent: 196.8, uptimePercent: 99.91, checkSamples: 43160, https: true, sslExpiresAt: inDays(19), sslExpiresInDays: 19, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: ago({ hours: 3 }), error: "Endpoint is reachable but response latency exceeds the warning threshold." },
  { id: "photos-muthu-eu", domain: "https://photos.muthu.eu", path: "/api/server/ping", expectedStatusCodes: [200], editable: true, status: "critical", statusCode: 502, responseTimeMs: 93, previousResponseTimeMs: 89, latencyTrendPercent: 4.5, uptimePercent: 98.74, checkSamples: 43196, https: true, sslExpiresAt: inDays(52), sslExpiresInDays: 52, lastCheckedAt: now(), lastSuccessfulAt: ago({ minutes: 21 }), lastFailedAt: now(), error: "Expected HTTP 200 but received HTTP 502." },
  { id: "pihole-internal", domain: "http://10.0.0.53", path: "/admin/", expectedStatusCodes: [200, 302], editable: true, status: "offline", statusCode: null, responseTimeMs: null, previousResponseTimeMs: 18, latencyTrendPercent: null, uptimePercent: 97.42, checkSamples: 42910, https: false, sslExpiresAt: null, sslExpiresInDays: null, lastCheckedAt: now(), lastSuccessfulAt: ago({ minutes: 14 }), lastFailedAt: now(), error: "Connection timed out after 5 seconds." },
  { id: "legacy-console", domain: "https://10.0.0.44:8443", path: "/", expectedStatusCodes: [200], editable: true, status: "unknown", statusCode: null, responseTimeMs: null, previousResponseTimeMs: null, latencyTrendPercent: null, uptimePercent: null, checkSamples: 0, https: true, sslExpiresAt: null, sslExpiresInDays: null, lastCheckedAt: now(), lastSuccessfulAt: null, lastFailedAt: now(), error: "TLS certificate details are unavailable for this internal endpoint." }
];

export const demoAlerts: Alert[] = [
  { id: "domain-photos-502", severity: "critical", title: "photos.muthu.eu returned HTTP 502", message: "The reverse proxy cannot reach the Immich upstream.", affectedResource: "https://photos.muthu.eu", status: "active", createdAt: ago({ minutes: 21 }), firstSeenAt: ago({ minutes: 21 }), lastSeenAt: now(), occurrenceCount: 7, resolvedAt: null, failedChecks: ["HTTP 502", "upstream ping failed"], possibleCause: "The reverse proxy route points to an unavailable upstream service.", suggestedNextSteps: ["Inspect reverse proxy logs.", "Verify the Immich container network.", "Confirm the upstream port is 2283."] },
  { id: "domain-pihole-timeout", severity: "critical", title: "Pi-hole is unreachable", message: "The internal DNS dashboard timed out after 5 seconds.", affectedResource: "http://10.0.0.53", status: "active", createdAt: ago({ minutes: 14 }), firstSeenAt: ago({ minutes: 14 }), lastSeenAt: now(), occurrenceCount: 5, resolvedAt: null, failedChecks: ["TCP connection timeout", "HTTP check unavailable"], possibleCause: "The Pi-hole host may be offline or isolated from the monitoring network.", suggestedNextSteps: ["Ping 10.0.0.53 from the NodeGuard host.", "Check the Pi-hole VM state.", "Verify firewall rules."] },
  { id: "container-ente-stopped", severity: "warning", title: "ente-server is not running", message: "The monitored container exited with code 1.", affectedResource: "ente-server", status: "active", createdAt: ago({ minutes: 18 }), firstSeenAt: ago({ minutes: 18 }), lastSeenAt: now(), occurrenceCount: 6, resolvedAt: null, failedChecks: ["container state: exited", "database connection refused"], possibleCause: "The service cannot establish its database connection.", suggestedNextSteps: ["Inspect container logs.", "Verify database credentials.", "Check the Compose dependency health."] },
  { id: "domain-grafana-latency", severity: "warning", title: "Grafana response time is elevated", message: "The endpoint is healthy but responded in 1840 ms.", affectedResource: "https://grafana.muthu.eu", status: "active", createdAt: ago({ minutes: 9 }), firstSeenAt: ago({ minutes: 9 }), lastSeenAt: now(), occurrenceCount: 3, resolvedAt: null, failedChecks: ["latency above 1500 ms"], possibleCause: "A dashboard query or storage operation may be saturating Grafana.", suggestedNextSteps: ["Review Grafana server logs.", "Inspect host I/O usage.", "Check datasource latency."] },
  { id: "resolved-vaultwarden-health", severity: "warning", title: "Vaultwarden health check recovered", message: "The container returned to a healthy state after one failed probe.", affectedResource: "vaultwarden", status: "resolved", createdAt: ago({ hours: 4 }), firstSeenAt: ago({ hours: 4 }), lastSeenAt: ago({ hours: 3, minutes: 51 }), occurrenceCount: 2, resolvedAt: ago({ hours: 3, minutes: 51 }), failedChecks: ["Docker health: unhealthy"], possibleCause: "A short database lock delayed the health endpoint.", suggestedNextSteps: ["No immediate action required.", "Review logs if the event repeats."] },
  { id: "resolved-proxmox-offline", severity: "critical", title: "Proxmox node recovered", message: "The monitored Proxmox node is reachable again.", affectedResource: "Proxmox", status: "resolved", createdAt: ago({ days: 1, hours: 2 }), firstSeenAt: ago({ days: 1, hours: 2 }), lastSeenAt: ago({ days: 1, hours: 1, minutes: 42 }), occurrenceCount: 12, resolvedAt: ago({ days: 1, hours: 1, minutes: 42 }), failedChecks: ["HTTPS connection refused", "server monitor offline"], possibleCause: "The host rebooted after scheduled package updates.", suggestedNextSteps: ["Confirm the maintenance completed.", "Review boot logs if downtime was unexpected."] },
  { id: "resolved-cpu-elevated", severity: "warning", title: "CPU usage returned to normal", message: "CPU usage remained above 80% during the backup window.", affectedResource: "homelab-core", status: "resolved", createdAt: ago({ days: 2, hours: 3 }), firstSeenAt: ago({ days: 2, hours: 3 }), lastSeenAt: ago({ days: 2, hours: 2, minutes: 36 }), occurrenceCount: 24, resolvedAt: ago({ days: 2, hours: 2, minutes: 36 }), failedChecks: ["CPU usage: 87.4%", "warning threshold: 80%"], possibleCause: "Restic compression and media indexing overlapped.", suggestedNextSteps: ["Stagger scheduled jobs.", "Limit backup CPU priority."] },
  { id: "resolved-cloud-route", severity: "resolved", title: "Nextcloud route recovered", message: "The reverse proxy route is serving traffic normally.", affectedResource: "https://nc.muthu.eu", status: "resolved", createdAt: ago({ days: 4 }), firstSeenAt: ago({ days: 4 }), lastSeenAt: ago({ days: 3, hours: 23, minutes: 49 }), occurrenceCount: 4, resolvedAt: ago({ days: 3, hours: 23, minutes: 49 }), failedChecks: ["HTTP 504"], possibleCause: "Nextcloud was restarting after an application update.", suggestedNextSteps: ["No action required.", "Confirm future updates run inside the maintenance window."] }
];

export const demoServerMonitors: MonitoredServerStatus[] = [
  { id: "nas", name: "TrueNAS", backendUrl: "https://nas-node.muthu.eu", apiKeyPreview: "demo...nas", allowInsecureTls: false, status: "healthy", lastCheckedAt: now(), lastError: null },
  { id: "proxmox", name: "Proxmox", backendUrl: "https://10.0.0.11:8006", apiKeyPreview: null, allowInsecureTls: true, status: "healthy", lastCheckedAt: now(), lastError: null },
  { id: "backup-node", name: "Backup node", backendUrl: "http://10.0.0.31:3000", apiKeyPreview: "demo...bak", allowInsecureTls: false, status: "warning", lastCheckedAt: now(), lastError: "Metrics endpoint is responding slowly." },
  { id: "lab-pi", name: "Lab Pi", backendUrl: "http://10.0.0.42:3000", apiKeyPreview: null, allowInsecureTls: false, status: "offline", lastCheckedAt: now(), lastError: "Connection timed out after 5 seconds." }
];

export const demoOverview: Overview = {
  status: "critical",
  lastCheckedAt: now(),
  serversOnline: 3,
  serversTotal: 5,
  containersRunning: 9,
  containersTotal: 12,
  domainsOnline: 5,
  domainsTotal: 9,
  criticalAlerts: 2,
  warnings: 2
};
