import type { HealthStatus, MonitoringSnapshot } from "../types/nodeguard.js";
import { getAgentMetricSnapshot, listAgentContainers, listAgents } from "./agentService.js";
import { createAlert, generateAlerts } from "./alertService.js";
import { recordAlertSnapshot } from "./alertHistoryService.js";
import { listContainerMonitorStatuses } from "./containerMonitorService.js";
import { getDockerSnapshot } from "./dockerService.js";
import { getDomainChecks } from "./domainCheckService.js";
import { listMonitoredServerStatuses } from "./serverMonitorService.js";
import { getSystemSnapshot } from "./systemMetrics.js";
import { getUpdateAlerts } from "./updateService.js";
import { getProxmoxAlerts, getProxmoxSnapshot } from "./proxmoxService.js";

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
  const [system, localDocker, domains, serverMonitors] = await Promise.all([
    getSystemSnapshot(),
    getDockerSnapshot(),
    getDomainChecks(),
    listMonitoredServerStatuses()
  ]);
  const agents = listAgents().filter((agent) => agent.status !== "revoked");
  const agentContainers = listAgentContainers();
  const docker = {
    dockerAvailable: localDocker.dockerAvailable || agents.some((agent) => agent.dockerAvailable),
    dockerVersion: localDocker.dockerVersion,
    containers: [...localDocker.containers, ...agentContainers],
    containerMonitors: localDocker.containerMonitors,
    ...(!localDocker.dockerAvailable && !agents.some((agent) => agent.dockerAvailable)
      ? { message: "Docker is unavailable on all reporting hosts." }
      : {})
  };
  docker.containerMonitors = await listContainerMonitorStatuses(docker);
  const alerts = generateAlerts(system.metrics, localDocker, domains, system.metricsAvailable);
  for (const agent of agents) {
    if (agent.status === "stale" || agent.status === "offline") {
      alerts.push(createAlert(
        `agent-${agent.id}-${agent.status}`,
        agent.status === "offline" ? "critical" : "warning",
        `${agent.displayName} agent is ${agent.status}`,
        agent.status === "offline"
          ? "NodeGuard has not received a heartbeat within the offline threshold."
          : "The agent heartbeat is overdue, but still within the configured grace period.",
        agent.displayName,
        [`agent status: ${agent.status}`],
        "The host may be powered off, disconnected, or unable to reach NodeGuard over HTTPS.",
        ["Check the agent systemd service.", "Check outbound HTTPS connectivity.", "Inspect the agent journal for recent errors."],
        agent.lastSeenAt ?? agent.registeredAt
      ));
    }

    const metrics = getAgentMetricSnapshot(agent.id);
    for (const [resource, value, warning, critical] of [
      ["CPU", metrics?.cpu.usagePercent, 80, 90],
      ["Memory", metrics?.memory.usagePercent, 80, 90],
      ["Disk", metrics?.disk.usagePercent, 80, 90]
    ] as Array<[string, number | null | undefined, number, number]>) {
      if (typeof value !== "number" || value < warning) continue;
      const severity = value >= critical ? "critical" : "warning";
      alerts.push(createAlert(
        `agent-${agent.id}-${resource.toLowerCase()}-${severity}`,
        severity,
        `${agent.displayName} ${resource} usage is ${severity}`,
        `${resource} usage is ${value.toFixed(1)}%, above the ${severity === "critical" ? critical : warning}% ${severity} threshold.`,
        agent.displayName,
        [`${resource} usage: ${value.toFixed(1)}%`],
        "The agent host may be under sustained resource pressure.",
        ["Review host workload and services.", "Inspect the resource history for sustained pressure."],
        metrics?.createdAt
      ));
    }
  }
  for (const container of agentContainers) {
    if (container.status !== "stopped" && container.status !== "exited") continue;
    alerts.push(createAlert(
      `agent-container-${container.serverId}-${container.id}`,
      "warning",
      `${container.name} is not running on ${container.hostName ?? "an agent host"}`,
      `${container.name} is currently ${container.status}.`,
      container.name,
      [`container status: ${container.status}`],
      "The container exited or was stopped outside NodeGuard.",
      ["Inspect the read-only container details and logs.", "Check the deployment on the reporting host."]
    ));
  }
  for (const server of serverMonitors) {
    if (server.status !== "healthy") {
      alerts.push(createAlert(
        `server-monitor-${server.id}`,
        server.status === "offline" ? "critical" : "warning",
        `${server.name} is ${server.status}`,
        server.lastError ?? "The monitored server did not pass its latest health check.",
        server.name,
        [`server monitor status: ${server.status}`],
        "The remote NodeGuard backend may be down, unreachable, or using a different API key.",
        ["Check the server URL.", "Verify the remote backend is running.", "Verify the API key if this monitor uses protected checks."],
        server.lastCheckedAt
      ));
    }
  }
  for (const monitor of docker.containerMonitors) {
    if (monitor.status !== "healthy") {
      alerts.push(createAlert(
        `container-monitor-${monitor.id}`,
        monitor.status === "offline" ? "critical" : "warning",
        `${monitor.name} is ${monitor.status}`,
        monitor.lastError ?? "The monitored container did not pass its latest check.",
        monitor.name,
        [`container monitor status: ${monitor.status}`],
        "The container may be stopped, missing, unhealthy, or Docker may be unavailable.",
        ["Check Docker availability.", "Confirm the container name or ID is correct.", "Inspect the container health and logs on the host."],
        monitor.lastCheckedAt
      ));
    }
  }
  for (const updateAlert of getUpdateAlerts()) {
    alerts.push(createAlert(
      updateAlert.securityCritical ? "security-updates-available" : "updates-available",
      updateAlert.securityCritical ? "warning" : "info",
      `${updateAlert.count} ${updateAlert.securityCritical ? "security-critical " : ""}${updateAlert.count === 1 ? "update" : "updates"} available`,
      updateAlert.securityCritical
        ? "Security operating-system updates are available on reporting machines."
        : "Operating-system package updates are available on reporting machines.",
      "Update Center",
      [`${updateAlert.count} update${updateAlert.count === 1 ? "" : "s"} available`],
      null,
      ["Open the Update Center.", "Review the affected machines and packages.", "Apply updates directly on each machine during a maintenance window."],
      updateAlert.checkedAt
    ));
  }
  const recordedAlerts = [...alerts, ...getProxmoxAlerts()];
  recordAlertSnapshot(recordedAlerts);
  const runningContainers = docker.containers.filter((container) => container.status === "running").length;
  const localRunningContainers = localDocker.containers.filter((container) => container.status === "running").length;
  const criticalAlerts = recordedAlerts.filter((item) => item.severity === "critical").length;
  const warnings = recordedAlerts.filter((item) => item.severity === "warning").length;
  const localServerStatus = worstStatus([
    system.metricsAvailable ? "healthy" : "warning",
    localDocker.dockerAvailable ? "healthy" : "warning"
  ]);
  const overallStatus = worstStatus([
    localServerStatus,
    ...serverMonitors.map((server) => server.status),
    ...agents.map((agent) => agent.status === "online" ? "healthy" : agent.status === "stale" ? "warning" : "offline"),
    ...domains.map((domain) => domain.status),
    ...recordedAlerts
      .filter((item) => !["updates-available", "security-updates-available"].includes(item.id))
      .map((item) => item.severity === "critical" ? "critical" : item.severity === "warning" ? "warning" : "healthy")
  ]);

  return {
    overview: {
      status: overallStatus,
      lastCheckedAt: system.metrics.createdAt,
      serversOnline: (system.metricsAvailable ? 1 : 0) + agents.filter((agent) => agent.status === "online").length,
      serversTotal: 1 + agents.length,
      containersRunning: runningContainers,
      containersTotal: docker.containers.length,
      domainsOnline: domains.filter((domain) => domain.status === "healthy").length,
      domainsTotal: domains.length,
      criticalAlerts,
      warnings,
      agentsOnline: agents.filter((agent) => agent.status === "online").length,
      agentsTotal: agents.length
    },
    server: {
      ...system.server,
      status: localServerStatus,
      dockerVersion: docker.dockerVersion,
      dockerAvailable: docker.dockerAvailable,
      runningContainers: localRunningContainers,
      stoppedContainers: localDocker.containers.length - localRunningContainers
    },
    serverMonitors,
    metrics: system.metrics,
    docker,
    domains,
    alerts: recordedAlerts
  };
}
