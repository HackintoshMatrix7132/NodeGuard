import type { AlertSeverity, HealthStatus } from "../types/nodeguard";

export function getStatusLabel(status: HealthStatus | AlertSeverity) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getStatusTone(status: HealthStatus | AlertSeverity) {
  if (status === "healthy" || status === "resolved") return "healthy";
  if (status === "warning") return "warning";
  if (status === "critical" || status === "offline") return "critical";
  return "unknown";
}
