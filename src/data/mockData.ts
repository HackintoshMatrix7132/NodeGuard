import type { Alert, Container, DomainCheck, MetricSnapshot, Overview, Server } from "@/types/nodeguard";

export const mockOverview: Overview = {
  status: "warning",
  lastCheckedAt: "2026-07-08T09:42:00Z",
  serversOnline: 1,
  serversTotal: 1,
  containersRunning: 8,
  containersTotal: 10,
  domainsOnline: 3,
  domainsTotal: 4,
  criticalAlerts: 1,
  warnings: 2
};

export const mockServer: Server = {
  id: "local-node",
  name: "Local Node",
  hostname: "nodeguard-lab",
  status: "warning",
  os: "Ubuntu 24.04 LTS",
  kernel: "6.8.0-generic",
  uptimeSeconds: 726342,
  lastCheckedAt: "2026-07-08T09:42:00Z",
  dockerVersion: "27.5.1",
  runningContainers: 8,
  stoppedContainers: 2
};

export const mockMetrics: MetricSnapshot = {
  serverId: "local-node",
  cpu: {
    usagePercent: 41.8,
    loadAverage: 1.26
  },
  memory: {
    usedGb: 18.7,
    totalGb: 32,
    usagePercent: 58.4
  },
  disk: {
    usedGb: 782,
    totalGb: 1000,
    usagePercent: 78.2
  },
  swap: {
    usedGb: 0.9,
    totalGb: 8,
    usagePercent: 11.2
  },
  network: {
    downloadMbps: 42.6,
    uploadMbps: 8.7
  },
  uptimeSeconds: 726342,
  createdAt: "2026-07-08T09:42:00Z"
};

