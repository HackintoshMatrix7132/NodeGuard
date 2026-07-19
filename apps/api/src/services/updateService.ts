import type {
  AgentStatus,
  AgentUpdateCheckStatus,
  AgentUpdateErrorCode,
  AgentUpdateInventoryInput,
  MachineUpdateDetail,
  MachineUpdatePackage,
  MachineUpdateSummary,
  UpdateCenterSnapshot
} from "../types/nodeguard.js";
import { env } from "../config/env.js";
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
  last_error_code: AgentUpdateErrorCode | null;
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

const defaultErrorCodes: Record<Exclude<AgentUpdateCheckStatus, "ok">, AgentUpdateErrorCode> = {
  unsupported: "unsupported_os",
  package_manager_busy: "package_manager_busy",
  metadata_refresh_failed: "metadata_refresh_failed",
  check_failed: "check_failed"
};

const safeErrorMessages: Record<AgentUpdateErrorCode, string> = {
  unsupported_os: "Update discovery is not available for this operating system.",
  os_detection_failed: "Operating system information could not be read safely.",
  apt_unavailable: "APT is not available on this machine.",
  package_lock_check_failed: "The package manager lock state could not be checked safely.",
  package_manager_busy: "The package manager is currently busy. NodeGuard will retry automatically.",
  metadata_refresh_timeout: "APT package metadata refresh timed out. NodeGuard will retry automatically.",
  metadata_output_too_large: "APT package metadata output exceeded the safe limit.",
  check_output_too_large: "APT update discovery output exceeded the safe limit.",
  metadata_refresh_failed: "APT package metadata could not be refreshed. NodeGuard will retry automatically.",
  check_timeout: "APT update discovery timed out. NodeGuard will retry automatically.",
  check_failed: "Operating-system updates could not be checked. NodeGuard will retry automatically.",
  malformed_apt_output: "APT returned an unexpected update list.",
  reboot_state_unavailable: "The reboot-required state could not be read safely."
};

