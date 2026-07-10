import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = ":memory:";

const metricHistoryService = await import("./metricHistoryService.js");

test("parseMetricHistoryRange accepts supported ranges", () => {
  for (const range of ["1h", "6h", "24h", "7d", "30d"]) {
    assert.equal(metricHistoryService.parseMetricHistoryRange(range), range);
  }
});

test("parseMetricHistoryRange rejects unsupported ranges", () => {
  assert.equal(metricHistoryService.parseMetricHistoryRange("12h"), null);
  assert.equal(metricHistoryService.parseMetricHistoryRange(undefined), null);
});

test("metric snapshots are persisted and returned by range", () => {
  const sampledAt = new Date().toISOString();
  metricHistoryService.recordMetricSnapshot({
    serverId: "test-node",
    cpu: { usagePercent: 31.5, loadAverage: 0.4 },
    memory: { usedGb: 4, totalGb: 8, usagePercent: 50 },
    disk: { usedGb: 20, totalGb: 100, usagePercent: 20 },
    swap: { usedGb: 1, totalGb: 8, usagePercent: 12.5 },
    network: { downloadMbps: null, uploadMbps: null },
    uptimeSeconds: 100,
    createdAt: sampledAt
  });

  const history = metricHistoryService.getMetricHistory("test-node", "1h");
  assert.equal(history.points.length, 1);
  assert.equal(history.points[0]?.timestamp, sampledAt);
  assert.equal(history.points[0]?.cpuUsagePercent, 31.5);
  assert.equal(history.points[0]?.memoryUsagePercent, 50);
  assert.equal(history.points[0]?.diskUsagePercent, 20);
  assert.equal(history.points[0]?.swapUsagePercent, 12.5);
  assert.deepEqual(history.summary.cpu, { current: 31.5, average: 31.5, peak: 31.5 });
  assert.deepEqual(history.summary.swap, { current: 12.5, average: 12.5, peak: 12.5 });
});
