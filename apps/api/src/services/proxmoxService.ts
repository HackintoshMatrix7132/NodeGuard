import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import type { Alert } from "../types/nodeguard.js";
import { createAlert } from "./alertService.js";
import { getDatabase } from "./database.js";
import {
  collectProxmoxSnapshot,
  normalizeProxmoxBaseUrl,
  type ProxmoxCollectedSnapshot,
  type ProxmoxCredentials,
} from "./proxmoxClient.js";
import {
  decryptIntegrationValue,
  encryptIntegrationValue,
} from "./integrationCrypto.js";

const db = getDatabase();
const activeSyncs = new Set<string>();
let scheduler: NodeJS.Timeout | null = null;

export async function runWithProxmoxSyncLock(
  id: string,
  task: () => Promise<void>,
): Promise<boolean> {
  if (activeSyncs.has(id)) return false;
  activeSyncs.add(id);
  try {
    await task();
    return true;
  } finally {
    activeSyncs.delete(id);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS proxmox_connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    token_user TEXT NOT NULL,
    token_id TEXT NOT NULL,
    encrypted_secret TEXT NOT NULL,
    secret_iv TEXT NOT NULL,
    secret_tag TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    version TEXT,
    last_checked_at TEXT,
    last_success_at TEXT,
    last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS proxmox_nodes (
    connection_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    uptime REAL,
    cpu_usage REAL,
    memory_used REAL,
    memory_total REAL,
    disk_used REAL,
    disk_total REAL,
    pve_version TEXT,
    last_synced_at TEXT NOT NULL,
    PRIMARY KEY (connection_id, node_id),
    FOREIGN KEY (connection_id) REFERENCES proxmox_connections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS proxmox_guests (
    connection_id TEXT NOT NULL,
    guest_id TEXT NOT NULL,
    guest_type TEXT NOT NULL,
    vmid INTEGER NOT NULL,
    name TEXT NOT NULL,
    node TEXT NOT NULL,
    status TEXT NOT NULL,
    uptime REAL,
    cpu_usage REAL,
    memory_used REAL,
    memory_total REAL,
    last_synced_at TEXT NOT NULL,
    PRIMARY KEY (connection_id, guest_id),
    FOREIGN KEY (connection_id) REFERENCES proxmox_connections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS proxmox_storage (
    connection_id TEXT NOT NULL,
    storage_id TEXT NOT NULL,
    name TEXT NOT NULL,
    node TEXT NOT NULL,
    storage_type TEXT NOT NULL,
    status TEXT NOT NULL,
    used REAL,
    total REAL,
    utilization REAL,
    content TEXT,
    last_synced_at TEXT NOT NULL,
    PRIMARY KEY (connection_id, storage_id),
    FOREIGN KEY (connection_id) REFERENCES proxmox_connections(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS proxmox_nodes_connection_idx ON proxmox_nodes(connection_id);
  CREATE INDEX IF NOT EXISTS proxmox_guests_connection_idx ON proxmox_guests(connection_id);
  CREATE INDEX IF NOT EXISTS proxmox_storage_connection_idx ON proxmox_storage(connection_id);
`);

interface ConnectionRow {
  id: string;
  name: string;
  base_url: string;
  token_user: string;
  token_id: string;
  encrypted_secret: string;
  secret_iv: string;
  secret_tag: string;
  enabled: number;
  version: string | null;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

interface StoredSecret {
  tokenSecret: string;
  customCa: string | null;
}

export interface ProxmoxConnectionInput {
  name: string;
  baseUrl: string;
  tokenUser: string;
  tokenId: string;
  tokenSecret?: string;
  customCa?: string | null;
  enabled?: boolean;
}

function failureThreshold(): number {
  return Math.max(
    1,
    Number(process.env.NODEGUARD_PROXMOX_FAILURE_THRESHOLD ?? 3),
  );
}

function syncIntervalMs(): number {
  return env.proxmoxSyncIntervalSeconds * 1000;
}

function storageWarningThreshold(): number {
  return Math.min(
    100,
    Math.max(
      1,
      Number(process.env.NODEGUARD_PROXMOX_STORAGE_WARNING_PERCENT ?? 80),
    ),
  );
}

function storageCriticalThreshold(): number {
  return Math.min(
    100,
    Math.max(
      storageWarningThreshold(),
      Number(process.env.NODEGUARD_PROXMOX_STORAGE_CRITICAL_PERCENT ?? 90),
    ),
  );
}

export function summarizeProxmoxStorage(
  storage: ReadonlyArray<{ status: unknown; utilization: unknown }>,
) {
  const warningThreshold = storageWarningThreshold();
  const criticalThreshold = storageCriticalThreshold();
  let storageWarnings = 0;
  let storageCritical = 0;
  let storageUnavailable = 0;

  for (const item of storage) {
    if (item.status === "unavailable" || item.status === "offline") {
      storageUnavailable += 1;
      continue;
    }

    const percent =
      typeof item.utilization === "number" &&
      Number.isFinite(item.utilization)
        ? item.utilization * 100
        : null;
    if (percent !== null && percent >= criticalThreshold) {
      storageCritical += 1;
    } else if (percent !== null && percent >= warningThreshold) {
      storageWarnings += 1;
    }
  }

  return { storageWarnings, storageCritical, storageUnavailable };
}

function validateInput(
  input: ProxmoxConnectionInput,
  requireSecret: boolean,
): ProxmoxConnectionInput {
  const name = input.name?.trim();
  const tokenUser = input.tokenUser?.trim();
  const tokenId = input.tokenId?.trim();
  const tokenSecret = input.tokenSecret?.trim();
  if (!name || name.length > 100)
    throw new Error("A connection name is required.");
  if (!tokenUser || !/^[^\s!]+@[^\s!]+$/.test(tokenUser)) {
    throw new Error("Token user must use the USER@REALM format.");
  }
  if (!tokenId || !/^[A-Za-z0-9._-]{1,64}$/.test(tokenId)) {
    throw new Error("A valid API token ID is required.");
  }
  if (requireSecret && !tokenSecret)
    throw new Error("An API token secret is required.");
  if (input.customCa && !input.customCa.includes("BEGIN CERTIFICATE")) {
    throw new Error("Custom CA must be a PEM encoded certificate.");
  }
  return {
    ...input,
    name,
    baseUrl: normalizeProxmoxBaseUrl(input.baseUrl),
    tokenUser,
    tokenId,
    ...(tokenSecret ? { tokenSecret } : {}),
    customCa: input.customCa?.trim() || null,
  };
}

function readSecret(row: ConnectionRow): StoredSecret {
  return JSON.parse(
    decryptIntegrationValue({
      encrypted: row.encrypted_secret,
      iv: row.secret_iv,
      tag: row.secret_tag,
    }),
  ) as StoredSecret;
}

function credentials(row: ConnectionRow): ProxmoxCredentials {
  const secret = readSecret(row);
  return {
    baseUrl: row.base_url,
    tokenUser: row.token_user,
    tokenId: row.token_id,
    tokenSecret: secret.tokenSecret,
    customCa: secret.customCa,
  };
}

function connectionStatus(
  row: ConnectionRow,
): "available" | "stale" | "unavailable" | "disabled" | "pending" {
  if (!row.enabled) return "disabled";
  if (row.consecutive_failures >= failureThreshold()) return "unavailable";
  if (!row.last_success_at) return "pending";
  if (
    Date.now() - new Date(row.last_success_at).getTime() >
    Math.max(syncIntervalMs() * 2.5, 10 * 60_000)
  ) {
    return "stale";
  }
  return "available";
}

function publicConnection(row: ConnectionRow) {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    tokenUser: row.token_user,
    tokenId: row.token_id,
    hasToken: true,
    hasCustomCa: Boolean(readSecret(row).customCa),
    enabled: Boolean(row.enabled),
    version: row.version,
    status: connectionStatus(row),
    lastCheckedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    consecutiveFailures: row.consecutive_failures,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getConnectionRow(id: string): ConnectionRow | undefined {
  return db
    .prepare("SELECT * FROM proxmox_connections WHERE id = ?")
    .get(id) as ConnectionRow | undefined;
}

export function getProxmoxNodeConnectionContext(
  connectionId: string,
  nodeName: string,
) {
  const row = getConnectionRow(connectionId);
  if (!row) throw new Error("Proxmox connection was not found.");
  if (!row.enabled) throw new Error("Proxmox connection is disabled.");

  const node = rowsForConnection(connectionId).nodes.find(
    (item) => item.name === nodeName || item.id === `node/${nodeName}`,
  );
  if (!node) throw new Error("Proxmox node was not found.");

  return {
    connection: {
      id: row.id,
      name: row.name,
      status: connectionStatus(row),
      version: row.version,
      lastCheckedAt: row.last_checked_at,
      lastSuccessAt: row.last_success_at,
    },
    node,
    credentials: credentials(row),
  };
}

export function listProxmoxConnections() {
  return (
    db
      .prepare("SELECT * FROM proxmox_connections ORDER BY name COLLATE NOCASE")
      .all() as ConnectionRow[]
  ).map((row) => {
    const inventory = rowsForConnection(row.id);
    return {
      ...publicConnection(row),
      nodeCount: inventory.nodes.length,
      guestCount: inventory.guests.length,
      storageCount: inventory.storage.length,
    };
  });
}

function storeSnapshot(
  connectionId: string,
  snapshot: ProxmoxCollectedSnapshot,
): void {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM proxmox_nodes WHERE connection_id = ?").run(
      connectionId,
    );
    db.prepare("DELETE FROM proxmox_guests WHERE connection_id = ?").run(
      connectionId,
    );
    db.prepare("DELETE FROM proxmox_storage WHERE connection_id = ?").run(
      connectionId,
    );

    const nodeInsert = db.prepare(`INSERT INTO proxmox_nodes
      (connection_id,node_id,name,status,uptime,cpu_usage,memory_used,memory_total,disk_used,disk_total,pve_version,last_synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const node of snapshot.nodes) {
      nodeInsert.run(
        connectionId,
        node.id,
        node.name,
        node.status,
        node.uptime,
        node.cpuUsage,
        node.memoryUsed,
        node.memoryTotal,
        node.diskUsed,
        node.diskTotal,
        node.version,
        snapshot.checkedAt,
      );
    }

    const guestInsert = db.prepare(`INSERT INTO proxmox_guests
      (connection_id,guest_id,guest_type,vmid,name,node,status,uptime,cpu_usage,memory_used,memory_total,last_synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const guest of snapshot.guests) {
      guestInsert.run(
        connectionId,
        guest.id,
        guest.type,
        guest.vmid,
        guest.name,
        guest.node,
        guest.status,
        guest.uptime,
        guest.cpuUsage,
        guest.memoryUsed,
        guest.memoryTotal,
        snapshot.checkedAt,
      );
    }

    const storageInsert = db.prepare(`INSERT INTO proxmox_storage
      (connection_id,storage_id,name,node,storage_type,status,used,total,utilization,content,last_synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    for (const storage of snapshot.storage) {
      storageInsert.run(
        connectionId,
        storage.id,
        storage.name,
        storage.node,
        storage.type,
        storage.status,
        storage.used,
        storage.total,
        storage.utilization,
        storage.content,
        snapshot.checkedAt,
      );
    }

    db.prepare(
      `UPDATE proxmox_connections SET version=?,last_checked_at=?,last_success_at=?,last_error=NULL,
      consecutive_failures=0,updated_at=? WHERE id=?`,
    ).run(
      snapshot.version,
      snapshot.checkedAt,
      snapshot.checkedAt,
      snapshot.checkedAt,
      connectionId,
    );
  });
  transaction();
}

function recordFailure(id: string, error: unknown): void {
  const now = new Date().toISOString();
  const message =
    error instanceof Error
      ? error.message.slice(0, 500)
      : "Proxmox synchronization failed.";
  db.prepare(
    `UPDATE proxmox_connections SET last_checked_at=?,last_error=?,
    consecutive_failures=consecutive_failures+1,updated_at=? WHERE id=?`,
  ).run(now, message, now, id);
}

export async function testProxmoxConnection(
  input: ProxmoxConnectionInput,
  existingId?: string,
) {
  const existing = existingId ? getConnectionRow(existingId) : undefined;
  const normalized = validateInput(input, !existing);
  const oldSecret = existing ? readSecret(existing) : null;
  const snapshot = await collectProxmoxSnapshot({
    baseUrl: normalized.baseUrl,
    tokenUser: normalized.tokenUser,
    tokenId: normalized.tokenId,
    tokenSecret: normalized.tokenSecret ?? oldSecret?.tokenSecret ?? "",
    customCa:
      normalized.customCa === undefined
        ? oldSecret?.customCa
        : normalized.customCa,
  });
  return {
    success: true,
    version: snapshot.version,
    nodes: snapshot.nodes.length,
    guests: snapshot.guests.length,
    storage: snapshot.storage.length,
    checkedAt: snapshot.checkedAt,
  };
}

export async function createProxmoxConnection(input: ProxmoxConnectionInput) {
  const normalized = validateInput(input, true);
  const snapshot = await collectProxmoxSnapshot({
    baseUrl: normalized.baseUrl,
    tokenUser: normalized.tokenUser,
    tokenId: normalized.tokenId,
    tokenSecret: normalized.tokenSecret!,
    customCa: normalized.customCa,
  });
  const id = randomUUID();
  const now = new Date().toISOString();
  const encrypted = encryptIntegrationValue(
    JSON.stringify({
      tokenSecret: normalized.tokenSecret,
      customCa: normalized.customCa ?? null,
    }),
  );
  db.prepare(
    `INSERT INTO proxmox_connections
    (id,name,base_url,token_user,token_id,encrypted_secret,secret_iv,secret_tag,enabled,version,last_checked_at,last_success_at,last_error,consecutive_failures,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,0,?,?)`,
  ).run(
    id,
    normalized.name,
    normalized.baseUrl,
    normalized.tokenUser,
    normalized.tokenId,
    encrypted.encrypted,
    encrypted.iv,
    encrypted.tag,
    normalized.enabled === false ? 0 : 1,
    snapshot.version,
    snapshot.checkedAt,
    snapshot.checkedAt,
    now,
    now,
  );
  storeSnapshot(id, snapshot);
  return publicConnection(getConnectionRow(id)!);
}

export async function updateProxmoxConnection(
  id: string,
  input: ProxmoxConnectionInput,
) {
  const existing = getConnectionRow(id);
  if (!existing) throw new Error("Proxmox connection was not found.");
  const normalized = validateInput(input, false);
  const oldSecret = readSecret(existing);
  const nextSecret: StoredSecret = {
    tokenSecret: normalized.tokenSecret ?? oldSecret.tokenSecret,
    customCa:
      normalized.customCa === undefined
        ? oldSecret.customCa
        : normalized.customCa,
  };
  const snapshot = await collectProxmoxSnapshot({
    baseUrl: normalized.baseUrl,
    tokenUser: normalized.tokenUser,
    tokenId: normalized.tokenId,
    ...nextSecret,
  });
  const encrypted = encryptIntegrationValue(JSON.stringify(nextSecret));
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE proxmox_connections SET name=?,base_url=?,token_user=?,token_id=?,encrypted_secret=?,
    secret_iv=?,secret_tag=?,enabled=?,version=?,last_checked_at=?,last_success_at=?,last_error=NULL,
    consecutive_failures=0,updated_at=? WHERE id=?`,
  ).run(
    normalized.name,
    normalized.baseUrl,
    normalized.tokenUser,
    normalized.tokenId,
    encrypted.encrypted,
    encrypted.iv,
    encrypted.tag,
    normalized.enabled === false ? 0 : 1,
    snapshot.version,
    snapshot.checkedAt,
    snapshot.checkedAt,
    now,
    id,
  );
  storeSnapshot(id, snapshot);
  return publicConnection(getConnectionRow(id)!);
}

export function setProxmoxConnectionEnabled(id: string, enabled: boolean) {
  const existing = getConnectionRow(id);
  if (!existing) throw new Error("Proxmox connection was not found.");
  db.prepare(
    "UPDATE proxmox_connections SET enabled=?,updated_at=? WHERE id=?",
  ).run(enabled ? 1 : 0, new Date().toISOString(), id);
  return publicConnection(getConnectionRow(id)!);
}

export function deleteProxmoxConnection(id: string): boolean {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM proxmox_nodes WHERE connection_id = ?").run(id);
    db.prepare("DELETE FROM proxmox_guests WHERE connection_id = ?").run(id);
    db.prepare("DELETE FROM proxmox_storage WHERE connection_id = ?").run(id);
    return (
      db.prepare("DELETE FROM proxmox_connections WHERE id = ?").run(id)
        .changes > 0
    );
  });
  return transaction();
}

export async function syncProxmoxConnection(id: string): Promise<void> {
  const row = getConnectionRow(id);
  if (!row || !row.enabled) return;
  await runWithProxmoxSyncLock(id, async () => {
    try {
      storeSnapshot(id, await collectProxmoxSnapshot(credentials(row)));
    } catch (error) {
      recordFailure(id, error);
      throw error;
    }
  });
}

export async function syncAllProxmoxConnections(): Promise<void> {
  const rows = db
    .prepare("SELECT id FROM proxmox_connections WHERE enabled = 1")
    .all() as { id: string }[];
  await Promise.allSettled(rows.map((row) => syncProxmoxConnection(row.id)));
}

function rowsForConnection(connectionId: string) {
  const nodes = db
    .prepare("SELECT * FROM proxmox_nodes WHERE connection_id=? ORDER BY name")
    .all(connectionId) as Record<string, unknown>[];
  const guests = db
    .prepare(
      "SELECT * FROM proxmox_guests WHERE connection_id=? ORDER BY node,vmid",
    )
    .all(connectionId) as Record<string, unknown>[];
  const storage = db
    .prepare(
      "SELECT * FROM proxmox_storage WHERE connection_id=? ORDER BY node,name",
    )
    .all(connectionId) as Record<string, unknown>[];
  return {
    nodes: nodes.map((row) => ({
      id: row.node_id,
      name: row.name,
      status: row.status,
      uptime: row.uptime,
      cpuUsage: row.cpu_usage,
      memoryUsed: row.memory_used,
      memoryTotal: row.memory_total,
      diskUsed: row.disk_used,
      diskTotal: row.disk_total,
      version: row.pve_version,
      lastSyncedAt: row.last_synced_at,
    })),
    guests: guests.map((row) => ({
      id: row.guest_id,
      type: row.guest_type,
      vmid: row.vmid,
      name: row.name,
      node: row.node,
      status: row.status,
      uptime: row.uptime,
      cpuUsage: row.cpu_usage,
      memoryUsed: row.memory_used,
      memoryTotal: row.memory_total,
      lastSyncedAt: row.last_synced_at,
    })),
    storage: storage.map((row) => ({
      id: row.storage_id,
      name: row.name,
      node: row.node,
      type: row.storage_type,
      status: row.status,
      used: row.used,
      total: row.total,
      utilization: row.utilization,
      content: row.content,
      lastSyncedAt: row.last_synced_at,
    })),
  };
}

export function getProxmoxSnapshot() {
  const rows = db
    .prepare("SELECT * FROM proxmox_connections ORDER BY name COLLATE NOCASE")
    .all() as ConnectionRow[];
  const connections = rows.map((row) => ({
    ...publicConnection(row),
    ...rowsForConnection(row.id),
  }));
  const enabled = connections.filter((connection) => connection.enabled);
  let nodesOnline = 0;
  let nodesTotal = 0;
  let guestsRunning = 0;
  let guestsTotal = 0;
  const storage: Array<{ status: unknown; utilization: unknown }> = [];
  for (const connection of enabled) {
    for (const node of connection.nodes) {
      nodesTotal += 1;
      if (node.status === "online") nodesOnline += 1;
    }
    for (const guest of connection.guests) {
      guestsTotal += 1;
      if (guest.status === "running") guestsRunning += 1;
    }
    storage.push(...connection.storage);
  }
  const storageIssues = summarizeProxmoxStorage(storage);
  return {
    configured: rows.length > 0,
    enabledCount: enabled.length,
    lastCheckedAt:
      enabled
        .map((item) => item.lastCheckedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    summary: {
      connections: enabled.length,
      connectionsAvailable: enabled.filter(
        (item) => item.status === "available",
      ).length,
      nodesOnline,
      nodesTotal,
      guestsRunning,
      guestsTotal,
      storageHealthy: storage.filter(
        (item) => item.status !== "unavailable" && item.status !== "offline",
      ).length,
      storageTotal: storage.length,
      ...storageIssues,
    },
    connections,
  };
}

export function getProxmoxAlerts(): Alert[] {
  const snapshot = getProxmoxSnapshot();
  const alerts: Alert[] = [];
  for (const connection of snapshot.connections.filter(
    (item) => item.enabled,
  )) {
    if (connection.status === "unavailable") {
      alerts.push(
        createAlert(
          `proxmox-connection-${connection.id}`,
          "critical",
          `${connection.name} connection is unavailable`,
          connection.lastError ?? "Proxmox could not be reached.",
          connection.name,
          ["Proxmox API connection failed"],
          "The Proxmox host, network route, TLS trust, or API token may be unavailable.",
          [
            "Verify the Proxmox URL and network path.",
            "Verify the API token still has PVEAuditor access.",
            "Check the configured CA certificate.",
          ],
          connection.lastCheckedAt ?? undefined,
        ),
      );
    }
    for (const node of connection.nodes.filter(
      (item) => item.status !== "online",
    )) {
      alerts.push(
        createAlert(
          `proxmox-node-${connection.id}-${node.id}`,
          "critical",
          `${node.name} is offline`,
          `Proxmox node ${node.name} is reporting ${node.status}.`,
          String(node.name),
          [`node status: ${node.status}`],
          "The node may be powered off, disconnected, or unavailable to the cluster.",
          [
            "Check the node in Proxmox VE.",
            "Verify cluster and network connectivity.",
          ],
          typeof node.lastSyncedAt === "string"
            ? node.lastSyncedAt
            : new Date().toISOString(),
        ),
      );
    }
    for (const item of connection.storage) {
      const percent =
        typeof item.utilization === "number" ? item.utilization * 100 : null;
      if (item.status === "unavailable" || item.status === "offline") {
        alerts.push(
          createAlert(
            `proxmox-storage-offline-${connection.id}-${item.id}`,
            "critical",
            `${item.name} storage is unavailable`,
            `Storage ${item.name} on ${item.node} is ${item.status}.`,
            String(item.name),
            [`storage status: ${item.status}`],
            "The storage backend or its network path may be unavailable.",
            [
              "Check the storage in Proxmox VE.",
              "Verify mounts, network storage, and permissions.",
            ],
            typeof item.lastSyncedAt === "string"
              ? item.lastSyncedAt
              : new Date().toISOString(),
          ),
        );
      } else if (percent !== null && percent >= storageCriticalThreshold()) {
        alerts.push(
          createAlert(
            `proxmox-storage-critical-${connection.id}-${item.id}`,
            "critical",
            `${item.name} storage is critically full`,
            `${percent.toFixed(1)}% of storage is used.`,
            String(item.name),
            [`storage usage: ${percent.toFixed(1)}%`],
            "Storage consumption exceeded the critical threshold.",
            [
              "Free unused data or increase storage capacity.",
              "Review guest disks, backups, and snapshots.",
            ],
            typeof item.lastSyncedAt === "string"
              ? item.lastSyncedAt
              : new Date().toISOString(),
          ),
        );
      } else if (percent !== null && percent >= storageWarningThreshold()) {
        alerts.push(
          createAlert(
            `proxmox-storage-warning-${connection.id}-${item.id}`,
            "warning",
            `${item.name} storage is filling up`,
            `${percent.toFixed(1)}% of storage is used.`,
            String(item.name),
            [`storage usage: ${percent.toFixed(1)}%`],
            "Storage consumption exceeded the warning threshold.",
            ["Review storage growth and available capacity."],
            typeof item.lastSyncedAt === "string"
              ? item.lastSyncedAt
              : new Date().toISOString(),
          ),
        );
      }
    }
  }
  return alerts;
}

export function getDemoProxmoxSnapshot() {
  const checkedAt = new Date().toISOString();
  const connections = [
      {
        id: "demo-pve-main",
        name: "Primary cluster",
        baseUrl: "https://pve.demo.invalid:8006",
        tokenUser: "nodeguard@pve",
        tokenId: "monitor",
        hasToken: true,
        hasCustomCa: true,
        enabled: true,
        version: "8.4.1",
        status: "available",
        lastCheckedAt: checkedAt,
        lastSuccessAt: checkedAt,
        lastError: null,
        consecutiveFailures: 0,
        createdAt: checkedAt,
        updatedAt: checkedAt,
        nodes: [
          {
            id: "node/pve-a",
            name: "pve-a",
            status: "online",
            uptime: 1849200,
            cpuUsage: 0.21,
            memoryUsed: 34359738368,
            memoryTotal: 68719476736,
            diskUsed: 164926744166,
            diskTotal: 536870912000,
            version: "8.4.1",
            lastSyncedAt: checkedAt,
          },
          {
            id: "node/pve-b",
            name: "pve-b",
            status: "online",
            uptime: 932400,
            cpuUsage: 0.37,
            memoryUsed: 51539607552,
            memoryTotal: 68719476736,
            diskUsed: 274877906944,
            diskTotal: 536870912000,
            version: "8.4.1",
            lastSyncedAt: checkedAt,
          },
          {
            id: "node/pve-c",
            name: "pve-c",
            status: "online",
            uptime: 481200,
            cpuUsage: 0.14,
            memoryUsed: 17179869184,
            memoryTotal: 68719476736,
            diskUsed: 128849018880,
            diskTotal: 536870912000,
            version: "8.4.1",
            lastSyncedAt: checkedAt,
          },
        ],
        guests: [
          {
            id: "qemu/101",
            type: "qemu",
            vmid: 101,
            name: "app-core",
            node: "pve-a",
            status: "running",
            uptime: 604800,
            cpuUsage: 0.18,
            memoryUsed: 8589934592,
            memoryTotal: 17179869184,
            lastSyncedAt: checkedAt,
          },
          {
            id: "qemu/102",
            type: "qemu",
            vmid: 102,
            name: "photos",
            node: "pve-b",
            status: "running",
            uptime: 432000,
            cpuUsage: 0.42,
            memoryUsed: 12884901888,
            memoryTotal: 17179869184,
            lastSyncedAt: checkedAt,
          },
          {
            id: "lxc/201",
            type: "lxc",
            vmid: 201,
            name: "dns-edge",
            node: "pve-a",
            status: "running",
            uptime: 1209600,
            cpuUsage: 0.04,
            memoryUsed: 1073741824,
            memoryTotal: 2147483648,
            lastSyncedAt: checkedAt,
          },
          {
            id: "lxc/202",
            type: "lxc",
            vmid: 202,
            name: "backup-index",
            node: "pve-c",
            status: "stopped",
            uptime: 0,
            cpuUsage: 0,
            memoryUsed: 0,
            memoryTotal: 4294967296,
            lastSyncedAt: checkedAt,
          },
        ],
        storage: [
          {
            id: "storage/pve-a/local-zfs",
            name: "local-zfs",
            node: "pve-a",
            type: "zfspool",
            status: "available",
            used: 1099511627776,
            total: 2199023255552,
            utilization: 0.5,
            content: "images,rootdir",
            lastSyncedAt: checkedAt,
          },
          {
            id: "storage/pve-b/vm-data",
            name: "vm-data",
            node: "pve-b",
            type: "lvmthin",
            status: "available",
            used: 1649267441664,
            total: 2199023255552,
            utilization: 0.75,
            content: "images,rootdir",
            lastSyncedAt: checkedAt,
          },
          {
            id: "storage/pve-c/backups",
            name: "backups",
            node: "pve-c",
            type: "nfs",
            status: "available",
            used: 3298534883328,
            total: 4398046511104,
            utilization: 0.75,
            content: "backup,iso",
            lastSyncedAt: checkedAt,
          },
        ],
      },
      {
        id: "demo-pve-lab",
        name: "Lab node",
        baseUrl: "https://lab-pve.demo.invalid:8006",
        tokenUser: "nodeguard@pve",
        tokenId: "monitor",
        hasToken: true,
        hasCustomCa: false,
        enabled: true,
        version: "8.3.5",
        status: "unavailable",
        lastCheckedAt: checkedAt,
        lastSuccessAt: new Date(Date.now() - 900000).toISOString(),
        lastError: "Connection timed out.",
        consecutiveFailures: 3,
        createdAt: checkedAt,
        updatedAt: checkedAt,
        nodes: [
          {
            id: "node/lab-pve",
            name: "lab-pve",
            status: "offline",
            uptime: 0,
            cpuUsage: null,
            memoryUsed: null,
            memoryTotal: 34359738368,
            diskUsed: null,
            diskTotal: 536870912000,
            version: "8.3.5",
            lastSyncedAt: new Date(Date.now() - 900000).toISOString(),
          },
        ],
        guests: [],
        storage: [
          {
            id: "storage/lab-pve/local",
            name: "local",
            node: "lab-pve",
            type: "dir",
            status: "unavailable",
            used: 420906795008,
            total: 536870912000,
            utilization: 0.784,
            content: "backup,iso,vztmpl",
            lastSyncedAt: new Date(Date.now() - 900000).toISOString(),
          },
        ],
      },
    ];
  const enabled = connections.filter((connection) => connection.enabled);
  let nodesOnline = 0;
  let nodesTotal = 0;
  let guestsRunning = 0;
  let guestsTotal = 0;
  const storage: Array<{ status: unknown; utilization: unknown }> = [];
  for (const connection of enabled) {
    for (const node of connection.nodes) {
      nodesTotal += 1;
      if (node.status === "online") nodesOnline += 1;
    }
    for (const guest of connection.guests) {
      guestsTotal += 1;
      if (guest.status === "running") guestsRunning += 1;
    }
    storage.push(...connection.storage);
  }

  return {
    configured: true,
    demoMode: true,
    enabledCount: enabled.length,
    lastCheckedAt: checkedAt,
    summary: {
      connections: enabled.length,
      connectionsAvailable: enabled.filter(
        (connection) => connection.status === "available",
      ).length,
      nodesOnline,
      nodesTotal,
      guestsRunning,
      guestsTotal,
      storageHealthy: storage.filter(
        (item) => item.status !== "unavailable" && item.status !== "offline",
      ).length,
      storageTotal: storage.length,
      ...summarizeProxmoxStorage(storage),
    },
    connections,
  };
}

export function startProxmoxSyncScheduler(): void {
  if (scheduler) return;
  console.log(
    "Proxmox sync scheduler started with a " +
      env.proxmoxSyncIntervalSeconds +
      "s interval.",
  );
  void syncAllProxmoxConnections();
  scheduler = setInterval(
    () => void syncAllProxmoxConnections(),
    syncIntervalMs(),
  );
  scheduler.unref();
}