function resolvedError(status: AgentUpdateCheckStatus, errorCode: AgentUpdateErrorCode | null) {
  if (status === "ok") return { code: null, message: null };
  const code = errorCode ?? defaultErrorCodes[status];
  return { code, message: safeErrorMessages[code] };
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
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
    os_pretty_name, last_error, last_error_code, updated_at
  ) VALUES (
    @agentId, @schemaVersion, @provider, @supported, @status, @checkedAt, @lastSuccessfulAt,
    @updateCount, @securityUpdateCount, @rebootRequired, @truncated, @osId, @osVersionId,
    @osPrettyName, @lastError, @lastErrorCode, @updatedAt
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
    last_error = excluded.last_error,
    last_error_code = excluded.last_error_code,
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

    const error = resolvedError(input.status, input.errorCode);
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
      lastError: error.message,
      lastErrorCode: error.code,
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

    if (current) {
      database.prepare(`
        UPDATE agent_update_inventories SET
          schema_version = ?, provider = ?, supported = ?, status = ?, checked_at = ?,
          os_id = ?, os_version_id = ?, os_pretty_name = ?, last_error = ?, last_error_code = ?, updated_at = ?
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
        error.message,
        error.code,
        values.updatedAt,
        agentId
      );
    } else {
      database.prepare(`
        INSERT INTO agent_update_inventories (
          agent_id, schema_version, provider, supported, status, checked_at, last_successful_at,
          update_count, security_update_count, reboot_required, truncated, os_id, os_version_id,
          os_pretty_name, last_error, last_error_code, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?)
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
        error.message,
        error.code,
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
    agent_update_inventories.last_error,
    agent_update_inventories.last_error_code
  FROM agents
  LEFT JOIN agent_update_inventories ON agent_update_inventories.agent_id = agents.id
`;

function inventoryFreshness(
  hasReport: boolean,
  hasSuccessfulInventory: boolean,
  supported: boolean | null,
  status: AgentUpdateCheckStatus | null,
  agentStatus: AgentStatus,
  lastSuccessfulAt: string | null,
  now: number
): MachineUpdateSummary["freshness"] {
  if (!hasReport) return "waiting";
  if (supported === false || status === "unsupported") return "unsupported";
  if (!hasSuccessfulInventory) return "waiting";
  const successTime = Date.parse(lastSuccessfulAt ?? "");
  const staleAfterSeconds = Math.max(
    env.agentUpdateIntervalSeconds * 2,
    env.agentUpdateIntervalSeconds + env.agentTimestampToleranceSeconds
  );
  if (!Number.isFinite(successTime) || now - successTime > staleAfterSeconds * 1000) return "stale";
  if (status !== "ok" || agentStatus !== "online") return "retained";
  return "current";
}

function rowToMachine(row: InventoryRow, now = Date.now()): MachineUpdateSummary {
  const hasReport = row.checked_at !== null;
  const hasSuccessfulInventory = row.last_successful_at !== null;
  const fallbackPrettyName = [row.agent_os_name, row.agent_os_version].filter(Boolean).join(" ") || null;
  const agentStatus = calculateAgentStatus(row.last_seen_at, row.revoked_at, now);
  const supported = hasReport ? Boolean(row.supported) : null;
  return {
    agentId: row.agent_id,
    displayName: row.display_name,
    hostname: row.hostname,
    agentStatus,
    provider: hasReport ? row.provider : null,
    supported,
    status: row.status ?? "waiting",
    freshness: inventoryFreshness(hasReport, hasSuccessfulInventory, supported, row.status, agentStatus, row.last_successful_at, now),
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
    lastError: row.last_error,
    lastErrorCode: row.last_error_code
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
    case "up_to_date": return machine.freshness === "current" && machine.updateCount === 0;
    case "reboot": return machine.rebootRequired === true;
    case "unsupported": return machine.status === "unsupported";
    case "check_failed": return ["package_manager_busy", "metadata_refresh_failed", "check_failed"].includes(machine.status);
    case "stale_offline": return machine.freshness === "stale" || machine.agentStatus === "stale" || machine.agentStatus === "offline";
    default: return true;
  }
}

function latestTimestamp(machines: MachineUpdateSummary[], select: (machine: MachineUpdateSummary) => string | null) {
  return machines.reduce<string | null>((latest, machine) => {
    const timestamp = select(machine);
    return timestamp && (!latest || timestamp > latest) ? timestamp : latest;
  }, null);
}

export function getUpdateCenterSnapshot(filters: UpdateMachineFilters = {}, now = Date.now()): UpdateCenterSnapshot {
  const mapRow = (row: InventoryRow) => rowToMachine(row, now);
  const allMachines = listMachineRows().map(mapRow);
  const eligibleMachines = allMachines.filter((machine) => machine.status !== "unsupported");
  const successfulMachines = eligibleMachines.filter((machine) => machine.lastSuccessfulAt !== null);
  const currentMachines = successfulMachines.filter((machine) => machine.freshness === "current");
  const retainedMachines = successfulMachines.filter((machine) => machine.freshness !== "current");
  const status = filters.status ?? "all";
  const searchedMachines = filters.search ? listMachineRows(filters.search).map(mapRow) : allMachines;
  const machines = status === "all" ? searchedMachines : searchedMachines.filter((machine) => matchesStatus(machine, status));
  const summaryState = eligibleMachines.length === 0
    ? "empty"
    : successfulMachines.length === 0
      ? "waiting"
      : currentMachines.length === eligibleMachines.length
        ? "current"
        : currentMachines.length === 0
          ? "retained"
          : "partial";
  return {
    machines,
    availableCount: successfulMachines.length
      ? successfulMachines.reduce((total, machine) => total + (machine.updateCount ?? 0), 0)
      : null,
    securityCriticalCount: successfulMachines.length
      ? successfulMachines.reduce((total, machine) => total + (machine.securityUpdateCount ?? 0), 0)
      : null,
    reportingMachineCount: successfulMachines.length,
    currentReportingMachineCount: currentMachines.length,
    retainedMachineCount: retainedMachines.length,
    totalMachineCount: eligibleMachines.length,
    lastCheckedAt: latestTimestamp(allMachines, (machine) => machine.checkedAt),
    lastSuccessfulAt: latestTimestamp(successfulMachines, (machine) => machine.lastSuccessfulAt),
    summaryState
  };
}

export function getMachineUpdateDetail(agentId: string, now = Date.now()): MachineUpdateDetail | null {
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

  return { ...rowToMachine(row, now), packages };
}

export function getUpdateAlerts() {
  const snapshot = getUpdateCenterSnapshot();
  const availableCount = snapshot.availableCount;
  if (!availableCount) return [];
  const securityCount = snapshot.securityCriticalCount ?? 0;
  const checkedAt = snapshot.lastSuccessfulAt ?? snapshot.lastCheckedAt ?? nowIso();
  const standardCount = availableCount - securityCount;
  const alerts = [];
  if (standardCount > 0) alerts.push({ count: standardCount, securityCritical: false, checkedAt });
  if (securityCount > 0) {
    alerts.push({ count: securityCount, securityCritical: true, checkedAt });
  }
  return alerts;
}
