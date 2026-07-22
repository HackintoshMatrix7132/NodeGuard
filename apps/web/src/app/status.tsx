import type { AgentStatus,MachineUpdateSummary } from "../types/nodeguard";
import { getMachineUpdateCondition } from "../utils/updatePresentation";

function agentStatusTone(status: AgentStatus) {
  if (status === "online") return "healthy";
  if (status === "stale") return "warning";
  if (status === "offline" || status === "revoked") return "critical";
  return "unknown";
}

export function AgentStatusPill({ status }: { status: AgentStatus }) {
  return <span className={`pill ${agentStatusTone(status)}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export function MachineUpdateConditionPill({ machine }: { machine: MachineUpdateSummary }) {
  const condition = getMachineUpdateCondition(machine);
  return <span className={`pill ${condition.tone}`}>{condition.label}</span>;
}
