import {
  collectProxmoxClusterName,
  collectProxmoxNodeRrd,
  collectProxmoxNodeStatus,
  ProxmoxApiRequestError,
  type ProxmoxCredentials,
  type ProxmoxNodeRrdRecord,
  type ProxmoxNodeStatusRecord,
  type ProxmoxRrdTimeframe,
} from "./proxmoxClient.js";
import {
  getDemoProxmoxSnapshot,
  getProxmoxNodeConnectionContext,
} from "./proxmoxService.js";

export type ProxmoxHistoryRange = "1h" | "6h" | "12h" | "24h" | "7d" | "30d" | "90d";

export const PROXMOX_HISTORY_RANGE_CONFIG: Record<
  ProxmoxHistoryRange,
  { durationMs: number; timeframe: ProxmoxRrdTimeframe }
> = {
  "1h": { durationMs: 60 * 60_000, timeframe: "hour" },
  "6h": { durationMs: 6 * 60 * 60_000, timeframe: "day" },
  "12h": { durationMs: 12 * 60 * 60_000, timeframe: "day" },
  "24h": { durationMs: 24 * 60 * 60_000, timeframe: "day" },
  "7d": { durationMs: 7 * 24 * 60 * 60_000, timeframe: "week" },
  "30d": { durationMs: 30 * 24 * 60 * 60_000, timeframe: "month" },
  "90d": { durationMs: 90 * 24 * 60 * 60_000, timeframe: "year" },
};

const CONNECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;
const NODE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const OVERVIEW_CACHE_TTL_MS = 15_000;
const HISTORY_CACHE_TTL_MS = 30_000;
const MAX_HISTORY_POINTS = 480;

export class ProxmoxNodeServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ProxmoxNodeServiceError";
  }
}

type CachedValue<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

export class TimedPromiseCache {
  private readonly entries = new Map<string, CachedValue<unknown>>();

  async get<T>(key: string, ttlMs: number, loader: () => Promise<T>, now = Date.now()): Promise<T> {
    const current = this.entries.get(key) as CachedValue<T> | undefined;
    if (current?.value !== undefined && current.expiresAt > now) return current.value;
    if (current?.promise) return current.promise;

    const promise = loader()
      .then((value) => {
        this.entries.set(key, { value, expiresAt: now + ttlMs });
        return value;
      })
      .catch((error) => {
        this.entries.delete(key);
        throw error;
      });
    this.entries.set(key, { promise, expiresAt: now + ttlMs });
    return promise;
  }

  clear(): void {
    this.entries.clear();
  }
}

export interface ProxmoxNodeContext {
  connection: {
    id: string;
    name: string;
    status: string;
    version: string | null;
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
  };
  node: {
    id: unknown;
    name: unknown;
    status: unknown;
    uptime: unknown;
    cpuUsage: unknown;
    memoryUsed: unknown;
    memoryTotal: unknown;
    diskUsed: unknown;
    diskTotal: unknown;
    version: unknown;
    lastSyncedAt: unknown;
  };
  credentials: ProxmoxCredentials;
}

export interface ProxmoxNodeDataSource {
  getContext(connectionId: string, node: string): ProxmoxNodeContext;
  getStatus(credentials: ProxmoxCredentials, node: string): Promise<ProxmoxNodeStatusRecord>;
  getClusterName(credentials: ProxmoxCredentials): Promise<string | null>;
  getHistory(
    credentials: ProxmoxCredentials,
    node: string,
    timeframe: ProxmoxRrdTimeframe,
  ): Promise<ProxmoxNodeRrdRecord[]>;
}

