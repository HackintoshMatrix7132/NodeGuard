import type {
  AgentStatus,
  AgentUpdateCheckStatus,
  AgentUpdateInventoryInput,
  MachineUpdateDetail,
  MachineUpdatePackage,
  MachineUpdateSummary,
  UpdateCenterSnapshot
} from "../types/nodeguard.js";
import { AgentServiceError, calculateAgentStatus } from "./agentService.js";
import { getDatabase } from "./database.js";

type InventoryRow = {
  agent_id: string;
  display_name: string;
  hostname: string;
  agent_status: AgentStatus;
  agent_os_name: string | null;
  agent_os_version: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  schema_version: number | null;
  provider: "apt" | null;
  supported: number | null;
  status: AgentUpdateCheckStatus | null;
  checked_at: string | null;
  last_successful_at: string | null;
  update_count: number | null;
  security_update_count: number | null;
  reboot_required: number | null;
  truncated: number | null;
  os_id: string | null;
  os_version_id: string | null;
  os_pretty_name: string | null;
  last_error: string | null;
};

type PackageRow = {
  package_name: string;
  installed_version: string;
  candidate_version: string;
  security: number;
  source: string | null;
};

const database = getDatabase();

export type UpdateMachineFilterStatus =
  | "all"
  | "updates"
  | "security"
  | "up_to_date"
  | "reboot"
  | "unsupported"
  | "check_failed"
  | "stale_offline";

export type UpdateMachineFilters = {
  search?: string;
  status?: UpdateMachineFilterStatus;
};

const safeStatusMessages: Partial<Record<AgentUpdateCheckStatus, string>> = {
  package_manager_busy: "The package manager is currently busy. NodeGuard will retry automatically.",
  metadata_refresh_failed: "Package metadata could not be refreshed. NodeGuard will retry automatically.",
  check_failed: "Operating-system updates could not be checked. NodeGuard will retry automatically."
};

function nowIso() {
  return new Date().toISOString();
}

function inventoryRow(agentId: string) {
  return database.prepare("SELECT * FROM agent_update_inventories WHERE agent_id = ?").get(agentId) as
    | Omit<InventoryRow, "display_name" | "hostname" | "agent_status" | "agent_os_name" | "agent_os_version" | "last_seen_at" | "revoked_at">
    | undefined;
}

const writeSuccessfulInventory = database.prepare(`
  INSERT INTO agent_update_inventories (
    agent_id, schema_version, provider, supported, status, checked_at, last_successful_at,
    update_count, security_update_count, reboot_required, truncated, os_id, os_version_id,
    os_pretty_name, last_error, updated_at
  ) VALUES (
    @agentId, @schemaVersion, @provider, @supported, @status, @checkedAt, @lastSuccessfulAt,
    @updateCount, @securityUpdateCount, @rebootRequired, @truncated, @osId, @osVersionId,
    @osPrettyName, NULL, @updatedAt
  )
  ON CONFLICT(agent_id) DO UPDATE SET
    schema_version = excluded.schema_version,
    provider = excluded.provider,
    supported = excluded.supported,
    status = excluded.status,
    checked_at = excluded.checked_at,
    last_successful_at = excluded.last_successful_at,
    update_count = excluded.update_count,
    security_update_count = excluded.security_update_count,
    reboot_required = excluded.reboot_required,
    truncated = excluded.truncated,
    os_id = excluded.os_id,
    os_version_id = excluded.os_version_id,
    os_pretty_name = excluded.os_pretty_name,
    last_error = NULL,
    updated_at = excluded.updated_at
`);

