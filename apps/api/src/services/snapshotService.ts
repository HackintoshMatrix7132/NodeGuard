import type { HealthStatus, MonitoringSnapshot } from "../types/nodeguard.js";
import { generateAlerts } from "./alertService.js";
import { listContainerMonitorStatuses } from "./containerMonitorService.js";
import { getDockerSnapshot } from "./dockerService.js";
import { getDomainChecks } from "./domainCheckService.js";
import { listMonitoredServerStatuses } from "./serverMonitorService.js";
import { getSystemSnapshot } from "./systemMetrics.js";

function worstStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("critical") || statuses.includes("offline")) {
    return "critical";
  }

  if (statuses.includes("warning")) {
    return "warning";
  }

  if (statuses.includes("unknown")) {
    return "unknown";
  }

  return "healthy";
}

export async function getMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  const [system, docker, domains, serverMonitors] = await Promise.all([
    getSystemSnapshot(),
    getDockerSnapshot(),
    getDomainChecks(),
    listMonitoredServerStatuses()
  ]);
  docker.containerMonitors = await listContainerMonitorStatuses(docker);
  const alerts = generateAlerts(system.metrics, docker, domains, system.metricsAvailable);
  for (const server of serverMonitors) {
    if (server.status !== "healthy") {
      alerts.push({
        id: `server-monitor-${server.id}`,
        severity: server.status === "offline" ? "critical" : "warning",
        title: `${server.name} is ${server.status}`,
        message: server.lastError ?? "The monitored server did not pass its latest health check.",
        affectedResource: server.name,
        status: "active",
        createdAt: server.lastCheckedAt,
        resolvedAt: null,
        failedChecks: [`server monitor status: ${server.status}`],
        possibleCause: "The remote NodeGuard backend may be down, unreachable, or using a different API key.",
        suggestedNextSteps: ["Check the server URL.", "Verify the remote backend is running.", "Verify the API key if this monitor uses protected checks."]
      });
    }
  }
  for (const monitor of docker.containerMonitors) {
    if (monitor.status !== "healthy") {
      alerts.push({
        id: `container-monitor-${monitor.id}`,
        severity: monitor.status === "offline" ? "critical" : "warning",
        title: `${monitor.name} is ${monitor.status}`,
        message: monitor.lastError ?? "The monitored container did not pass its latest check.",
        affectedResource: monitor.name,
        status: "active",
        createdAt: monitor.lastCheckedAt,
        resolvedAt: null,
        failedChecks: [`container monitor status: ${monitor.status}`],
        possibleCause: "The container may be stopped, missing, unhealthy, or Docker may be unavailable.",
        suggestedNextSteps: ["Check Docker availability.", "Confirm the container name or ID is correct.", "Inspect the container health and logs on the host."]
      });
    }
  }
  const runningContainers = docker.containers.filter((container) => container.status === "running").length;
  const stoppedContainers = docker.containers.length - runningContainers;
  const criticalAlerts = alerts.filter((item) => item.severity === "critical").length;
  const warnings = alerts.filter((item) => item.severity === "warning").length;
  const localServerStatus = worstStatus([
    system.metricsAvailable ? "healthy" : "warning",
    docker.dockerAvailable ? "healthy" : "warning"
  ]);
  const overallStatus = worstStatus([
    localServerStatus,
    ...serverMonitors.map((server) => server.status),
    ...domains.map((domain) => domain.status),
    ...alerts.map((item) => item.severity === "critical" ? "critical" : item.severity === "warning" ? "warning" : "healthy")
  ]);

  return {
    overview: {
      status: overallStatus,
      lastCheckedAt: system.metrics.createdAt,
      serversOnline: system.metricsAvailable ? 1 : 0,
      serversTotal: 1,
      containersRunning: runningContainers,
      containersTotal: docker.containers.length,
      domainsOnline: domains.filter((domain) => domain.status === "healthy").length,
      domainsTotal: domains.length,
      criticalAlerts,
      warnings
    },
    server: {
      ...system.server,
      status: localServerStatus,
      dockerVersion: docker.dockerVersion,
      dockerAvailable: docker.dockerAvailable,
      runningContainers,
      stoppedContainers
    },
    serverMonitors,
    metrics: system.metrics,
    docker,
    domains,
    alerts
  };
}
