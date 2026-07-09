import type { Alert, Container, DockerSnapshot, DomainCheck, MetricSnapshot, MonitoredServerStatus, Overview, Server } from "./types/nodeguard";

const now = () => new Date().toISOString();

export const demoServer: Server = {
  id: "local-node",
  name: "nodeguard-demo-host",
  hostname: "homelab-core",
  status: "critical",
  os: "Ubuntu 24.04 LTS",
  kernel: "6.8.0-generic",
  uptimeSeconds: 362880,
  lastCheckedAt: now(),
  dockerVersion: "27.5.1",
  dockerAvailable: true,
  runningContainers: 7,
  stoppedContainers: 1
};

export const demoMetrics: MetricSnapshot = {
  serverId: "local-node",
  cpu: { usagePercent: 3.1, loadAverage: 0.42 },
  memory: { usedGb: 13.9, totalGb: 32, usagePercent: 43.4 },
  disk: { usedGb: 341.2, totalGb: 1000, usagePercent: 34.1 },
  swap: { usedGb: 0.2, totalGb: 8, usagePercent: 2.5 },
  network: { downloadMbps: 12.4, uploadMbps: 3.1 },
  uptimeSeconds: 362880,
  createdAt: now()
};

export const demoContainers: Container[] = [
  { id: "traefik001", serverId: "local-node", name: "traefik", image: "traefik:v3", status: "running", state: "running", health: "healthy", uptime: "4d 5h", cpuPercent: null, memoryMb: 128, memoryLimitMb: null, ports: ["80:80", "443:443"], restartPolicy: "unless-stopped", startedAt: now(), logs: [] },
  { id: "vault001", serverId: "local-node", name: "vaultwarden", image: "vaultwarden/server:latest", status: "running", state: "running", health: "healthy", uptime: "4d 3h", cpuPercent: null, memoryMb: 256, memoryLimitMb: null, ports: ["8080:80"], restartPolicy: "unless-stopped", startedAt: now(), logs: [] },
  { id: "next001", serverId: "local-node", name: "nextcloud", image: "nextcloud:stable", status: "running", state: "running", health: "healthy", uptime: "2d 9h", cpuPercent: null, memoryMb: 1024, memoryLimitMb: null, ports: ["8081:80"], restartPolicy: "unless-stopped", startedAt: now(), logs: [] },
  { id: "pg001", serverId: "local-node", name: "postgres", image: "postgres:16", status: "running", state: "running", health: "healthy", uptime: "9d 1h", cpuPercent: null, memoryMb: 512, memoryLimitMb: null, ports: ["5432/tcp"], restartPolicy: "unless-stopped", startedAt: now(), logs: [] },
  { id: "port001", serverId: "local-node", name: "portainer", image: "portainer/portainer-ce:latest", status: "running", state: "running", health: "none", uptime: "12d 4h", cpuPercent: null, memoryMb: 180, memoryLimitMb: null, ports: ["9443:9443"], restartPolicy: "unless-stopped", startedAt: now(), logs: [] },
  { id: "immich001", serverId: "local-node", name: "immich-server", image: "ghcr.io/immich-app/immich-server:release", status: "running", state: "running", health: "healthy", uptime: "1d 6h", cpuPercent: null, memoryMb: 768, memoryLimitMb: null, ports: ["2283:2283"], restartPolicy: "unless-stopped", startedAt: now(), logs: [] },
  { id: "redis001", serverId: "local-node", name: "redis", image: "redis:7-alpine", status: "running", state: "running", health: "healthy", uptime: "9d 1h", cpuPercent: null, memoryMb: 96, memoryLimitMb: null, ports: ["6379/tcp"], restartPolicy: "unless-stopped", startedAt: now(), logs: [] },
  { id: "ente001", serverId: "local-node", name: "ente-server", image: "ente/server:latest", status: "exited", state: "exited", health: "none", uptime: "Exited 18 minutes ago", cpuPercent: null, memoryMb: null, memoryLimitMb: null, ports: ["8082:8080"], restartPolicy: "unless-stopped", startedAt: null, logs: [] }
];