const insertPackage = database.prepare(`
  INSERT INTO agent_package_updates (
    agent_id, package_name, installed_version, candidate_version, security, source, inventory_checked_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

export function recordAgentUpdates(agentId: string, input: AgentUpdateInventoryInput) {
  const recorded = database.transaction(() => {
    const agent = database.prepare("SELECT id FROM agents WHERE id = ? AND revoked_at IS NULL").get(agentId);
    if (!agent) throw new AgentServiceError("agent_not_found", "Agent not found.", 404);

    const current = inventoryRow(agentId);
    if (current && Date.parse(input.checkedAt) <= Date.parse(current.checked_at ?? "")) {
      return false;
    }

    const values = {
      agentId,
      schemaVersion: input.schemaVersion,
      provider: input.provider,
      supported: input.supported ? 1 : 0,
      status: input.status,
      checkedAt: input.checkedAt,
      lastSuccessfulAt: input.lastSuccessfulAt,
      updateCount: input.updateCount,
      securityUpdateCount: input.securityUpdateCount,
      rebootRequired: input.rebootRequired ? 1 : 0,
      truncated: input.truncated ? 1 : 0,
      osId: input.os.id,
      osVersionId: input.os.versionId,
      osPrettyName: input.os.prettyName,
      updatedAt: nowIso()
    };

    if (input.status === "ok" || input.status === "unsupported") {
      writeSuccessfulInventory.run(input.status === "unsupported"
        ? {
            ...values,
            lastSuccessfulAt: null,
            updateCount: 0,
            securityUpdateCount: 0,
            rebootRequired: 0,
            truncated: 0
          }
        : values);
      database.prepare("DELETE FROM agent_package_updates WHERE agent_id = ?").run(agentId);
      if (input.status === "ok") {
        for (const update of input.packages) {
          insertPackage.run(
            agentId,
            update.name,
            update.installedVersion,
            update.candidateVersion,
            update.security ? 1 : 0,
            update.source,
            input.lastSuccessfulAt
          );
        }
      }
      return true;
    }

    const lastError = safeStatusMessages[input.status] ?? "Operating-system updates could not be checked.";
    if (current) {
      database.prepare(`
        UPDATE agent_update_inventories SET
          schema_version = ?, provider = ?, supported = ?, status = ?, checked_at = ?,
          os_id = ?, os_version_id = ?, os_pretty_name = ?, last_error = ?, updated_at = ?
        WHERE agent_id = ?
      `).run(
        input.schemaVersion,
        input.provider,
        input.supported ? 1 : 0,
        input.status,
        input.checkedAt,
        input.os.id,
        input.os.versionId,
        input.os.prettyName,
        lastError,
        values.updatedAt,
        agentId
      );
    } else {
      database.prepare(`
        INSERT INTO agent_update_inventories (
          agent_id, schema_version, provider, supported, status, checked_at, last_successful_at,
          update_count, security_update_count, reboot_required, truncated, os_id, os_version_id,
          os_pretty_name, last_error, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, ?, ?, ?, ?, ?)
      `).run(
        agentId,
        input.schemaVersion,
        input.provider,
        input.supported ? 1 : 0,
        input.status,
        input.checkedAt,
        input.os.id,
        input.os.versionId,
        input.os.prettyName,
        lastError,
        values.updatedAt
      );
    }
    return true;
  })();

  return { ok: true as const, accepted: recorded, receivedAt: nowIso() };
}

const inventorySelect = `
  SELECT
    agents.id AS agent_id,
    agents.display_name,
    agents.hostname,
    agents.status AS agent_status,
    agents.os_name AS agent_os_name,
    agents.os_version AS agent_os_version,
    agents.last_seen_at,
    agents.revoked_at,
    agent_update_inventories.schema_version,
    agent_update_inventories.provider,
    agent_update_inventories.supported,
    agent_update_inventories.status,
    agent_update_inventories.checked_at,
    agent_update_inventories.last_successful_at,
    agent_update_inventories.update_count,
    agent_update_inventories.security_update_count,
    agent_update_inventories.reboot_required,
    agent_update_inventories.truncated,
    agent_update_inventories.os_id,
    agent_update_inventories.os_version_id,
    agent_update_inventories.os_pretty_name,
    agent_update_inventories.last_error
  FROM agents
  LEFT JOIN agent_update_inventories ON agent_update_inventories.agent_id = agents.id
`;

function rowToMachine(row: InventoryRow): MachineUpdateSummary {
  const hasReport = row.checked_at !== null;
  const hasSuccessfulInventory = row.last_successful_at !== null;
  const fallbackPrettyName = [row.agent_os_name, row.agent_os_version].filter(Boolean).join(" ") || null;
  return {
    agentId: row.agent_id,
    displayName: row.display_name,
    hostname: row.hostname,
    agentStatus: calculateAgentStatus(row.last_seen_at, row.revoked_at),
    provider: hasReport ? row.provider : null,
    supported: hasReport ? Boolean(row.supported) : null,
    status: row.status ?? "waiting",
    os: {
      id: row.os_id,
      versionId: row.os_version_id,
      prettyName: row.os_pretty_name ?? fallbackPrettyName
    },
    updateCount: hasSuccessfulInventory ? row.update_count ?? 0 : null,
    securityUpdateCount: hasSuccessfulInventory ? row.security_update_count ?? 0 : null,
    rebootRequired: hasSuccessfulInventory ? Boolean(row.reboot_required) : null,
    truncated: hasSuccessfulInventory && Boolean(row.truncated),
    checkedAt: row.checked_at,
    lastSuccessfulAt: row.last_successful_at,
    lastError: row.last_error
  };
}

function listMachineRows(search?: string) {
  const normalizedSearch = search?.trim().slice(0, 120) ?? "";
  if (!normalizedSearch) {
    return database.prepare(`${inventorySelect}
      WHERE agents.revoked_at IS NULL
      ORDER BY agents.display_name COLLATE NOCASE
    `).all() as InventoryRow[];
  }

  const escapedSearch = normalizedSearch.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escapedSearch}%`;
  return database.prepare(`${inventorySelect}
    WHERE agents.revoked_at IS NULL AND (
      agents.display_name LIKE ? ESCAPE '\\'
      OR agents.hostname LIKE ? ESCAPE '\\'
      OR COALESCE(agent_update_inventories.os_pretty_name, '') LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM agent_package_updates
        WHERE agent_package_updates.agent_id = agents.id
          AND agent_package_updates.package_name LIKE ? ESCAPE '\\'
      )
    )
    ORDER BY agents.display_name COLLATE NOCASE
  `).all(pattern, pattern, pattern, pattern) as InventoryRow[];
}