export interface ProxmoxNodeHistoryPoint {
  timestamp: string;
  cpuUsagePercent: number | null;
  memoryUsagePercent: number | null;
  rootUsagePercent: number | null;
  networkInBytesPerSecond: number | null;
  networkOutBytesPerSecond: number | null;
  diskReadBytesPerSecond: number | null;
  diskWriteBytesPerSecond: number | null;
  temperaturesCelsius: Record<string, number>;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteRate(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function finiteString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function percentage(used: number | null, total: number | null): number | null {
  return used !== null && total !== null && total > 0
    ? Math.max(0, Math.min(100, (used / total) * 100))
    : null;
}

function fractionToPercent(value: number | null): number | null {
  return value === null ? null : Math.max(0, Math.min(100, value * 100));
}

export function validateProxmoxConnectionId(value: string): string {
  if (!CONNECTION_ID_PATTERN.test(value)) {
    throw new ProxmoxNodeServiceError("Invalid Proxmox connection identifier.", 400, "invalid_connection");
  }
  return value;
}

export function validateProxmoxNodeName(value: string): string {
  if (!NODE_NAME_PATTERN.test(value)) {
    throw new ProxmoxNodeServiceError("Invalid Proxmox node identifier.", 400, "invalid_node");
  }
  return value;
}

export function validateProxmoxHistoryRange(value: unknown): ProxmoxHistoryRange {
  if (typeof value !== "string" || !(value in PROXMOX_HISTORY_RANGE_CONFIG)) {
    throw new ProxmoxNodeServiceError("Unsupported Proxmox history range.", 400, "invalid_range");
  }
  return value as ProxmoxHistoryRange;
}

function safeServiceError(error: unknown): ProxmoxNodeServiceError {
  if (error instanceof ProxmoxNodeServiceError) return error;
  if (error instanceof ProxmoxApiRequestError) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new ProxmoxNodeServiceError(error.message, 502, "permission_denied");
    }
    if (error.statusCode === 404) {
      return new ProxmoxNodeServiceError("Proxmox node was not found.", 404, "node_not_found");
    }
  }
  const message = error instanceof Error ? error.message : "";
  if (/connection was not found/i.test(message)) {
    return new ProxmoxNodeServiceError("Proxmox connection was not found.", 404, "connection_not_found");
  }
  if (/node was not found/i.test(message)) {
    return new ProxmoxNodeServiceError("Proxmox node was not found.", 404, "node_not_found");
  }
  if (/disabled/i.test(message)) {
    return new ProxmoxNodeServiceError("Proxmox connection is disabled.", 409, "connection_disabled");
  }
  if (/timed out/i.test(message)) {
    return new ProxmoxNodeServiceError("The Proxmox API request timed out.", 504, "timeout");
  }
  return new ProxmoxNodeServiceError(
    "Proxmox API is unavailable. Try again after checking the connection.",
    502,
    "proxmox_unavailable",
  );
}

