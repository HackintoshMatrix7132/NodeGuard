import assert from "node:assert/strict";
import test from "node:test";

import { generateAlerts } from "./alertService.js";
import type { DockerSnapshot, DomainCheck, MetricSnapshot } from "../types/nodeguard.js";

const metrics: MetricSnapshot = {
  serverId: "local-node",
  cpu: { usagePercent: 91, loadAverage: 2.1 },
  memory: { usedGb: 3, totalGb: 4, usagePercent: 75 },
  disk: { usedGb: 95, totalGb: 100, usagePercent: 95 },
  swap: { usedGb: 0, totalGb: 4, usagePercent: 0 },
  network: { downloadMbps: 1, uploadMbps: 1 },
  uptimeSeconds: 100,
  createdAt: new Date().toISOString()
};

const docker: DockerSnapshot = {
  dockerAvailable: false,
  dockerVersion: null,
  containers: [],
  containerMonitors: [],
  message: "Docker is not available on this host."
};

const domains: DomainCheck[] = [
  {
    id: "example",
    domain: "https://example.com",
    editable: false,
    status: "offline",
    statusCode: null,
    responseTimeMs: null,
    https: true,
    sslExpiresAt: null,
    sslExpiresInDays: null,
    lastCheckedAt: new Date().toISOString(),
    error: "Domain is unreachable."
  }
];

test("generateAlerts creates alerts for critical metrics, Docker, and domains", () => {
  const alerts = generateAlerts(metrics, docker, domains, true);
  assert.ok(alerts.some((alert) => alert.id === "cpu-critical"));
  assert.ok(alerts.some((alert) => alert.id === "disk-critical"));
  assert.ok(alerts.some((alert) => alert.id === "docker-unavailable"));
  assert.ok(alerts.some((alert) => alert.id === "domain-example-offline"));
});
