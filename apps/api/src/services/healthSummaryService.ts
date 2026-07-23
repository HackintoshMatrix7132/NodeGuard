import type { Alert, HealthSummary, HealthSummaryCounts } from "../types/nodeguard.js";

function isOperationalIncident(alert: Alert) {
  return alert.affectedResource !== "Update Center"
    && (alert.severity === "critical" || alert.severity === "warning");
}

function countBySeverity(alerts: Alert[]): HealthSummaryCounts {
  return {
    total: alerts.length,
    critical: alerts.filter((alert) => alert.severity === "critical").length,
    warning: alerts.filter((alert) => alert.severity === "warning").length
  };
}

export function buildHealthSummary(activeAlerts: Alert[], alertHistory: Alert[]): HealthSummary {
  const activeIncidents = activeAlerts.filter((alert) => alert.status === "active" && isOperationalIncident(alert));
  const resolvedIncidents = alertHistory.filter((alert) => alert.status === "resolved" && isOperationalIncident(alert));
  const orderedIncidents = [...activeIncidents].sort((left, right) => {
    const severityDifference = (left.severity === "critical" ? 0 : 1) - (right.severity === "critical" ? 0 : 1);
    return severityDifference || Date.parse(left.firstSeenAt) - Date.parse(right.firstSeenAt);
  });
  const primary = orderedIncidents[0] ?? null;

  return {
    status: activeIncidents.some((alert) => alert.severity === "critical")
      ? "critical"
      : activeIncidents.some((alert) => alert.severity === "warning")
        ? "warning"
        : "healthy",
    activeIncidents: countBySeverity(activeIncidents),
    resolvedHistory: countBySeverity(resolvedIncidents),
    primaryIncident: primary
      ? {
          id: primary.id,
          severity: primary.severity as "critical" | "warning",
          title: primary.title,
          affectedResource: primary.affectedResource,
          since: primary.firstSeenAt
        }
      : null
  };
}
