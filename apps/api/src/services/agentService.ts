import crypto from "node:crypto";

import { env } from "../config/env.js";
import type { AgentContainerInput, AgentDetail, AgentDockerInput, AgentEnrollmentProgress, AgentEnrollmentToken, AgentHeartbeatInput, AgentInventoryInput, AgentMetricSampleInput, AgentMetricsInput, AgentRegistrationInput, AgentRegistrationResponse, AgentStatus, AgentSummary, Container, ContainerHealth, ContainerStatus, DockerSnapshot, MetricSnapshot, Server } from "../types/nodeguard.js";
import { getDatabase } from "./database.js";
import { recordMetricSnapshot } from "./metricHistoryService.js";

type AgentRow = {
  id: string;
  display_name: string;
  hostname: string;
  status: AgentStatus;
  agent_version: string;
  os_name: string | null;
  os_version: string | null;
  kernel: string | null;
  architecture: string | null;
  cpu_model: string | null;
  physical_core_count: number | null;
  logical_cpu_count: number | null;
  total_memory_bytes: number | null;
  total_swap_bytes: number | null;
  filesystems_json: string;
  ip_addresses_json: string;
  boot_time: string | null;
  system_uptime_seconds: number | null;
  docker_available: number;
  docker_version: string | null;
  docker_inventory_hash: string | null;
  credential_hash: string;
  registered_at: string;
  last_seen_at: string | null;
  last_metrics_at: string | null;
  last_inventory_at: string | null;
  last_docker_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type EnrollmentRow = {
  id: string;
  token_hash: string;
  purpose: "enroll" | "rotate";
  agent_id: string | null;
  display_name: string | null;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type MetricRow = {
  cpu_usage_percent: number | null;
  memory_used_bytes: number | null;
  memory_total_bytes: number | null;
  memory_usage_percent: number | null;
  disk_used_bytes: number | null;
  disk_total_bytes: number | null;
  disk_usage_percent: number | null;
  swap_used_bytes: number | null;
  swap_total_bytes: number | null;
  swap_usage_percent: number | null;
  load_average_1: number | null;
  load_average_5: number | null;
  load_average_15: number | null;
  system_uptime_seconds: number | null;
  sampled_at: string;
};

type ContainerRow = {
  agent_id: string;
  container_id: string;
  name: string;
  image: string;
  runtime_state: string;
  health: ContainerHealth;
  created_at: string | null;
  started_at: string | null;
  uptime_seconds: number | null;
  restart_count: number | null;
  stack: string | null;
  ip_addresses_json: string;
  networks_json: string;
  published_ports_json: string;
  container_ports_json: string;
  labels_json: string;
  cpu_percent: number | null;
  memory_used_bytes: number | null;
  memory_limit_bytes: number | null;
  reported_at: string;
};

export class AgentServiceError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const database = getDatabase();

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function hashSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function secretsMatch(value: string, expectedHash: string) {
  const actual = Buffer.from(hashSecret(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function bytesToGb(value: number | null) {
  return value === null ? null : Number((value / 1024 / 1024 / 1024).toFixed(1));
}

function bytesToMb(value: number | null) {
  return value === null ? null : Math.round(value / 1024 / 1024);
}

function latestMetric(agentId: string) {
  return database.prepare("SELECT * FROM agent_metrics WHERE agent_id = ? ORDER BY sampled_at DESC LIMIT 1").get(agentId) as MetricRow | undefined;
}

function containerCount(agentId: string) {
  return (database.prepare("SELECT COUNT(*) AS count FROM agent_containers WHERE agent_id = ?").get(agentId) as { count: number }).count;
}

export function calculateAgentStatus(lastSeenAt: string | null, revokedAt: string | null, now = Date.now()): AgentStatus {
  if (revokedAt) return "revoked";
  if (!lastSeenAt) return "offline";
  const lastSeen = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeen)) return "offline";
  const ageSeconds = Math.max(0, (now - lastSeen) / 1000);
  if (ageSeconds <= env.agentStaleAfterSeconds) return "online";
  if (ageSeconds <= env.agentOfflineAfterSeconds) return "stale";
  return "offline";
}

function refreshRowStatus(row: AgentRow, now = Date.now()) {
  const status = calculateAgentStatus(row.last_seen_at, row.revoked_at, now);
  if (status !== row.status) {
    database.prepare("UPDATE agents SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(now), row.id);
  }
  return { ...row, status };
}

function rowToSummary(rawRow: AgentRow): AgentSummary {
  const row = refreshRowStatus(rawRow);
  const metric = latestMetric(row.id);
  return {
    id: row.id,
    displayName: row.display_name,
    hostname: row.hostname,
    status: row.status,
    agentVersion: row.agent_version,
    osName: row.os_name,
    osVersion: row.os_version,
    kernel: row.kernel,
    architecture: row.architecture,
    cpuUsagePercent: metric?.cpu_usage_percent ?? null,
    memoryUsagePercent: metric?.memory_usage_percent ?? null,
    diskUsagePercent: metric?.disk_usage_percent ?? null,
    swapUsagePercent: metric?.swap_usage_percent ?? null,
    dockerAvailable: Boolean(row.docker_available),
    dockerVersion: row.docker_version,
    containerCount: containerCount(row.id),
    registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at,
    lastMetricsAt: row.last_metrics_at,
    lastInventoryAt: row.last_inventory_at,
    lastDockerAt: row.last_docker_at,
    credentialStatus: row.revoked_at ? "revoked" : "active"
  };
}

function enrollmentToPublic(row: EnrollmentRow): AgentEnrollmentToken {
  return {
    id: row.id,
    displayName: row.display_name,
    purpose: row.purpose,
    agentId: row.agent_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at
  };
}

export function cleanupEnrollmentTokens(now = Date.now()) {
  database.prepare("DELETE FROM agent_enrollment_tokens WHERE (expires_at < ? OR used_at IS NOT NULL OR revoked_at IS NOT NULL) AND created_at < ?")
    .run(nowIso(now), nowIso(now - 24 * 60 * 60 * 1000));
}

export function createAgentEnrollmentToken(displayName?: string, purpose: "enroll" | "rotate" = "enroll", agentId: string | null = null) {
  if (purpose === "rotate") {
    const agent = agentId ? getAgentRow(agentId) : null;
    if (!agent || agent.revoked_at) throw new AgentServiceError("agent_not_found", "Active agent not found.", 404);
  }
  cleanupEnrollmentTokens();
  const rawToken = `${purpose === "rotate" ? "ng_rotate" : "ng_join"}_${crypto.randomBytes(32).toString("base64url")}`;
  const timestamp = nowIso();
  const row: EnrollmentRow = {
    id: crypto.randomUUID(),
    token_hash: hashSecret(rawToken),
    purpose,
    agent_id: agentId,
    display_name: displayName?.trim().slice(0, 120) || null,
    expires_at: nowIso(Date.now() + env.agentEnrollmentTtlMinutes * 60 * 1000),
    used_at: null,
    revoked_at: null,
    created_at: timestamp
  };
  database.prepare(`
    INSERT INTO agent_enrollment_tokens (id, token_hash, purpose, agent_id, display_name, expires_at, used_at, revoked_at, created_at)
    VALUES (@id, @token_hash, @purpose, @agent_id, @display_name, @expires_at, NULL, NULL, @created_at)
  `).run(row);
  return { ...enrollmentToPublic(row), token: rawToken };
}

export function listActiveEnrollmentTokens() {
  cleanupEnrollmentTokens();
  return (database.prepare(`
    SELECT * FROM agent_enrollment_tokens
    WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC
  `).all(nowIso()) as EnrollmentRow[]).map(enrollmentToPublic);
}

export function getAgentEnrollmentProgress(id: string): AgentEnrollmentProgress | null {
  const enrollment = database.prepare("SELECT * FROM agent_enrollment_tokens WHERE id = ?").get(id) as EnrollmentRow | undefined;
  if (!enrollment) return null;

  const agent = enrollment.agent_id ? getAgentRow(enrollment.agent_id) : undefined;
  const publicAgent = agent ? {
    id: agent.id,
    displayName: agent.display_name,
    status: calculateAgentStatus(agent.last_seen_at, agent.revoked_at),
    lastSeenAt: agent.last_seen_at
  } : null;

  let state: AgentEnrollmentProgress["state"] = "waiting";
  if (enrollment.revoked_at) state = "revoked";
  else if (!enrollment.used_at && Date.parse(enrollment.expires_at) <= Date.now()) state = "expired";
  else if (enrollment.used_at && publicAgent?.status === "online") state = "online";
  else if (enrollment.used_at && publicAgent?.lastSeenAt) state = "connected";
  else if (enrollment.used_at) state = "registered";

  return {
    id: enrollment.id,
    purpose: enrollment.purpose,
    displayName: enrollment.display_name,
    expiresAt: enrollment.expires_at,
    state,
    agent: publicAgent
  };
}

export function revokeEnrollmentToken(id: string) {
  const result = database.prepare(`
    UPDATE agent_enrollment_tokens SET revoked_at = ?
    WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
  `).run(nowIso(), id);
  return { revoked: result.changes > 0 };
}

function getAgentRow(id: string) {
  return database.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
}

export function registerAgent(input: AgentRegistrationInput): AgentRegistrationResponse {
  const tokenHash = hashSecret(input.enrollmentToken);
  const enrollment = database.prepare("SELECT * FROM agent_enrollment_tokens WHERE token_hash = ?").get(tokenHash) as EnrollmentRow | undefined;
  if (!enrollment || enrollment.used_at || enrollment.revoked_at || Date.parse(enrollment.expires_at) <= Date.now()) {
    throw new AgentServiceError("invalid_enrollment_token", "Enrollment token is invalid, expired, revoked, or already used.", 401);
  }

  const credential = `ng_agent_${crypto.randomBytes(32).toString("base64url")}`;
  const credentialHash = hashSecret(credential);
  const timestamp = nowIso();
  const agentId = enrollment.purpose === "rotate" && enrollment.agent_id ? enrollment.agent_id : crypto.randomUUID();
  const existing = enrollment.purpose === "rotate" ? getAgentRow(agentId) : undefined;
  if (enrollment.purpose === "rotate" && (!existing || existing.revoked_at)) {
    throw new AgentServiceError("agent_not_found", "The agent for this rotation token is no longer active.", 404);
  }
  const displayName = enrollment.display_name ?? input.displayName?.trim() ?? existing?.display_name ?? input.hostname;

  const consume = database.transaction(() => {
    const claimed = database.prepare(`
      UPDATE agent_enrollment_tokens SET used_at = ?
      WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
    `).run(timestamp, enrollment.id, timestamp);
    if (claimed.changes !== 1) throw new AgentServiceError("invalid_enrollment_token", "Enrollment token was already used.", 401);

    if (existing) {
      database.prepare(`
        UPDATE agents SET display_name = ?, hostname = ?, agent_version = ?, os_name = ?, os_version = ?, kernel = ?,
          architecture = ?, credential_hash = ?, status = 'online', last_seen_at = ?, updated_at = ?
        WHERE id = ?
      `).run(displayName, input.hostname, input.agentVersion, input.osName ?? existing.os_name, input.osVersion ?? existing.os_version,
        input.kernel ?? existing.kernel, input.architecture ?? existing.architecture, credentialHash, timestamp, timestamp, agentId);
    } else {
      database.prepare(`
        INSERT INTO agents (
          id, display_name, hostname, status, agent_version, os_name, os_version, kernel, architecture,
          credential_hash, registered_at, last_seen_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'offline', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `).run(agentId, displayName, input.hostname, input.agentVersion, input.osName ?? null, input.osVersion ?? null,
        input.kernel ?? null, input.architecture ?? null, credentialHash, timestamp, timestamp, timestamp);
    }

    database.prepare("UPDATE agent_enrollment_tokens SET agent_id = ? WHERE id = ?").run(agentId, enrollment.id);
  });
  consume();

  return {
    agentId,
    credential,
    displayName,
    heartbeatIntervalSeconds: env.agentHeartbeatIntervalSeconds,
    metricsIntervalSeconds: env.agentMetricsIntervalSeconds,
    dockerIntervalSeconds: env.agentDockerIntervalSeconds,
    inventoryIntervalSeconds: env.agentInventoryIntervalSeconds
  };
}

export function authenticateAgent(agentId: string, credential: string) {
  const row = getAgentRow(agentId);
  if (!row || !credential || !secretsMatch(credential, row.credential_hash)) return null;
  if (row.revoked_at) throw new AgentServiceError("agent_revoked", "Agent credential has been revoked.", 403);
  return { id: row.id, displayName: row.display_name };
}

export function recordAgentHeartbeat(agentId: string, input: AgentHeartbeatInput) {
  if (input.agentId && input.agentId !== agentId) throw new AgentServiceError("agent_id_mismatch", "Payload agentId does not match the authenticated agent.", 400);
  const timestamp = nowIso();
  const result = database.prepare(`
    UPDATE agents SET status = 'online', agent_version = ?, last_seen_at = ?, updated_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(input.agentVersion, timestamp, timestamp, agentId);
  if (result.changes !== 1) throw new AgentServiceError("agent_not_found", "Agent not found.", 404);
  return { ok: true, receivedAt: timestamp };
}

export function recordAgentInventory(agentId: string, input: AgentInventoryInput) {
  const timestamp = nowIso();
  const result = database.prepare(`
    UPDATE agents SET hostname = ?, agent_version = ?, os_name = ?, os_version = ?, kernel = ?, architecture = ?,
      cpu_model = ?, physical_core_count = ?, logical_cpu_count = ?, total_memory_bytes = ?, total_swap_bytes = ?,
      filesystems_json = ?, ip_addresses_json = ?, boot_time = ?, system_uptime_seconds = ?, last_inventory_at = ?, updated_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(input.hostname, input.agentVersion, input.osName ?? null, input.osVersion ?? null, input.kernel ?? null,
    input.architecture ?? null, input.cpuModel ?? null, input.physicalCoreCount ?? null, input.logicalCpuCount ?? null,
    input.totalMemoryBytes ?? null, input.totalSwapBytes ?? null, JSON.stringify(input.filesystems ?? []),
    JSON.stringify(input.ipAddresses ?? []), input.bootTime ?? null, input.systemUptimeSeconds ?? null, timestamp, timestamp, agentId);
  if (result.changes !== 1) throw new AgentServiceError("agent_not_found", "Agent not found.", 404);
  return { ok: true, receivedAt: timestamp };
}

function metricToSnapshot(agentId: string, sample: AgentMetricSampleInput): MetricSnapshot {
  return {
    serverId: agentId,
    cpu: { usagePercent: sample.cpuUsagePercent, loadAverage: sample.loadAverage1, loadAverage5: sample.loadAverage5, loadAverage15: sample.loadAverage15 },
    memory: { usedGb: bytesToGb(sample.memoryUsedBytes), totalGb: bytesToGb(sample.memoryTotalBytes), usagePercent: sample.memoryUsagePercent },
    disk: { usedGb: bytesToGb(sample.diskUsedBytes), totalGb: bytesToGb(sample.diskTotalBytes), usagePercent: sample.diskUsagePercent },
    swap: { usedGb: bytesToGb(sample.swapUsedBytes), totalGb: bytesToGb(sample.swapTotalBytes), usagePercent: sample.swapUsagePercent },
    network: { downloadMbps: null, uploadMbps: null },
    uptimeSeconds: sample.systemUptimeSeconds,
    createdAt: sample.timestamp
  };
}

export function recordAgentMetrics(agentId: string, input: AgentMetricsInput) {
  const insert = database.prepare(`
    INSERT INTO agent_metrics (
      agent_id, sample_epoch, cpu_usage_percent, memory_used_bytes, memory_total_bytes, memory_usage_percent,
      disk_used_bytes, disk_total_bytes, disk_usage_percent, swap_used_bytes, swap_total_bytes, swap_usage_percent,
      load_average_1, load_average_5, load_average_15, system_uptime_seconds, sampled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id, sample_epoch) DO UPDATE SET
      cpu_usage_percent = excluded.cpu_usage_percent, memory_used_bytes = excluded.memory_used_bytes,
      memory_total_bytes = excluded.memory_total_bytes, memory_usage_percent = excluded.memory_usage_percent,
      disk_used_bytes = excluded.disk_used_bytes, disk_total_bytes = excluded.disk_total_bytes,
      disk_usage_percent = excluded.disk_usage_percent, swap_used_bytes = excluded.swap_used_bytes,
      swap_total_bytes = excluded.swap_total_bytes, swap_usage_percent = excluded.swap_usage_percent,
      load_average_1 = excluded.load_average_1, load_average_5 = excluded.load_average_5,
      load_average_15 = excluded.load_average_15, system_uptime_seconds = excluded.system_uptime_seconds,
      sampled_at = excluded.sampled_at
  `);
  const write = database.transaction((samples: AgentMetricSampleInput[]) => {
    for (const sample of samples) {
      insert.run(agentId, Math.floor(Date.parse(sample.timestamp) / 1000), sample.cpuUsagePercent, sample.memoryUsedBytes,
        sample.memoryTotalBytes, sample.memoryUsagePercent, sample.diskUsedBytes, sample.diskTotalBytes,
        sample.diskUsagePercent, sample.swapUsedBytes, sample.swapTotalBytes, sample.swapUsagePercent,
        sample.loadAverage1, sample.loadAverage5, sample.loadAverage15, sample.systemUptimeSeconds, sample.timestamp);
      recordMetricSnapshot(metricToSnapshot(agentId, sample));
    }
    const latest = samples.reduce((left, right) => left.timestamp > right.timestamp ? left : right);
    database.prepare("UPDATE agents SET last_metrics_at = ?, system_uptime_seconds = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(latest.timestamp, latest.systemUptimeSeconds, nowIso(), agentId);
  });
  write(input.samples);
  return { ok: true, accepted: input.samples.length };
}

function writeContainer(agentId: string, input: AgentContainerInput, reportedAt: string) {
  database.prepare(`
    INSERT INTO agent_containers (
      agent_id, container_id, name, image, runtime_state, health, created_at, started_at, uptime_seconds,
      restart_count, stack, ip_addresses_json, networks_json, published_ports_json, container_ports_json,
      labels_json, cpu_percent, memory_used_bytes, memory_limit_bytes, reported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(agentId, input.id, input.name, input.image, input.runtimeState, input.health, input.createdAt, input.startedAt,
    input.uptimeSeconds, input.restartCount, input.stack, JSON.stringify(input.ipAddresses), JSON.stringify(input.networks),
    JSON.stringify(input.publishedPorts), JSON.stringify(input.containerPorts), JSON.stringify(input.labels),
    input.cpuPercent, input.memoryUsedBytes, input.memoryLimitBytes, reportedAt);
}

export function recordAgentDocker(agentId: string, input: AgentDockerInput) {
  const timestamp = nowIso();
  const write = database.transaction(() => {
    database.prepare("DELETE FROM agent_containers WHERE agent_id = ?").run(agentId);
    if (input.available) {
      for (const container of input.containers) writeContainer(agentId, container, input.timestamp);
    }
    const result = database.prepare(`
      UPDATE agents SET docker_available = ?, docker_version = ?, docker_inventory_hash = ?, last_docker_at = ?, updated_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(input.available ? 1 : 0, input.version, input.inventoryHash, timestamp, timestamp, agentId);
    if (result.changes !== 1) throw new AgentServiceError("agent_not_found", "Agent not found.", 404);
  });
  write();
  return { ok: true, accepted: input.available ? input.containers.length : 0 };
}

function normalizeContainerStatus(value: string): ContainerStatus {
  const status = value.toLowerCase();
  if (status.includes("running")) return "running";
  if (status.includes("restarting")) return "restarting";
  if (status.includes("exited") || status.includes("dead")) return "exited";
  return "stopped";
}

function uptimeText(seconds: number | null, state: string) {
  if (seconds === null || normalizeContainerStatus(state) !== "running") return state;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function rowToContainer(row: ContainerRow, agent: Pick<AgentRow, "id" | "display_name">): Container {
  const ipAddresses = parseJson<string[]>(row.ip_addresses_json, []);
  const networks = parseJson<string[]>(row.networks_json, []);
  const ports = parseJson<string[]>(row.container_ports_json, []);
  const publishedPorts = parseJson<string[]>(row.published_ports_json, []);
  return {
    id: row.container_id,
    serverId: agent.id,
    hostName: agent.display_name,
    name: row.name,
    image: row.image,
    stack: row.stack,
    ipAddress: ipAddresses[0] ?? null,
    ipAddresses,
    networks,
    status: normalizeContainerStatus(row.runtime_state),
    state: row.runtime_state,
    health: row.health,
    uptime: uptimeText(row.uptime_seconds, row.runtime_state),
    uptimeSeconds: row.uptime_seconds,
    cpuPercent: row.cpu_percent,
    memoryMb: bytesToMb(row.memory_used_bytes),
    memoryLimitMb: bytesToMb(row.memory_limit_bytes),
    ports,
    publishedPorts,
    restartPolicy: null,
    restartCount: row.restart_count,
    startedAt: row.started_at,
    logs: []
  };
}

export function listAgentContainers(agentId?: string) {
  const rows = database.prepare(`
    SELECT agent_containers.*, agents.display_name, agents.id AS host_id
    FROM agent_containers JOIN agents ON agents.id = agent_containers.agent_id
    WHERE agents.revoked_at IS NULL ${agentId ? "AND agents.id = ?" : ""}
    ORDER BY agents.display_name, agent_containers.name
  `).all(...(agentId ? [agentId] : [])) as Array<ContainerRow & { display_name: string; host_id: string }>;
  return rows.map((row) => rowToContainer(row, { id: row.host_id, display_name: row.display_name }));
}

function metricRowToSnapshot(agentId: string, row?: MetricRow): MetricSnapshot | null {
  if (!row) return null;
  return {
    serverId: agentId,
    cpu: { usagePercent: row.cpu_usage_percent, loadAverage: row.load_average_1, loadAverage5: row.load_average_5, loadAverage15: row.load_average_15 },
    memory: { usedGb: bytesToGb(row.memory_used_bytes), totalGb: bytesToGb(row.memory_total_bytes), usagePercent: row.memory_usage_percent },
    disk: { usedGb: bytesToGb(row.disk_used_bytes), totalGb: bytesToGb(row.disk_total_bytes), usagePercent: row.disk_usage_percent },
    swap: { usedGb: bytesToGb(row.swap_used_bytes), totalGb: bytesToGb(row.swap_total_bytes), usagePercent: row.swap_usage_percent },
    network: { downloadMbps: null, uploadMbps: null },
    uptimeSeconds: row.system_uptime_seconds,
    createdAt: row.sampled_at
  };
}

export function getAgentMetricSnapshot(agentId: string) {
  return metricRowToSnapshot(agentId, latestMetric(agentId));
}

export function listAgents(): AgentSummary[] {
  return (database.prepare("SELECT * FROM agents ORDER BY display_name COLLATE NOCASE").all() as AgentRow[]).map(rowToSummary);
}

export function getAgent(agentId: string): AgentDetail | null {
  const row = getAgentRow(agentId);
  if (!row) return null;
  return {
    ...rowToSummary(row),
    cpuModel: row.cpu_model,
    physicalCoreCount: row.physical_core_count,
    logicalCpuCount: row.logical_cpu_count,
    totalMemoryBytes: row.total_memory_bytes,
    totalSwapBytes: row.total_swap_bytes,
    filesystems: parseJson(row.filesystems_json, []),
    ipAddresses: parseJson(row.ip_addresses_json, []),
    bootTime: row.boot_time,
    systemUptimeSeconds: row.system_uptime_seconds,
    latestMetrics: getAgentMetricSnapshot(row.id),
    containers: listAgentContainers(row.id)
  };
}

export function renameAgent(agentId: string, displayName: string) {
  const name = displayName.trim();
  if (!name || name.length > 120) throw new AgentServiceError("invalid_display_name", "Display name must be between 1 and 120 characters.");
  const result = database.prepare("UPDATE agents SET display_name = ?, updated_at = ? WHERE id = ?").run(name, nowIso(), agentId);
  if (result.changes !== 1) throw new AgentServiceError("agent_not_found", "Agent not found.", 404);
  return getAgent(agentId);
}

export function revokeAgent(agentId: string) {
  const timestamp = nowIso();
  const revoke = database.transaction(() => {
    const result = database.prepare("UPDATE agents SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(timestamp, timestamp, agentId);
    database.prepare("UPDATE agent_enrollment_tokens SET revoked_at = ? WHERE agent_id = ? AND used_at IS NULL AND revoked_at IS NULL")
      .run(timestamp, agentId);
    return result.changes > 0;
  });
  return { revoked: revoke() };
}

export function deleteAgent(agentId: string) {
  const remove = database.transaction(() => {
    const agent = getAgentRow(agentId);
    if (!agent) throw new AgentServiceError("agent_not_found", "Agent not found.", 404);

    const timestamp = nowIso();
    const invalidCredentialHash = hashSecret(`deleted-${crypto.randomBytes(32).toString("base64url")}`);
    const invalidated = database.prepare(`
      UPDATE agents
      SET status = 'revoked', revoked_at = COALESCE(revoked_at, ?), credential_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(timestamp, invalidCredentialHash, timestamp, agentId);
    if (invalidated.changes !== 1) throw new AgentServiceError("agent_not_found", "Agent not found.", 404);

    database.prepare("DELETE FROM metric_history WHERE server_id = ?").run(agentId);
    database.prepare("DELETE FROM alert_history WHERE id LIKE ? OR id LIKE ?")
      .run(`agent-${agentId}-%`, `agent-container-${agentId}-%`);
    database.prepare("DELETE FROM alert_deletions WHERE id LIKE ? OR id LIKE ?")
      .run(`agent-${agentId}-%`, `agent-container-${agentId}-%`);

    const deleted = database.prepare("DELETE FROM agents WHERE id = ?").run(agentId);
    if (deleted.changes !== 1) throw new AgentServiceError("agent_not_found", "Agent not found.", 404);
    return { deleted: true as const };
  });

  return remove();
}

export function listAgentServers(): Server[] {
  return (database.prepare("SELECT * FROM agents WHERE revoked_at IS NULL ORDER BY display_name COLLATE NOCASE").all() as AgentRow[])
    .map((row) => agentRowToServer(row));
}

function agentRowToServer(rawRow: AgentRow): Server {
  const row = refreshRowStatus(rawRow);
  const metric = getAgentMetricSnapshot(row.id);
  const containers = listAgentContainers(row.id);
  return {
    id: row.id,
    name: row.display_name,
    hostname: row.hostname,
    status: row.status === "online" ? "healthy" : row.status === "stale" ? "warning" : "offline",
    agentStatus: row.status,
    source: "agent",
    os: [row.os_name, row.os_version].filter(Boolean).join(" ") || null,
    kernel: row.kernel,
    architecture: row.architecture,
    platform: "linux",
    cpuManufacturer: null,
    cpuModel: row.cpu_model,
    cpuCores: row.logical_cpu_count,
    cpuPhysicalCores: row.physical_core_count,
    cpuSpeedGhz: null,
    totalMemoryGb: metric?.memory.totalGb ?? bytesToGb(row.total_memory_bytes),
    totalDiskGb: metric?.disk.totalGb ?? null,
    swapTotalGb: metric?.swap.totalGb ?? bytesToGb(row.total_swap_bytes),
    primaryIp: parseJson<string[]>(row.ip_addresses_json, [])[0] ?? null,
    ipAddresses: parseJson(row.ip_addresses_json, []),
    uptimeSeconds: metric?.uptimeSeconds ?? row.system_uptime_seconds,
    lastCheckedAt: row.last_seen_at ?? row.registered_at,
    dockerVersion: row.docker_version,
    dockerAvailable: Boolean(row.docker_available),
    runningContainers: containers.filter((container) => container.status === "running").length,
    stoppedContainers: containers.filter((container) => container.status !== "running").length
  };
}

export function getAgentServer(agentId: string) {
  const row = getAgentRow(agentId);
  return row && !row.revoked_at ? agentRowToServer(row) : null;
}

export function getAgentDockerSnapshot(agentId: string): DockerSnapshot | null {
  const row = getAgentRow(agentId);
  if (!row || row.revoked_at) return null;
  return {
    dockerAvailable: Boolean(row.docker_available),
    dockerVersion: row.docker_version,
    containers: listAgentContainers(agentId),
    containerMonitors: [],
    ...(!row.docker_available ? { message: "Docker is unavailable or inaccessible on this agent host." } : {})
  };
}

export function getAgentStatusPayload(agentId: string) {
  const agent = getAgent(agentId);
  if (!agent) throw new AgentServiceError("agent_not_found", "Agent not found.", 404);
  return {
    id: agent.id,
    displayName: agent.displayName,
    hostname: agent.hostname,
    status: agent.status,
    lastSeenAt: agent.lastSeenAt,
    credentialStatus: agent.credentialStatus
  };
}
