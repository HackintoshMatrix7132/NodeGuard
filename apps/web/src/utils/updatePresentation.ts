import type { MachineUpdateSummary, UpdateCenterSnapshot } from "../types/nodeguard";

export type MachineUpdateCondition = {
  label: string;
  tone: "healthy" | "warning" | "critical" | "unknown";
};

export function formatUpdateCount(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : String(value);
}

export function getMachineUpdateCondition(machine: MachineUpdateSummary): MachineUpdateCondition {
  if (machine.supported === false || machine.status === "unsupported" || machine.freshness === "unsupported") {
    return { label: "Unsupported", tone: "unknown" };
  }
  if (machine.status === "package_manager_busy") return { label: "Check delayed", tone: "warning" };
  if (machine.status === "metadata_refresh_failed" || machine.status === "check_failed") {
    return { label: "Check failed", tone: "critical" };
  }
  if (machine.status === "waiting" || machine.supported === null || machine.freshness === "waiting") {
    return { label: "Waiting", tone: "unknown" };
  }
  if (machine.freshness === "stale") return { label: "Stale data", tone: "unknown" };
  if (machine.freshness === "retained") return { label: "Last known", tone: "unknown" };
  if ((machine.securityUpdateCount ?? 0) > 0) return { label: "Security updates", tone: "critical" };
  if ((machine.updateCount ?? 0) > 0) return { label: "Updates available", tone: "warning" };
  if (machine.lastSuccessfulAt) return { label: "Up to date", tone: "healthy" };
  return { label: "Waiting", tone: "unknown" };
}

export function hasRetainedUpdateInventory(machine: MachineUpdateSummary) {
  return machine.lastSuccessfulAt !== null && machine.freshness !== "current";
}

export function currentUpdateCoverage(snapshot: UpdateCenterSnapshot) {
  return `${snapshot.currentReportingMachineCount}/${snapshot.totalMachineCount}`;
}

export function updateSummaryHasCurrentData(snapshot: UpdateCenterSnapshot | undefined) {
  return Boolean(snapshot && snapshot.currentReportingMachineCount > 0);
}

export function updateSummaryUsesRetainedData(snapshot: UpdateCenterSnapshot | undefined) {
  return Boolean(snapshot && (snapshot.summaryState === "partial" || snapshot.summaryState === "retained"));
}