export const demoDocker: DockerSnapshot = {
  dockerAvailable: true,
  dockerVersion: "27.5.1",
  containers: demoContainers,
  containerMonitors: [
    { id: "vaultwarden", name: "Vaultwarden", containerRef: "vaultwarden", status: "healthy", matchedContainerId: "vault001", matchedContainerName: "vaultwarden", lastCheckedAt: now(), lastError: null },
    { id: "ente-server", name: "Ente", containerRef: "ente-server", status: "offline", matchedContainerId: "ente001", matchedContainerName: "ente-server", lastCheckedAt: now(), lastError: "Container is exited with health none." }
  ]
};

export const demoDomains: DomainCheck[] = [
  { id: "bit-muthu-eu", domain: "https://bit.muthu.eu", path: "/", expectedStatusCodes: [200, 301, 302, 401], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 157, https: true, sslExpiresAt: "2026-09-12T12:00:00.000Z", sslExpiresInDays: 66, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: null, error: null },
  { id: "cloud-muthu-eu", domain: "https://cloud.muthu.eu", path: "/", expectedStatusCodes: [200, 301, 302, 401], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 231, https: true, sslExpiresAt: "2026-10-02T12:00:00.000Z", sslExpiresInDays: 86, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: null, error: null },
  { id: "photos-muthu-eu", domain: "https://photos.muthu.eu", path: "/", expectedStatusCodes: [200, 301, 302, 401], editable: true, status: "critical", statusCode: 502, responseTimeMs: 91, https: true, sslExpiresAt: "2026-08-28T12:00:00.000Z", sslExpiresInDays: 51, lastCheckedAt: now(), lastSuccessfulAt: null, lastFailedAt: now(), error: "Expected HTTP 200, 301, 302, 401 but received HTTP 502." },
  { id: "status-muthu-eu", domain: "https://status.muthu.eu", path: "/", expectedStatusCodes: [200, 301, 302, 401], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 86, https: true, sslExpiresAt: "2026-11-08T12:00:00.000Z", sslExpiresInDays: 123, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: null, error: null },
  { id: "nas-muthu-eu", domain: "https://nas.muthu.eu", path: "/", expectedStatusCodes: [200, 301, 302, 401], editable: true, status: "healthy", statusCode: 200, responseTimeMs: 22, https: true, sslExpiresAt: "2026-12-18T12:00:00.000Z", sslExpiresInDays: 163, lastCheckedAt: now(), lastSuccessfulAt: now(), lastFailedAt: null, error: null }
];

export const demoAlerts: Alert[] = [
  {
    id: "domain-photos-502",
    severity: "critical",
    title: "photos.muthu.eu returned HTTP 502",
    message: "The domain is reachable, but the reverse proxy returned Bad Gateway.",
    affectedResource: "photos.muthu.eu",
    status: "active",
    createdAt: now(),
    firstSeenAt: now(),
    lastSeenAt: now(),
    occurrenceCount: 3,
    resolvedAt: null,
    failedChecks: ["HTTP 502", "reverse proxy route failed"],
    possibleCause: "The reverse proxy cannot reach the upstream photo service container.",
    suggestedNextSteps: ["Check reverse proxy logs.", "Verify Docker network labels.", "Confirm the upstream container port is correct."]
  },
  {
    id: "container-ente-stopped",
    severity: "warning",
    title: "ente-server is not running",
    message: "The monitored container is stopped or exited.",
    affectedResource: "ente-server",
    status: "active",
    createdAt: now(),
    firstSeenAt: now(),
    lastSeenAt: now(),
    occurrenceCount: 2,
    resolvedAt: null,
    failedChecks: ["container status: exited"],
    possibleCause: "The service crashed or was stopped outside NodeGuard.",
    suggestedNextSteps: ["Inspect container logs.", "Check the compose file restart policy.", "Restart the service from the host if appropriate."]
  }
];

export const demoServerMonitors: MonitoredServerStatus[] = [
  { id: "nas", name: "NAS", backendUrl: "https://node.muthu.eu", apiKeyPreview: "••••demo", allowInsecureTls: false, status: "healthy", lastCheckedAt: now(), lastError: null }
];

export const demoOverview: Overview = {
  status: "critical",
  lastCheckedAt: now(),
  serversOnline: 1,
  serversTotal: 1,
  containersRunning: 7,
  containersTotal: 8,
  domainsOnline: 4,
  domainsTotal: 5,
  criticalAlerts: 1,
  warnings: 1
};
