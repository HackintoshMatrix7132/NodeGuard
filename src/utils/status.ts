import { colors } from "@/constants/theme";
import type { AlertSeverity, ContainerHealth, ContainerStatus, HealthStatus } from "@/types/nodeguard";

type StatusStyle = {
  label: string;
  color: string;
  background: string;
};

export function getHealthStatusStyle(status: HealthStatus): StatusStyle {
  switch (status) {
    case "healthy":
      return { label: "Healthy", color: colors.healthy, background: colors.healthyMuted };
    case "warning":
      return { label: "Warning", color: colors.warning, background: colors.warningMuted };
    case "critical":
      return { label: "Critical", color: colors.critical, background: colors.criticalMuted };
    case "offline":
      return { label: "Offline", color: colors.offline, background: colors.offlineMuted };
    default:
      return { label: "Unknown", color: colors.textMuted, background: colors.surfaceMuted };
  }
}

export function getContainerStatusStyle(status: ContainerStatus): StatusStyle {
  switch (status) {
    case "running":
      return { label: "Running", color: colors.healthy, background: colors.healthyMuted };
    case "restarting":
      return { label: "Restarting", color: colors.warning, background: colors.warningMuted };
    case "exited":
      return { label: "Exited", color: colors.offline, background: colors.offlineMuted };
    default:
      return { label: "Stopped", color: colors.offline, background: colors.offlineMuted };
  }
}

export function getContainerHealthStyle(health: ContainerHealth): StatusStyle {
  switch (health) {
    case "healthy":
      return { label: "Healthy", color: colors.healthy, background: colors.healthyMuted };
    case "unhealthy":
      return { label: "Unhealthy", color: colors.critical, background: colors.criticalMuted };
    case "starting":
      return { label: "Starting", color: colors.warning, background: colors.warningMuted };
    default:
      return { label: "No check", color: colors.textMuted, background: colors.surfaceMuted };
  }
}

export function getAlertSeverityStyle(severity: AlertSeverity): StatusStyle {
  switch (severity) {
    case "critical":
      return { label: "Critical", color: colors.critical, background: colors.criticalMuted };
    case "warning":
      return { label: "Warning", color: colors.warning, background: colors.warningMuted };
    case "resolved":
      return { label: "Resolved", color: colors.healthy, background: colors.healthyMuted };
    default:
      return { label: "Info", color: colors.blue, background: colors.blueMuted };
  }
}

export function getMetricColor(value: number) {
  if (value >= 90) {
    return colors.critical;
  }

  if (value >= 75) {
    return colors.warning;
  }

  return colors.accent;
}