function matchesStatus(machine: MachineUpdateSummary, status: UpdateMachineFilterStatus) {
  switch (status) {
    case "updates": return (machine.updateCount ?? 0) > 0;
    case "security": return (machine.securityUpdateCount ?? 0) > 0;
    case "up_to_date": return machine.status === "ok" && machine.updateCount === 0;
    case "reboot": return machine.rebootRequired === true;
    case "unsupported": return machine.status === "unsupported";
    case "check_failed": return ["package_manager_busy", "metadata_refresh_failed", "check_failed"].includes(machine.status);
    case "stale_offline": return machine.agentStatus === "stale" || machine.agentStatus === "offline";
    default: return true;
  }
}

export function getUpdateCenterSnapshot(filters: UpdateMachineFilters = {}): UpdateCenterSnapshot {
  const allMachines = listMachineRows().map(rowToMachine);
  const currentMachines = allMachines.filter((machine) =>
    machine.status === "ok" && machine.agentStatus === "online" && machine.lastSuccessfulAt !== null
  );
  const eligibleMachines = allMachines.filter((machine) => machine.status !== "unsupported");
  const status = filters.status ?? "all";
  const searchedMachines = filters.search ? listMachineRows(filters.search).map(rowToMachine) : allMachines;
  const machines = status === "all" ? searchedMachines : searchedMachines.filter((machine) => matchesStatus(machine, status));
  return {
    machines,
    availableCount: currentMachines.reduce((total, machine) => total + (machine.updateCount ?? 0), 0),
    securityCriticalCount: currentMachines.reduce((total, machine) => total + (machine.securityUpdateCount ?? 0), 0),
    reportingMachineCount: currentMachines.length,
    totalMachineCount: eligibleMachines.length,
    lastCheckedAt: currentMachines.reduce<string | null>((latest, machine) => {
      if (!machine.lastSuccessfulAt) return latest;
      return !latest || machine.lastSuccessfulAt > latest ? machine.lastSuccessfulAt : latest;
    }, null)
  };
}

export function getMachineUpdateDetail(agentId: string): MachineUpdateDetail | null {
  const row = database.prepare(`${inventorySelect}
    WHERE agents.id = ? AND agents.revoked_at IS NULL
  `).get(agentId) as InventoryRow | undefined;
  if (!row) return null;

  const packages = row.last_successful_at
    ? (database.prepare(`
        SELECT package_name, installed_version, candidate_version, security, source
        FROM agent_package_updates
        WHERE agent_id = ?
        ORDER BY security DESC, package_name COLLATE NOCASE
      `).all(agentId) as PackageRow[]).map<MachineUpdatePackage>((update) => ({
        name: update.package_name,
        installedVersion: update.installed_version,
        candidateVersion: update.candidate_version,
        security: Boolean(update.security),
        source: update.source
      }))
    : [];

  return { ...rowToMachine(row), packages };
}

export function getUpdateAlerts() {
  const snapshot = getUpdateCenterSnapshot();
  if (snapshot.availableCount === 0) return [];
  const checkedAt = snapshot.lastCheckedAt ?? nowIso();
  const standardCount = snapshot.availableCount - snapshot.securityCriticalCount;
  const alerts = [];
  if (standardCount > 0) alerts.push({ count: standardCount, securityCritical: false, checkedAt });
  if (snapshot.securityCriticalCount > 0) {
    alerts.push({ count: snapshot.securityCriticalCount, securityCritical: true, checkedAt });
  }
  return alerts;
}