function normalizeHistoryPoints(
  records: ProxmoxNodeRrdRecord[],
  fromMs: number,
  toMs: number,
): ProxmoxNodeHistoryPoint[] {
  const unique = new Map<number, ProxmoxNodeRrdRecord>();
  for (const record of records) {
    const timestampMs = record.timestamp * 1000;
    if (!Number.isFinite(timestampMs) || timestampMs < fromMs || timestampMs > toMs + 60_000) continue;
    unique.set(record.timestamp, record);
  }

  return [...unique.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((record) => ({
      timestamp: new Date(record.timestamp * 1000).toISOString(),
      cpuUsagePercent: fractionToPercent(record.cpuUsage),
      memoryUsagePercent: percentage(record.memoryUsed, record.memoryTotal),
      rootUsagePercent: percentage(record.rootUsed, record.rootTotal),
      networkInBytesPerSecond: finiteRate(record.networkIn),
      networkOutBytesPerSecond: finiteRate(record.networkOut),
      diskReadBytesPerSecond: finiteRate(record.diskRead),
      diskWriteBytesPerSecond: finiteRate(record.diskWrite),
      temperaturesCelsius: {},
    }));
}

function activityScore(point: ProxmoxNodeHistoryPoint): number {
  const percentages = [point.cpuUsagePercent, point.memoryUsagePercent, point.rootUsagePercent]
    .filter((value): value is number => value !== null)
    .reduce((total, value) => total + value, 0);
  const rates = [
    point.networkInBytesPerSecond,
    point.networkOutBytesPerSecond,
    point.diskReadBytesPerSecond,
    point.diskWriteBytesPerSecond,
  ]
    .filter((value): value is number => value !== null && value >= 0)
    .reduce((total, value) => total + Math.log10(value + 1), 0);
  return percentages + rates;
}

export function downsampleProxmoxHistory(
  points: ProxmoxNodeHistoryPoint[],
  maxPoints = MAX_HISTORY_POINTS,
): ProxmoxNodeHistoryPoint[] {
  if (points.length <= maxPoints || maxPoints < 3) return points;
  const result: ProxmoxNodeHistoryPoint[] = [points[0]!];
  const bucketSize = (points.length - 2) / (maxPoints - 2);

  for (let bucket = 0; bucket < maxPoints - 2; bucket += 1) {
    const start = Math.floor(1 + bucket * bucketSize);
    const end = Math.min(points.length - 1, Math.floor(1 + (bucket + 1) * bucketSize));
    let selected = points[start]!;
    let highest = activityScore(selected);
    for (let index = start + 1; index < end; index += 1) {
      const candidate = points[index]!;
      const score = activityScore(candidate);
      if (score > highest) {
        selected = candidate;
        highest = score;
      }
    }
    result.push(selected);
  }
  result.push(points.at(-1)!);
  return result;
}

function latestUsableRecord(records: ProxmoxNodeRrdRecord[]): ProxmoxNodeRrdRecord | null {
  return records
    .filter((record) => Number.isFinite(record.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

const defaultDataSource: ProxmoxNodeDataSource = {
  getContext: (connectionId, node) => getProxmoxNodeConnectionContext(connectionId, node) as ProxmoxNodeContext,
  getStatus: collectProxmoxNodeStatus,
  getClusterName: collectProxmoxClusterName,
  getHistory: collectProxmoxNodeRrd,
};

export function createProxmoxNodeService(
  source: ProxmoxNodeDataSource = defaultDataSource,
  now: () => number = Date.now,
) {
  const overviewCache = new TimedPromiseCache();
  const historyCache = new TimedPromiseCache();

  return {
    async getDetail(connectionIdInput: string, nodeInput: string) {
      const connectionId = validateProxmoxConnectionId(connectionIdInput);
      const nodeName = validateProxmoxNodeName(nodeInput);
      let context: ProxmoxNodeContext;
      try {
        context = source.getContext(connectionId, nodeName);
      } catch (error) {
        throw safeServiceError(error);
      }

      return overviewCache.get(`detail:${connectionId}:${nodeName}`, OVERVIEW_CACHE_TTL_MS, async () => {
        try {
          const [status, clusterResult, rrdResult] = await Promise.all([
            source.getStatus(context.credentials, nodeName),
            source.getClusterName(context.credentials).catch(() => null),
            source.getHistory(context.credentials, nodeName, "hour").catch(() => []),
          ]);
          const latest = latestUsableRecord(rrdResult);
          const inventoryMemoryUsed = finiteNumber(context.node.memoryUsed);
          const inventoryMemoryTotal = finiteNumber(context.node.memoryTotal);
          const inventoryRootUsed = finiteNumber(context.node.diskUsed);
          const inventoryRootTotal = finiteNumber(context.node.diskTotal);
          const memoryUsed = status.memoryUsed ?? inventoryMemoryUsed;
          const memoryTotal = status.memoryTotal ?? inventoryMemoryTotal;
          const rootUsed = status.rootUsed ?? inventoryRootUsed;
          const rootTotal = status.rootTotal ?? inventoryRootTotal;
          const nodeLastSync = finiteString(context.node.lastSyncedAt);

          return {
            connectionId,
            connectionName: context.connection.name,
            connectionStatus: context.connection.status,
            displayName: finiteString(context.node.name) ?? nodeName,
            node: nodeName,
            status: finiteString(context.node.status) ?? "unknown",
            uptimeSeconds: status.uptime ?? finiteNumber(context.node.uptime),
            lastSyncAt: nodeLastSync ?? context.connection.lastSuccessAt,
            lastTelemetryAt: latest ? new Date(latest.timestamp * 1000).toISOString() : nodeLastSync,
            stale: context.connection.status === "stale" || context.connection.status === "unavailable",
            platform: {
              pveVersion: status.pveVersion ?? finiteString(context.node.version) ?? context.connection.version,
              kernelVersion: status.kernelVersion,
              cluster: clusterResult,
              connection: context.connection.name,
            },
            hardware: {
              cpuModel: status.cpuModel,
              cpuCores: status.cpuCores,
              cpuSockets: status.cpuSockets,
              architecture: status.architecture,
            },
            memory: {
              usagePercent: percentage(memoryUsed, memoryTotal),
              usedBytes: memoryUsed,
              totalBytes: memoryTotal,
              freeBytes: status.memoryFree ?? (memoryTotal !== null && memoryUsed !== null ? memoryTotal - memoryUsed : null),
              reclaimableBytes: status.memoryAvailable !== null && status.memoryFree !== null
                ? Math.max(0, status.memoryAvailable - status.memoryFree)
                : null,
            },
            storage: {
              usagePercent: percentage(rootUsed, rootTotal),
              usedBytes: rootUsed,
              totalBytes: rootTotal,
              freeBytes: status.rootFree ?? (rootTotal !== null && rootUsed !== null ? rootTotal - rootUsed : null),
              readBytesPerSecond: finiteRate(latest?.diskRead),
              writeBytesPerSecond: finiteRate(latest?.diskWrite),
            },
            telemetry: {
              networkInBytesPerSecond: finiteRate(latest?.networkIn),
              networkOutBytesPerSecond: finiteRate(latest?.networkOut),
              source: "Proxmox API / RRD",
              state: rrdResult.length ? "available" : "partial",
            },
            thermals: {
              sensors: [] as Array<{ name: string; celsius: number }>,
              lastUpdatedAt: null,
            },
          };
        } catch (error) {
          throw safeServiceError(error);
        }
      }, now());
    },

    async getHistory(connectionIdInput: string, nodeInput: string, rangeInput: unknown) {
      const connectionId = validateProxmoxConnectionId(connectionIdInput);
      const nodeName = validateProxmoxNodeName(nodeInput);
      const range = validateProxmoxHistoryRange(rangeInput);
      const config = PROXMOX_HISTORY_RANGE_CONFIG[range];
      let context: ProxmoxNodeContext;
      try {
        context = source.getContext(connectionId, nodeName);
      } catch (error) {
        throw safeServiceError(error);
      }

      return historyCache.get(`history:${connectionId}:${nodeName}:${range}`, HISTORY_CACHE_TTL_MS, async () => {
        try {
          const toMs = now();
          const fromMs = toMs - config.durationMs;
          const records = await source.getHistory(context.credentials, nodeName, config.timeframe);
          const points = downsampleProxmoxHistory(normalizeHistoryPoints(records, fromMs, toMs));
          return {
            connectionId,
            node: nodeName,
            range,
            sourceTimeframe: config.timeframe,
            from: new Date(fromMs).toISOString(),
            to: new Date(toMs).toISOString(),
            fetchedAt: new Date(toMs).toISOString(),
            stale: context.connection.status === "stale" || context.connection.status === "unavailable",
            points,
            availableMetrics: {
              utilization: points.some((point) => point.cpuUsagePercent !== null || point.memoryUsagePercent !== null || point.rootUsagePercent !== null),
              network: points.some((point) => point.networkInBytesPerSecond !== null || point.networkOutBytesPerSecond !== null),
              disk: points.some((point) => point.diskReadBytesPerSecond !== null || point.diskWriteBytesPerSecond !== null),
              thermals: points.some((point) => Object.keys(point.temperaturesCelsius).length > 0),
            },
          };
        } catch (error) {
          throw safeServiceError(error);
        }
      }, now());
    },

    clearCaches() {
      overviewCache.clear();
      historyCache.clear();
    },
  };
}

export const proxmoxNodeService = createProxmoxNodeService();

function demoNode(connectionId: string, nodeName: string) {
  const snapshot = getDemoProxmoxSnapshot();
  const connection = snapshot.connections.find((item) => item.id === connectionId);
  const node = connection?.nodes.find((item) => item.name === nodeName || item.id === `node/${nodeName}`);
  if (!connection) throw new ProxmoxNodeServiceError("Proxmox connection was not found.", 404, "connection_not_found");
  if (!node) throw new ProxmoxNodeServiceError("Proxmox node was not found.", 404, "node_not_found");
  return { connection, node };
}

export function getDemoProxmoxNodeDetail(connectionIdInput: string, nodeInput: string) {
  const connectionId = validateProxmoxConnectionId(connectionIdInput);
  const nodeName = validateProxmoxNodeName(nodeInput);
  const { connection, node } = demoNode(connectionId, nodeName);
  const online = node.status === "online";
  const usedMemory = finiteNumber(node.memoryUsed);
  const totalMemory = finiteNumber(node.memoryTotal);
  const usedRoot = finiteNumber(node.diskUsed);
  const totalRoot = finiteNumber(node.diskTotal);
  return {
    connectionId,
    connectionName: connection.name,
    connectionStatus: connection.status,
    displayName: node.name,
    node: nodeName,
    status: node.status,
    uptimeSeconds: finiteNumber(node.uptime),
    lastSyncAt: node.lastSyncedAt,
    lastTelemetryAt: node.lastSyncedAt,
    stale: connection.status === "stale" || connection.status === "unavailable",
    platform: {
      pveVersion: node.version,
      kernelVersion: online ? "6.8.12-9-pve" : null,
      cluster: connectionId === "demo-pve-main" ? "Demo cluster" : null,
      connection: connection.name,
    },
    hardware: {
      cpuModel: online ? "AMD EPYC 7302P 16-Core Processor" : null,
      cpuCores: online ? 16 : null,
      cpuSockets: online ? 1 : null,
      architecture: online ? "x86_64" : null,
    },
    memory: {
      usagePercent: percentage(usedMemory, totalMemory),
      usedBytes: usedMemory,
      totalBytes: totalMemory,
      freeBytes: usedMemory !== null && totalMemory !== null ? totalMemory - usedMemory : null,
      reclaimableBytes: online ? 4_294_967_296 : null,
    },
    storage: {
      usagePercent: percentage(usedRoot, totalRoot),
      usedBytes: usedRoot,
      totalBytes: totalRoot,
      freeBytes: usedRoot !== null && totalRoot !== null ? totalRoot - usedRoot : null,
      readBytesPerSecond: online ? 8_388_608 : null,
      writeBytesPerSecond: online ? 3_145_728 : null,
    },
    telemetry: {
      networkInBytesPerSecond: online ? 5_767_168 : null,
      networkOutBytesPerSecond: online ? 3_670_016 : null,
      source: "Proxmox API / RRD",
      state: online ? "available" : "partial",
    },
    thermals: { sensors: [], lastUpdatedAt: null },
  };
}

export function getDemoProxmoxNodeHistory(
  connectionIdInput: string,
  nodeInput: string,
  rangeInput: unknown,
) {
  const connectionId = validateProxmoxConnectionId(connectionIdInput);
  const nodeName = validateProxmoxNodeName(nodeInput);
  const range = validateProxmoxHistoryRange(rangeInput);
  const { connection, node } = demoNode(connectionId, nodeName);
  const config = PROXMOX_HISTORY_RANGE_CONFIG[range];
  const toMs = Date.now();
  const fromMs = toMs - config.durationMs;
  const online = node.status === "online";
  const pointCount = online ? 120 : 0;
  const points: ProxmoxNodeHistoryPoint[] = Array.from({ length: pointCount }, (_, index) => {
    const phase = index / Math.max(1, pointCount - 1);
    const wave = Math.sin(phase * Math.PI * 6 + nodeName.length);
    return {
      timestamp: new Date(fromMs + phase * config.durationMs).toISOString(),
      cpuUsagePercent: 18 + wave * 7 + Math.sin(phase * 31) * 2,
      memoryUsagePercent: 48 + phase * 5 + wave * 1.5,
      rootUsagePercent: 31 + phase * 0.8,
      networkInBytesPerSecond: 4_500_000 + Math.max(0, wave) * 4_000_000,
      networkOutBytesPerSecond: 2_200_000 + Math.max(0, -wave) * 3_000_000,
      diskReadBytesPerSecond: 6_000_000 + Math.max(0, wave) * 7_000_000,
      diskWriteBytesPerSecond: 2_000_000 + Math.max(0, -wave) * 5_000_000,
      temperaturesCelsius: {},
    };
  });
  return {
    connectionId,
    node: nodeName,
    range,
    sourceTimeframe: config.timeframe,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    fetchedAt: new Date(toMs).toISOString(),
    stale: connection.status === "stale" || connection.status === "unavailable",
    points,
    availableMetrics: {
      utilization: points.length > 0,
      network: points.length > 0,
      disk: points.length > 0,
      thermals: false,
    },
  };
}
