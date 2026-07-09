import { env } from "../config/env.js";
import type { Alert, DockerSnapshot, DomainCheck, MetricSnapshot } from "../types/nodeguard.js";

export function createAlert(id: string, severity: Alert["severity"], title: string, message: string, affectedResource: string, failedChecks: string[], possibleCause: string | null, suggestedNextSteps: string[], createdAt = new Date().toISOString()): Alert {
  return {
    id,
    severity,
    title,
    message,
    affectedResource,
    status: "active",
    createdAt,
    firstSeenAt: createdAt,
    lastSeenAt: createdAt,
    occurrenceCount: 1,
    resolvedAt: null,
    failedChecks,
    possibleCause,
    suggestedNextSteps
  };
}

function thresholdAlert(resource: "CPU" | "Memory" | "Disk", value: number | null, warning: number, critical: number) {
  if (value === null) {
    return null;
  }

  if (value >= critical) {
    return createAlert(
      `${resource.toLowerCase()}-critical`,
      "critical",
      `${resource} usage is critical`,
      `${resource} usage is ${value.toFixed(1)}%, above the ${critical}% critical threshold.`,
      "local-node",
      [`${resource} >= ${critical}%`],
      "The host may be under sustained load or resource pressure.",
      ["Review recent workload changes.", "Check the heaviest services from the host.", "Increase capacity if this is expected load."]
    );
  }

  if (value >= warning) {
    return createAlert(
      `${resource.toLowerCase()}-warning`,
      "warning",
      `${resource} usage is elevated`,
      `${resource} usage is ${value.toFixed(1)}%, above the ${warning}% warning threshold.`,
      "local-node",
      [`${resource} >= ${warning}%`],
      "The host is approaching its configured resource limit.",
      ["Watch this metric over the next checks.", "Review services with recent traffic or job spikes."]
    );
  }

  return null;
}

export function generateAlerts(metrics: MetricSnapshot, docker: DockerSnapshot, domains: DomainCheck[], metricsAvailable: boolean): Alert[] {
  const alerts: Alert[] = [];

  if (!metricsAvailable) {
    alerts.push(createAlert(
      "metrics-unavailable",
      "critical",
      "Server metrics unavailable",
      "NodeGuard could not read one or more core system metric sources.",
      "local-node",
      ["systeminformation metrics unavailable"],
      "The host may not expose the requested metric source.",
      ["Check backend logs.", "Verify the backend is running on the monitored host."]
    ));
  }

  for (const candidate of [
    thresholdAlert("CPU", metrics.cpu.usagePercent, env.thresholds.cpuWarning, env.thresholds.cpuCritical),
    thresholdAlert("Memory", metrics.memory.usagePercent, env.thresholds.memoryWarning, env.thresholds.memoryCritical),
    thresholdAlert("Disk", metrics.disk.usagePercent, env.thresholds.diskWarning, env.thresholds.diskCritical)
  ]) {
    if (candidate) {
      alerts.push(candidate);
    }
  }

  if (!docker.dockerAvailable) {
    alerts.push(createAlert(
      "docker-unavailable",
      "warning",
      "Docker unavailable",
      docker.message ?? "NodeGuard could not read Docker status.",
      "docker",
      ["Docker API unavailable"],
      "Docker may not be installed, running, or accessible to the backend user.",
      ["Run systemctl status docker on the host.", "Check that the backend user can read Docker metadata.", "Restart the NodeGuard API after fixing Docker access."]
    ));
  }

  for (const container of docker.containers) {
    if (container.status === "exited" || container.status === "stopped") {
      alerts.push(createAlert(
        `container-${container.id}`,
        "warning",
        `${container.name} is not running`,
        `${container.name} is currently ${container.status}.`,
        container.name,
        [`container status: ${container.status}`],
        "The container exited or was stopped outside NodeGuard.",
        ["Inspect container logs.", "Check the service's deployment config."]
      ));
    }
  }

  for (const domain of domains) {
    const displayUrl = `${domain.domain}${domain.path === "/" ? "" : domain.path}`;
    if (domain.status === "offline") {
      alerts.push(createAlert(
        `domain-${domain.id}-offline`,
        "critical",
        `${displayUrl} is unreachable`,
        domain.error ?? "The domain check failed.",
        displayUrl,
        ["domain unreachable"],
        "The public route, DNS, reverse proxy, or upstream app may be unavailable.",
        ["Check DNS and reverse proxy status.", "Check whether the upstream service is running.", "Verify the URL path and expected status code for this service."]
      ));
    } else if (domain.statusCode && [500, 502, 503].includes(domain.statusCode)) {
      alerts.push(createAlert(
        `domain-${domain.id}-${domain.statusCode}`,
        "critical",
        `${displayUrl} returned HTTP ${domain.statusCode}`,
        "The domain is reachable but returned a server error.",
        displayUrl,
        [`HTTP ${domain.statusCode}`],
        "The reverse proxy or upstream service returned an error.",
        ["Check reverse proxy logs.", "Check upstream container health.", "Verify Docker network labels and internal container ports."]
      ));
    } else if (domain.status === "warning" && domain.statusCode) {
      alerts.push(createAlert(
        `domain-${domain.id}-${domain.statusCode}`,
        "warning",
        `${displayUrl} returned unexpected HTTP ${domain.statusCode}`,
        domain.error ?? "The service responded, but not with an expected status code.",
        displayUrl,
        [`expected HTTP ${domain.expectedStatusCodes.join(", ")}`, `received HTTP ${domain.statusCode}`],
        "The service is reachable, but NodeGuard may be checking the wrong path or the expected status codes need to be adjusted.",
        ["Edit this domain monitor and set the correct path.", "Add the expected HTTP status code if this response is normal.", "Check whether the service redirects to a login page."]
      ));
    }
  }

  return alerts;
}
