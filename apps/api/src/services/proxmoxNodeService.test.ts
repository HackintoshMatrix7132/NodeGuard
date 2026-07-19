import assert from "node:assert/strict";
import test from "node:test";

import { ProxmoxApiRequestError, type ProxmoxNodeRrdRecord } from "./proxmoxClient.js";
import {
  PROXMOX_HISTORY_RANGE_CONFIG,
  ProxmoxNodeServiceError,
  createProxmoxNodeService,
  downsampleProxmoxHistory,
  validateProxmoxHistoryRange,
  type ProxmoxNodeContext,
  type ProxmoxNodeDataSource,
  type ProxmoxNodeHistoryPoint,
} from "./proxmoxNodeService.js";

const now = Date.UTC(2026, 6, 19, 12, 0, 0);

function context(connectionId = "connection-a", node = "pve-a"): ProxmoxNodeContext {
  return {
    connection: {
      id: connectionId,
      name: "Primary cluster",
      status: "available",
      version: "8.3.2",
      lastCheckedAt: new Date(now).toISOString(),
      lastSuccessAt: new Date(now).toISOString(),
    },
    node: {
      id: `node/${node}`,
      name: node,
      status: "online",
      uptime: 100,
      cpuUsage: 0.2,
      memoryUsed: 60,
      memoryTotal: 100,
      diskUsed: 20,
      diskTotal: 100,
      version: "8.3.2",
      lastSyncedAt: new Date(now).toISOString(),
    },
    credentials: {
      baseUrl: "https://pve.example.test:8006",
      tokenUser: "nodeguard@pve",
      tokenId: "monitor",
      tokenSecret: "fixture-secret",
    },
  };
}

function rrd(timestampMs: number, patch: Partial<ProxmoxNodeRrdRecord> = {}): ProxmoxNodeRrdRecord {
  return {
    timestamp: timestampMs / 1000,
    cpuUsage: 0.25,
    memoryUsed: 60,
    memoryTotal: 100,
    rootUsed: 20,
    rootTotal: 100,
    networkIn: 1000,
    networkOut: 500,
    diskRead: 250,
    diskWrite: 125,
    ...patch,
  };
}

function source(overrides: Partial<ProxmoxNodeDataSource> = {}): ProxmoxNodeDataSource {
  return {
    getContext: (connectionId, node) => context(connectionId, node),
    getStatus: async () => ({
      uptime: 200,
      cpuUsage: 0.3,
      cpuModel: "Example CPU",
      cpuCores: 8,
      cpuSockets: 1,
      architecture: "x86_64",
      memoryUsed: 70,
      memoryTotal: 100,
      memoryFree: 20,
      memoryAvailable: 30,
      rootUsed: 40,
      rootTotal: 200,
      rootFree: 160,
      pveVersion: "pve-manager/8.3.2",
      kernelVersion: "Linux 6.8.12-pve",
    }),
    getClusterName: async () => "Core cluster",
    getHistory: async () => [rrd(now - 30_000)],
    ...overrides,
  };
}

test("requested Proxmox ranges map to the smallest useful native RRD timeframe", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(PROXMOX_HISTORY_RANGE_CONFIG).map(([key, value]) => [key, value.timeframe])), {
    "1h": "hour",
    "6h": "day",
    "12h": "day",
    "24h": "day",
    "7d": "week",
    "30d": "month",
    "90d": "year",
  });
  for (const range of Object.keys(PROXMOX_HISTORY_RANGE_CONFIG)) {
    assert.equal(validateProxmoxHistoryRange(range), range);
  }
  assert.throws(() => validateProxmoxHistoryRange("year"), ProxmoxNodeServiceError);
});

test("node detail combines status, inventory, and the latest RRD rates without leaking credentials", async () => {
  const service = createProxmoxNodeService(source(), () => now);
  const detail = await service.getDetail("connection-a", "pve-a");
  assert.equal(detail.hardware.cpuModel, "Example CPU");
  assert.equal(detail.platform.cluster, "Core cluster");
  assert.equal(detail.memory.usagePercent, 70);
  assert.equal(detail.storage.readBytesPerSecond, 250);
  assert.equal(detail.telemetry.networkInBytesPerSecond, 1000);
  assert.deepEqual(detail.thermals.sensors, []);
  assert.doesNotMatch(JSON.stringify(detail), /fixture-secret|tokenUser|tokenId/i);
});