export const mockContainers: Container[] = [
  {
    id: "vaultwarden",
    serverId: "local-node",
    name: "vaultwarden",
    image: "vaultwarden/server:latest",
    status: "running",
    health: "healthy",
    uptime: "8 days",
    cpuPercent: 1.2,
    memoryMb: 220,
    memoryLimitMb: 512,
    ports: ["9006:80"],
    restartPolicy: "unless-stopped",
    startedAt: "2026-06-30T11:22:00Z",
    logs: [
      "2026-07-08T09:40:11Z request completed GET /alive 200",
      "2026-07-08T09:39:51Z sync job completed in 114ms",
      "2026-07-08T09:39:22Z database checkpoint completed"
    ]
  },
  {
    id: "nodeguard-api",
    serverId: "local-node",
    name: "nodeguard-api",
    image: "nodeguard/api:dev",
    status: "running",
    health: "starting",
    uptime: "17 minutes",
    cpuPercent: 4.8,
    memoryMb: 318,
    memoryLimitMb: 1024,
    ports: ["4000:4000"],
    restartPolicy: "on-failure",
    startedAt: "2026-07-08T09:25:00Z",
    logs: [
      "2026-07-08T09:41:59Z GET /health 200 8ms",
      "2026-07-08T09:41:58Z GET /api/overview 200 17ms",
      "2026-07-08T09:41:30Z docker service connected"
    ]
  },
  {
    id: "nginx-proxy",
    serverId: "local-node",
    name: "nginx-proxy-manager",
    image: "jc21/nginx-proxy-manager:latest",
    status: "running",
    health: "healthy",
    uptime: "21 days",
    cpuPercent: 2.1,
    memoryMb: 410,
    memoryLimitMb: 1024,
    ports: ["80:80", "81:81", "443:443"],
    restartPolicy: "unless-stopped",
    startedAt: "2026-06-17T19:08:00Z",
    logs: [
      "2026-07-08T09:41:02Z reloaded proxy hosts",
      "2026-07-08T09:38:14Z certificate cache hit",
      "2026-07-08T09:37:01Z upstream vaultwarden resolved"
    ]
  },
  {
    id: "uptime-kuma",
    serverId: "local-node",
    name: "uptime-kuma",
    image: "louislam/uptime-kuma:1",
    status: "running",
    health: "healthy",
    uptime: "12 days",
    cpuPercent: 3.4,
    memoryMb: 284,
    memoryLimitMb: 768,
    ports: ["3001:3001"],
    restartPolicy: "unless-stopped",
    startedAt: "2026-06-26T05:17:00Z",
    logs: [
      "2026-07-08T09:42:00Z monitor ping nodeguard.dev ok",
      "2026-07-08T09:41:01Z monitor ping docs.nodeguard.dev ok",
      "2026-07-08T09:40:01Z monitor ping photos.nodeguard.dev timeout"
    ]
  },
  {
    id: "postgres",
    serverId: "local-node",
    name: "postgres",
    image: "postgres:16-alpine",
    status: "running",
    health: "healthy",
    uptime: "21 days",
    cpuPercent: 8.9,
    memoryMb: 1180,
    memoryLimitMb: 2048,
    ports: ["5432:5432"],
    restartPolicy: "unless-stopped",
    startedAt: "2026-06-17T19:05:00Z",
    logs: [
      "2026-07-08T09:41:42Z checkpoint complete",
      "2026-07-08T09:36:11Z autovacuum finished",
      "2026-07-08T09:31:42Z checkpoint starting"
    ]
  },
  {
    id: "redis",
    serverId: "local-node",
    name: "redis-cache",
    image: "redis:7-alpine",
    status: "running",
    health: "none",
    uptime: "21 days",
    cpuPercent: 0.7,
    memoryMb: 96,
    memoryLimitMb: 256,
    ports: ["6379:6379"],
    restartPolicy: "unless-stopped",
    startedAt: "2026-06-17T19:05:00Z",
    logs: [
      "2026-07-08T09:37:08Z background saving terminated with success",
      "2026-07-08T09:37:07Z DB saved on disk",
      "2026-07-08T09:37:07Z 1 changes in 3600 seconds"
    ]
  },
  {
    id: "photoprism",
    serverId: "local-node",
    name: "photoprism",
    image: "photoprism/photoprism:latest",
    status: "running",
    health: "unhealthy",
    uptime: "3 days",
    cpuPercent: 17.4,
    memoryMb: 1680,
    memoryLimitMb: 3072,
    ports: ["2342:2342"],
    restartPolicy: "unless-stopped",
    startedAt: "2026-07-05T14:12:00Z",
    logs: [
      "2026-07-08T09:41:00Z health probe failed: upstream timeout",
      "2026-07-08T09:40:30Z worker queue length 124",
      "2026-07-08T09:39:52Z indexing original IMG_2044.heic"
    ]
  },
  {
    id: "cloudflared",
    serverId: "local-node",
    name: "cloudflared",
    image: "cloudflare/cloudflared:latest",
    status: "running",
    health: "healthy",
    uptime: "2 days",
    cpuPercent: 2.9,
    memoryMb: 148,
    memoryLimitMb: 512,
    ports: [],
    restartPolicy: "unless-stopped",
    startedAt: "2026-07-06T10:35:00Z",
    logs: [
      "2026-07-08T09:42:00Z tunnel connection healthy",
      "2026-07-08T09:39:00Z registered tunnel conn index=2",
      "2026-07-08T09:38:59Z edge connection established"
    ]
  },
  {
    id: "old-blog",
    serverId: "local-node",
    name: "old-blog",
    image: "nginx:alpine",
    status: "exited",
    health: "none",
    uptime: "stopped 6 hours ago",
    cpuPercent: 0,
    memoryMb: 0,
    memoryLimitMb: 256,
    ports: ["8084:80"],
    restartPolicy: "no",
    startedAt: "2026-07-07T22:10:00Z",
    logs: [
      "2026-07-08T03:18:44Z exited with code 0",
      "2026-07-08T03:18:43Z received SIGTERM",
      "2026-07-08T03:17:02Z GET / 200"
    ]
  },
  {
    id: "staging-worker",
    serverId: "local-node",
    name: "staging-worker",
    image: "node:22-alpine",
    status: "stopped",
    health: "none",
    uptime: "stopped 2 days ago",
    cpuPercent: 0,
    memoryMb: 0,
    memoryLimitMb: 512,
    ports: [],
    restartPolicy: "on-failure",
    startedAt: "2026-07-04T12:00:00Z",
    logs: [
      "2026-07-06T06:12:18Z job queue drained",
      "2026-07-06T06:12:11Z graceful shutdown requested",
      "2026-07-06T06:11:58Z processed 18 jobs"
    ]
  }
];

