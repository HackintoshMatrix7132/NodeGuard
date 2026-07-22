import { env } from "../config/env.js";
import {
  AGENT_UPDATE_ALLOWED_ERROR_CODES_BY_STATUS,
  AGENT_UPDATE_ERROR_CODES,
  AGENT_UPDATE_PROVIDER,
  AGENT_UPDATE_SCHEMA_VERSION,
  AGENT_UPDATE_STATUSES
} from "../generated/agentContract.js";
import type { AgentUpdateErrorCode } from "../types/nodeguard.js";
import type { AgentContainerInput, AgentDockerInput, AgentFilesystem, AgentHeartbeatInput, AgentInventoryInput, AgentMetricSampleInput, AgentMetricsInput, AgentPackageUpdateInput, AgentRegistrationInput, AgentUpdateCheckStatus, AgentUpdateInventoryInput, ContainerHealth } from "../types/nodeguard.js";

export class AgentPayloadError extends Error {
  readonly code = "invalid_agent_payload";
}

export const agentUpdatePackageLimit = 500;

function record(value: unknown, label = "Payload") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentPayloadError(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, maxLength = 255) {
  if (typeof value !== "string" || !value.trim()) throw new AgentPayloadError(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AgentPayloadError(`${label} is too long.`);
  return normalized;
}

function optionalString(value: unknown, label: string, maxLength = 255) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new AgentPayloadError(`${label} must be a string or null.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AgentPayloadError(`${label} is too long.`);
  return normalized || null;
}

function optionalNumber(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new AgentPayloadError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function optionalInteger(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = optionalNumber(value, label, minimum, maximum);
  if (parsed !== null && !Number.isInteger(parsed)) throw new AgentPayloadError(`${label} must be an integer.`);
  return parsed;
}

function requiredInteger(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = optionalInteger(value, label, minimum, maximum);
  if (parsed === null) throw new AgentPayloadError(`${label} is required.`);
  return parsed;
}

function requiredBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new AgentPayloadError(`${label} must be a boolean.`);
  return value;
}

function optionalBoolean(value: unknown, label: string) {
  if (value === undefined || value === null) return null;
  return requiredBoolean(value, label);
}

const machineIdentityPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestedCredentialPattern = /^ng_agent_[A-Za-z0-9_-]{43}$/;

function machineIdentity(value: unknown, required: true): string;
function machineIdentity(value: unknown, required: false): string | undefined;
function machineIdentity(value: unknown, required: boolean) {
  if (!required && (value === undefined || value === null || value === "")) return undefined;
  const normalized = requiredString(value, "machineIdentity", 36).toLowerCase();
  if (!machineIdentityPattern.test(normalized)) {
    throw new AgentPayloadError("machineIdentity must be a canonical random UUID.");
  }
  return normalized;
}

function requestedCredential(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 64 || !requestedCredentialPattern.test(value)) {
    throw new AgentPayloadError("requestedCredential must be a valid NodeGuard Agent credential.");
  }
  return value;
}

function safeUpdateString(value: unknown, label: string, maxLength: number, required = true) {
  const normalized = required
    ? requiredString(value, label, maxLength)
    : optionalString(value, label, maxLength);
  if (normalized !== null && /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new AgentPayloadError(`${label} contains unsupported control characters.`);
  }
  return normalized;
}

function stringList(value: unknown, label: string, maxItems = 64, maxLength = 255) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new AgentPayloadError(`${label} must contain at most ${maxItems} strings.`);
  return [...new Set(value.map((entry) => requiredString(entry, label, maxLength)))];
}

export function validateAgentTimestamp(value: unknown, now = Date.now()) {
  const timestamp = requiredString(value, "timestamp", 64);
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) throw new AgentPayloadError("timestamp must be a valid ISO-8601 value.");
  const toleranceMs = env.agentTimestampToleranceSeconds * 1000;
  if (Math.abs(now - time) > toleranceMs) throw new AgentPayloadError("timestamp is outside the accepted time window.");
  return new Date(time).toISOString();
}

function parseFilesystems(value: unknown): AgentFilesystem[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 128) throw new AgentPayloadError("filesystems must contain at most 128 entries.");
  return value.map((entry) => {
    const item = record(entry, "filesystem");
    return {
      device: optionalString(item.device, "filesystem device", 255),
      mount: requiredString(item.mount, "filesystem mount", 1024),
      filesystem: optionalString(item.filesystem, "filesystem type", 64),
      totalBytes: optionalInteger(item.totalBytes, "filesystem totalBytes")
    };
  });
}

export function parseAgentRegistration(value: unknown): AgentRegistrationInput {
  const input = record(value);
  return {
    enrollmentToken: requiredString(input.enrollmentToken, "enrollmentToken", 256),
    requestedCredential: requestedCredential(input.requestedCredential),
    machineIdentity: machineIdentity(input.machineIdentity, false),
    replaceExisting: optionalBoolean(input.replaceExisting, "replaceExisting") ?? false,
    displayName: optionalString(input.displayName, "displayName", 120) ?? undefined,
    hostname: requiredString(input.hostname, "hostname", 255),
    agentVersion: requiredString(input.agentVersion, "agentVersion", 64),
    osName: optionalString(input.osName, "osName", 120),
    osVersion: optionalString(input.osVersion, "osVersion", 120),
    kernel: optionalString(input.kernel, "kernel", 255),
    architecture: optionalString(input.architecture, "architecture", 64)
  };
}

export function parseAgentHeartbeat(value: unknown): AgentHeartbeatInput {
  const input = record(value);
  return {
    agentId: optionalString(input.agentId, "agentId", 64) ?? undefined,
    machineIdentity: machineIdentity(input.machineIdentity, false),
    agentVersion: requiredString(input.agentVersion, "agentVersion", 64),
    processUptimeSeconds: optionalInteger(input.processUptimeSeconds, "processUptimeSeconds", 0, 365 * 86400) ?? 0,
    timestamp: validateAgentTimestamp(input.timestamp)
  };
}

export function parseAgentInventory(value: unknown): AgentInventoryInput {
  const input = record(value);
  return {
    timestamp: validateAgentTimestamp(input.timestamp),
    hostname: requiredString(input.hostname, "hostname", 255),
    osName: optionalString(input.osName, "osName", 120),
    osVersion: optionalString(input.osVersion, "osVersion", 120),
    kernel: optionalString(input.kernel, "kernel", 255),
    architecture: optionalString(input.architecture, "architecture", 64),
    cpuModel: optionalString(input.cpuModel, "cpuModel", 255),
    physicalCoreCount: optionalInteger(input.physicalCoreCount, "physicalCoreCount", 0, 4096),
    logicalCpuCount: optionalInteger(input.logicalCpuCount, "logicalCpuCount", 0, 4096),
    totalMemoryBytes: optionalInteger(input.totalMemoryBytes, "totalMemoryBytes"),
    totalSwapBytes: optionalInteger(input.totalSwapBytes, "totalSwapBytes"),
    filesystems: parseFilesystems(input.filesystems),
    ipAddresses: stringList(input.ipAddresses, "ipAddresses", 64, 128),
    bootTime: optionalString(input.bootTime, "bootTime", 64),
    systemUptimeSeconds: optionalInteger(input.systemUptimeSeconds, "systemUptimeSeconds"),
    agentVersion: requiredString(input.agentVersion, "agentVersion", 64)
  };
}

function parseMetricSample(value: unknown): AgentMetricSampleInput {
  const input = record(value, "metric sample");
  return {
    timestamp: validateAgentTimestamp(input.timestamp),
    cpuUsagePercent: optionalNumber(input.cpuUsagePercent, "cpuUsagePercent", 0, 100),
    memoryUsedBytes: optionalInteger(input.memoryUsedBytes, "memoryUsedBytes"),
    memoryTotalBytes: optionalInteger(input.memoryTotalBytes, "memoryTotalBytes"),
    memoryUsagePercent: optionalNumber(input.memoryUsagePercent, "memoryUsagePercent", 0, 100),
    diskUsedBytes: optionalInteger(input.diskUsedBytes, "diskUsedBytes"),
    diskTotalBytes: optionalInteger(input.diskTotalBytes, "diskTotalBytes"),
    diskUsagePercent: optionalNumber(input.diskUsagePercent, "diskUsagePercent", 0, 100),
    swapUsedBytes: optionalInteger(input.swapUsedBytes, "swapUsedBytes"),
    swapTotalBytes: optionalInteger(input.swapTotalBytes, "swapTotalBytes"),
    swapUsagePercent: optionalNumber(input.swapUsagePercent, "swapUsagePercent", 0, 100),
    loadAverage1: optionalNumber(input.loadAverage1, "loadAverage1", 0, 100000),
    loadAverage5: optionalNumber(input.loadAverage5, "loadAverage5", 0, 100000),
    loadAverage15: optionalNumber(input.loadAverage15, "loadAverage15", 0, 100000),
    systemUptimeSeconds: optionalInteger(input.systemUptimeSeconds, "systemUptimeSeconds")
  };
}

export function parseAgentMetrics(value: unknown): AgentMetricsInput {
  const input = record(value);
  if (!Array.isArray(input.samples) || input.samples.length === 0 || input.samples.length > 20) {
    throw new AgentPayloadError("samples must contain between 1 and 20 metric samples.");
  }
  return { samples: input.samples.map(parseMetricSample) };
}

function parseLabels(value: unknown) {
  if (value === undefined || value === null) return {};
  const labels = record(value, "labels");
  const entries = Object.entries(labels);
  if (entries.length > 64) throw new AgentPayloadError("labels must contain at most 64 entries.");
  return Object.fromEntries(entries.map(([key, item]) => [requiredString(key, "label key", 255), requiredString(item, "label value", 1024)]));
}

function parseContainerHealth(value: unknown): ContainerHealth {
  if (["healthy", "unhealthy", "starting", "none"].includes(String(value))) return value as ContainerHealth;
  throw new AgentPayloadError("container health is invalid.");
}

function parseContainer(value: unknown): AgentContainerInput {
  const input = record(value, "container");
  return {
    id: requiredString(input.id, "container id", 128),
    name: requiredString(input.name, "container name", 255),
    image: requiredString(input.image, "container image", 1024),
    runtimeState: requiredString(input.runtimeState, "container runtimeState", 64),
    health: parseContainerHealth(input.health),
    createdAt: optionalString(input.createdAt, "container createdAt", 64),
    startedAt: optionalString(input.startedAt, "container startedAt", 64),
    uptimeSeconds: optionalInteger(input.uptimeSeconds, "container uptimeSeconds"),
    restartCount: optionalInteger(input.restartCount, "container restartCount"),
    stack: optionalString(input.stack, "container stack", 255),
    ipAddresses: stringList(input.ipAddresses, "container ipAddresses", 64, 128),
    networks: stringList(input.networks, "container networks", 64, 255),
    publishedPorts: stringList(input.publishedPorts, "container publishedPorts", 128, 128),
    containerPorts: stringList(input.containerPorts, "container containerPorts", 128, 128),
    labels: parseLabels(input.labels),
    cpuPercent: optionalNumber(input.cpuPercent, "container cpuPercent", 0, 100000),
    memoryUsedBytes: optionalInteger(input.memoryUsedBytes, "container memoryUsedBytes"),
    memoryLimitBytes: optionalInteger(input.memoryLimitBytes, "container memoryLimitBytes")
  };
}

export function parseAgentDocker(value: unknown): AgentDockerInput {
  const input = record(value);
  if (!Array.isArray(input.containers) || input.containers.length > env.agentMaxContainers) {
    throw new AgentPayloadError(`containers must contain at most ${env.agentMaxContainers} entries.`);
  }
  return {
    timestamp: validateAgentTimestamp(input.timestamp),
    available: typeof input.available === "boolean" ? input.available : (() => { throw new AgentPayloadError("available must be a boolean."); })(),
    version: optionalString(input.version, "Docker version", 120),
    inventoryHash: optionalString(input.inventoryHash, "inventoryHash", 128),
    containers: input.containers.map(parseContainer)
  };
}

const updateStatuses = new Set<AgentUpdateCheckStatus>(AGENT_UPDATE_STATUSES);

function parseUpdateStatus(value: unknown): AgentUpdateCheckStatus {
  if (typeof value !== "string" || !updateStatuses.has(value as AgentUpdateCheckStatus)) {
    throw new AgentPayloadError("status is not a supported update-check status.");
  }
  return value as AgentUpdateCheckStatus;
}

const updateErrorCodes = new Set<AgentUpdateErrorCode>(AGENT_UPDATE_ERROR_CODES);

function parseUpdateErrorCode(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !updateErrorCodes.has(value as AgentUpdateErrorCode)) {
    throw new AgentPayloadError("errorCode is not a supported update error code.");
  }
  return value as AgentUpdateErrorCode;
}

function parseOptionalUpdateTimestamp(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  const timestamp = safeUpdateString(value, label, 64);
  const time = Date.parse(timestamp as string);
  if (!Number.isFinite(time)) throw new AgentPayloadError(`${label} must be a valid ISO-8601 value.`);
  return new Date(time).toISOString();
}

function parseUpdatePackage(value: unknown): AgentPackageUpdateInput {
  const input = record(value, "package update");
  const source = safeUpdateString(input.source, "package source", 96, false);
  if (source && !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,95}$/.test(source)) {
    throw new AgentPayloadError("package source must be a safe archive or suite label.");
  }
  return {
    name: safeUpdateString(input.name, "package name", 255) as string,
    installedVersion: safeUpdateString(input.installedVersion, "installedVersion", 255) as string,
    candidateVersion: safeUpdateString(input.candidateVersion, "candidateVersion", 255) as string,
    security: requiredBoolean(input.security, "package security"),
    source
  };
}

export function parseAgentUpdates(value: unknown): AgentUpdateInventoryInput {
  const input = record(value);
  if (input.schemaVersion !== AGENT_UPDATE_SCHEMA_VERSION) {
    throw new AgentPayloadError(`schemaVersion must be ${AGENT_UPDATE_SCHEMA_VERSION}.`);
  }
  if (input.provider !== AGENT_UPDATE_PROVIDER) {
    throw new AgentPayloadError(`provider must be ${AGENT_UPDATE_PROVIDER}.`);
  }

  const supported = requiredBoolean(input.supported, "supported");
  const status = parseUpdateStatus(input.status);
  const errorCode = parseUpdateErrorCode(input.errorCode);
  const errorMessage = safeUpdateString(input.errorMessage, "errorMessage", 255, false);
  if (status === "ok" && (errorCode || errorMessage)) {
    throw new AgentPayloadError("successful inventories must not contain an update error.");
  }
  if (status !== "ok" && errorCode && !AGENT_UPDATE_ALLOWED_ERROR_CODES_BY_STATUS[status].some((allowed) => allowed === errorCode)) {
    throw new AgentPayloadError("errorCode is inconsistent with status.");
  }
  if ((status === "unsupported") !== !supported) {
    throw new AgentPayloadError("supported and status are inconsistent.");
  }

  const os = record(input.os, "os");
  const checkedAt = validateAgentTimestamp(input.checkedAt);
  const lastSuccessfulAt = parseOptionalUpdateTimestamp(input.lastSuccessfulAt, "lastSuccessfulAt");
  if (lastSuccessfulAt && Date.parse(lastSuccessfulAt) > Date.parse(checkedAt)) {
    throw new AgentPayloadError("lastSuccessfulAt must not be later than checkedAt.");
  }

  const updateCount = requiredInteger(input.updateCount, "updateCount", 0, 1_000_000);
  const securityUpdateCount = requiredInteger(input.securityUpdateCount, "securityUpdateCount", 0, 1_000_000);
  if (securityUpdateCount > updateCount) {
    throw new AgentPayloadError("securityUpdateCount must not exceed updateCount.");
  }

  if (!Array.isArray(input.packages) || input.packages.length > agentUpdatePackageLimit) {
    throw new AgentPayloadError(`packages must contain at most ${agentUpdatePackageLimit} entries.`);
  }
  const packages = input.packages.map(parseUpdatePackage);
  if (new Set(packages.map((entry) => entry.name)).size !== packages.length) {
    throw new AgentPayloadError("packages must not contain duplicate package names.");
  }

  const rebootRequired = optionalBoolean(input.rebootRequired, "rebootRequired");
  const truncated = requiredBoolean(input.truncated, "truncated");
  if (status === "ok") {
    if (rebootRequired === null) throw new AgentPayloadError("rebootRequired is required for a successful check.");
    if (!lastSuccessfulAt) throw new AgentPayloadError("lastSuccessfulAt is required for a successful check.");
    if (lastSuccessfulAt !== checkedAt) throw new AgentPayloadError("lastSuccessfulAt must equal checkedAt for a successful check.");
    if ((!truncated && packages.length !== updateCount) || (truncated && packages.length > updateCount)) {
      throw new AgentPayloadError("package details do not match updateCount.");
    }
    const securityPackages = packages.filter((entry) => entry.security).length;
    if ((!truncated && securityPackages !== securityUpdateCount) || securityPackages > securityUpdateCount) {
      throw new AgentPayloadError("security package details do not match securityUpdateCount.");
    }
  } else if (status === "unsupported") {
    if (lastSuccessfulAt || updateCount !== 0 || securityUpdateCount !== 0 || rebootRequired !== null || truncated || packages.length > 0) {
      throw new AgentPayloadError("unsupported inventories must not contain update results.");
    }
  } else if (rebootRequired !== null || packages.length > 0) {
    throw new AgentPayloadError("failed checks must not contain new package or reboot results.");
  }

  return {
    schemaVersion: AGENT_UPDATE_SCHEMA_VERSION,
    provider: AGENT_UPDATE_PROVIDER,
    supported,
    status,
    os: {
      id: safeUpdateString(os.id, "os id", 120, false),
      versionId: safeUpdateString(os.versionId, "os versionId", 120, false),
      prettyName: safeUpdateString(os.prettyName, "os prettyName", 255, false)
    },
    checkedAt,
    lastSuccessfulAt,
    updateCount,
    securityUpdateCount,
    rebootRequired,
    truncated,
    packages,
    errorCode
  };
}