test("optional node fields remain null instead of becoming false zero values", async () => {
  const service = createProxmoxNodeService(source({
    getStatus: async () => ({
      uptime: null, cpuUsage: null, cpuModel: null, cpuCores: null, cpuSockets: null,
      architecture: null, memoryUsed: null, memoryTotal: null, memoryFree: null,
      memoryAvailable: null, rootUsed: null, rootTotal: null, rootFree: null,
      pveVersion: null, kernelVersion: null,
    }),
    getClusterName: async () => null,
    getHistory: async () => [],
    getContext: () => ({ ...context(), node: { ...context().node, memoryUsed: null, memoryTotal: null, diskUsed: null, diskTotal: null } }),
  }), () => now);
  const detail = await service.getDetail("connection-a", "pve-a");
  assert.equal(detail.memory.usagePercent, null);
  assert.equal(detail.memory.freeBytes, null);
  assert.equal(detail.storage.usagePercent, null);
  assert.equal(detail.telemetry.networkInBytesPerSecond, null);
});

test("history filters bounds, sorts samples, removes duplicates, and keeps sparse nulls", async () => {
  const records = [
    rrd(now - 30 * 60_000, { cpuUsage: 0.9 }),
    rrd(now - 90 * 60_000),
    rrd(now - 30 * 60_000, { cpuUsage: 0.4, memoryUsed: null }),
    rrd(now + 5 * 60_000),
  ];
  const service = createProxmoxNodeService(source({ getHistory: async () => records }), () => now);
  const history = await service.getHistory("connection-a", "pve-a", "1h");
  assert.equal(history.sourceTimeframe, "hour");
  assert.equal(history.points.length, 1);
  assert.equal(history.points[0]?.cpuUsagePercent, 40);
  assert.equal(history.points[0]?.memoryUsagePercent, null);
  assert.equal(history.availableMetrics.thermals, false);
});

test("history requests are deduplicated and cache keys isolate connection, node, and range", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const service = createProxmoxNodeService(source({ getHistory: async () => { calls += 1; await gate; return [rrd(now - 30_000)]; } }), () => now);
  const first = service.getHistory("connection-a", "pve-a", "1h");
  const duplicate = service.getHistory("connection-a", "pve-a", "1h");
  release?.();
  await Promise.all([first, duplicate]);
  assert.equal(calls, 1);
  await service.getHistory("connection-a", "pve-b", "1h");
  await service.getHistory("connection-b", "pve-a", "1h");
  await service.getHistory("connection-a", "pve-a", "6h");
  assert.equal(calls, 4);
});

test("downsampling bounds payloads while retaining a spike and endpoints", () => {
  const points: ProxmoxNodeHistoryPoint[] = Array.from({ length: 1000 }, (_, index) => ({
    timestamp: new Date(now - (1000 - index) * 60_000).toISOString(),
    cpuUsagePercent: index === 503 ? 99 : 10,
    memoryUsagePercent: 50,
    rootUsagePercent: 20,
    networkInBytesPerSecond: 100,
    networkOutBytesPerSecond: 100,
    diskReadBytesPerSecond: 100,
    diskWriteBytesPerSecond: 100,
    temperaturesCelsius: {},
  }));
  const sampled = downsampleProxmoxHistory(points, 120);
  assert.equal(sampled.length, 120);
  assert.equal(sampled[0], points[0]);
  assert.equal(sampled.at(-1), points.at(-1));
  assert.ok(sampled.some((point) => point.cpuUsagePercent === 99));
});

test("service returns safe unavailable, permission, timeout, disabled, and not-found errors", async () => {
  const cases: Array<[unknown, string]> = [
    [new ProxmoxApiRequestError("permission denied", 403), "permission_denied"],
    [new Error("Proxmox API request timed out."), "timeout"],
  ];
  for (const [error, code] of cases) {
    const service = createProxmoxNodeService(source({ getStatus: async () => { throw error; } }), () => now);
    await assert.rejects(service.getDetail("connection-a", "pve-a"), (caught: unknown) => caught instanceof ProxmoxNodeServiceError && caught.code === code);
  }
  for (const [message, code] of [
    ["Proxmox connection is disabled.", "connection_disabled"],
    ["Proxmox connection was not found.", "connection_not_found"],
    ["Proxmox node was not found.", "node_not_found"],
  ] as const) {
    const service = createProxmoxNodeService(source({ getContext: () => { throw new Error(message); } }), () => now);
    await assert.rejects(service.getDetail("connection-a", "pve-a"), (caught: unknown) => caught instanceof ProxmoxNodeServiceError && caught.code === code);
  }
});