export const mockDomains: DomainCheck[] = [
  {
    id: "nodeguard-dev",
    domain: "nodeguard.dev",
    status: "healthy",
    statusCode: 200,
    responseTimeMs: 128,
    https: true,
    sslExpiresAt: "2026-10-18T00:00:00Z",
    lastCheckedAt: "2026-07-08T09:42:00Z"
  },
  {
    id: "vault-nodeguard-dev",
    domain: "vault.nodeguard.dev",
    status: "healthy",
    statusCode: 200,
    responseTimeMs: 186,
    https: true,
    sslExpiresAt: "2026-10-18T00:00:00Z",
    lastCheckedAt: "2026-07-08T09:42:00Z"
  },
  {
    id: "photos-nodeguard-dev",
    domain: "photos.nodeguard.dev",
    status: "critical",
    statusCode: 504,
    responseTimeMs: 10248,
    https: true,
    sslExpiresAt: "2026-08-04T00:00:00Z",
    lastCheckedAt: "2026-07-08T09:42:00Z"
  },
  {
    id: "docs-nodeguard-dev",
    domain: "docs.nodeguard.dev",
    status: "warning",
    statusCode: 200,
    responseTimeMs: 962,
    https: true,
    sslExpiresAt: "2026-07-29T00:00:00Z",
    lastCheckedAt: "2026-07-08T09:42:00Z"
  }
];

export const mockAlerts: Alert[] = [
  {
    id: "photos-504",
    severity: "critical",
    title: "Photos domain timing out",
    message: "photos.nodeguard.dev returned a 504 from the reverse proxy while the photoprism container is still running.",
    affectedResource: "photos.nodeguard.dev",
    status: "active",
    createdAt: "2026-07-08T09:39:00Z",
    resolvedAt: null,
    failedChecks: ["HTTP status 504", "Response time over 10s", "Container health unhealthy"],
    suggestedNextSteps: [
      "Check the reverse proxy upstream target.",
      "Inspect photoprism health check and worker queue.",
      "Confirm the container can reach its database."
    ]
  },
  {
    id: "disk-warning",
    severity: "warning",
    title: "Disk usage above 75%",
    message: "Local Node is using 782 GB of 1 TB. This is below critical, but close enough to watch.",
    affectedResource: "local-node:/",
    status: "active",
    createdAt: "2026-07-08T08:15:00Z",
    resolvedAt: null,
    failedChecks: ["Disk usage 78.2%"],
    suggestedNextSteps: [
      "Review Docker image and volume usage.",
      "Check backup and media folders for large recent files.",
      "Set a cleanup plan before usage reaches 90%."
    ]
  },
  {
    id: "ssl-warning",
    severity: "warning",
    title: "Docs certificate expires soon",
    message: "docs.nodeguard.dev has a certificate expiry inside the warning window.",
    affectedResource: "docs.nodeguard.dev",
    status: "active",
    createdAt: "2026-07-08T07:30:00Z",
    resolvedAt: null,
    failedChecks: ["SSL expiry in 21 days"],
    suggestedNextSteps: [
      "Confirm automatic certificate renewal is enabled.",
      "Check DNS and HTTP challenge reachability.",
      "Renew manually if the next run fails."
    ]
  },
  {
    id: "blog-stopped",
    severity: "resolved",
    title: "Old blog container stopped",
    message: "old-blog exited cleanly and is not marked as a critical service.",
    affectedResource: "old-blog",
    status: "resolved",
    createdAt: "2026-07-08T03:18:00Z",
    resolvedAt: "2026-07-08T03:22:00Z",
    failedChecks: ["Container exited"],
    suggestedNextSteps: [
      "No action needed unless this service becomes critical."
    ]
  }
];
