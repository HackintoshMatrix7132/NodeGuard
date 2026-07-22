import { env } from "../config/env.js";
import type { MetricHistory, MetricHistoryPoint, MetricHistoryRange, MetricSnapshot } from "../types/nodeguard.js";
import { getDatabase } from "./database.js";
import { getSystemSnapshot } from "./systemMetrics.js";

type MetricHistoryRow = {
  sampled_at: string;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  disk_usage_percent: number | null;
  swap_usage_percent: number | null;
};

type RangeDefinition = {
  durationMs: number;
  intervalSeconds: number;
};

export const metricHistoryRanges: Record<MetricHistoryRange, RangeDefinition> = {
  "1h": { durationMs: 60 * 60 * 1000, intervalSeconds: 60 },
  "6h": { durationMs: 6 * 60 * 60 * 1000, intervalSeconds: 5 * 60 },
  "24h": { durationMs: 24 * 60 * 60 * 1000, intervalSeconds: 15 * 60 },
  "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, intervalSeconds: 60 * 60 },
  "30d": { durationMs: 30 * 24 * 60 * 60 * 1000, intervalSeconds: 4 * 60 * 60 }
};

export function parseMetricHistoryRange(value: unknown): MetricHistoryRange | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  return normalized in metricHistoryRanges ? normalized as MetricHistoryRange : null;
}

export function recordMetricSnapshot(snapshot: MetricSnapshot) {
  const sampledAtMs = new Date(snapshot.createdAt).getTime();
  if (!Number.isFinite(sampledAtMs)) return;

  const database = getDatabase();
  database.prepare(`
    INSERT INTO metric_history (
      server_id,
      sample_minute,
      cpu_usage_percent,
      memory_usage_percent,
      disk_usage_percent,
      swap_usage_percent,
      sampled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(server_id, sample_minute) DO UPDATE SET
      cpu_usage_percent = excluded.cpu_usage_percent,
      memory_usage_percent = excluded.memory_usage_percent,
      disk_usage_percent = excluded.disk_usage_percent,
      swap_usage_percent = excluded.swap_usage_percent,
      sampled_at = excluded.sampled_at
  `).run(
    snapshot.serverId,
    Math.floor(sampledAtMs / 60000),
    snapshot.cpu.usagePercent,
    snapshot.memory.usagePercent,
    snapshot.disk.usagePercent,
    snapshot.swap.usagePercent,
    snapshot.createdAt
  );

  const retentionBoundary = new Date(Date.now() - env.metricHistoryRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  database.prepare("DELETE FROM metric_history WHERE sampled_at < ?").run(retentionBoundary);
}

function average(values: Array<number | null>) {
  const available = values.filter((value): value is number => typeof value === "number");
  if (available.length === 0) return null;
  return Number((available.reduce((total, value) => total + value, 0) / available.length).toFixed(2));
}

function summarize(values: Array<number | null>) {
  const available = values.filter((value): value is number => typeof value === "number");
  return {
    current: available.at(-1) ?? null,
    average: available.length ? average(available) : null,
    peak: available.length ? Math.max(...available) : null
  };
}

function downsample(rows: MetricHistoryRow[], fromMs: number, intervalSeconds: number): MetricHistoryPoint[] {
  const buckets = new Map<number, MetricHistoryRow[]>();
  const intervalMs = intervalSeconds * 1000;

  for (const row of rows) {
    const timestamp = new Date(row.sampled_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const bucket = Math.floor((timestamp - fromMs) / intervalMs);
    const entries = buckets.get(bucket) ?? [];
    entries.push(row);
    buckets.set(bucket, entries);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, entries]) => ({
      timestamp: entries.at(-1)?.sampled_at ?? new Date(fromMs).toISOString(),
      cpuUsagePercent: average(entries.map((entry) => entry.cpu_usage_percent)),
      memoryUsagePercent: average(entries.map((entry) => entry.memory_usage_percent)),
      diskUsagePercent: average(entries.map((entry) => entry.disk_usage_percent)),
      swapUsagePercent: average(entries.map((entry) => entry.swap_usage_percent))
    }));
}

export function getMetricHistory(serverId: string, range: MetricHistoryRange, now = new Date()): MetricHistory {
  const definition = metricHistoryRanges[range];
  const toMs = now.getTime();
  const fromMs = toMs - definition.durationMs;
  const rows = getDatabase().prepare(`
    SELECT sampled_at, cpu_usage_percent, memory_usage_percent, disk_usage_percent, swap_usage_percent
    FROM metric_history
    WHERE server_id = ? AND sampled_at >= ? AND sampled_at <= ?
    ORDER BY sampled_at ASC
  `).all(serverId, new Date(fromMs).toISOString(), now.toISOString()) as MetricHistoryRow[];

  return {
    serverId,
    range,
    from: new Date(fromMs).toISOString(),
    to: now.toISOString(),
    intervalSeconds: definition.intervalSeconds,
    points: downsample(rows, fromMs, definition.intervalSeconds),
    summary: {
      cpu: summarize(rows.map((row) => row.cpu_usage_percent)),
      memory: summarize(rows.map((row) => row.memory_usage_percent)),
      disk: summarize(rows.map((row) => row.disk_usage_percent)),
      swap: summarize(rows.map((row) => row.swap_usage_percent))
    }
  };
}

let capturePromise: Promise<void> | null = null;
let sampler: NodeJS.Timeout | null = null;

export function captureMetricSample() {
  if (capturePromise) return capturePromise;

  capturePromise = getSystemSnapshot()
    .then((snapshot) => recordMetricSnapshot(snapshot.metrics))
    .catch((error) => {
      console.error("NodeGuard metric history sample failed.", error);
    })
    .finally(() => {
      capturePromise = null;
    });

  return capturePromise;
}

export function startMetricHistorySampler() {
  if (sampler) return sampler;

  void captureMetricSample();
  sampler = setInterval(() => void captureMetricSample(), env.metricSampleIntervalSeconds * 1000);
  sampler.unref();
  return sampler;
}

export async function stopMetricHistorySampler() {
  if (sampler) {
    clearInterval(sampler);
    sampler = null;
  }
  await capturePromise;
}
