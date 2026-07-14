import assert from "node:assert/strict";
import test from "node:test";

import {
  getDemoProxmoxSnapshot,
  runWithProxmoxSyncLock,
  summarizeProxmoxStorage,
} from "./proxmoxService.js";

test("Proxmox storage summary distinguishes capacity and availability issues", () => {
  const previousWarning = process.env.NODEGUARD_PROXMOX_STORAGE_WARNING_PERCENT;
  const previousCritical =
    process.env.NODEGUARD_PROXMOX_STORAGE_CRITICAL_PERCENT;
  process.env.NODEGUARD_PROXMOX_STORAGE_WARNING_PERCENT = "80";
  process.env.NODEGUARD_PROXMOX_STORAGE_CRITICAL_PERCENT = "90";

  try {
    assert.deepEqual(
      summarizeProxmoxStorage([
        { status: "available", utilization: 0.42 },
        { status: "available", utilization: 0.85 },
        { status: "available", utilization: 0.93 },
        { status: "offline", utilization: 0.95 },
        { status: "available", utilization: null },
      ]),
      {
        storageWarnings: 1,
        storageCritical: 1,
        storageUnavailable: 1,
      },
    );
  } finally {
    if (previousWarning === undefined) {
      delete process.env.NODEGUARD_PROXMOX_STORAGE_WARNING_PERCENT;
    } else {
      process.env.NODEGUARD_PROXMOX_STORAGE_WARNING_PERCENT = previousWarning;
    }
    if (previousCritical === undefined) {
      delete process.env.NODEGUARD_PROXMOX_STORAGE_CRITICAL_PERCENT;
    } else {
      process.env.NODEGUARD_PROXMOX_STORAGE_CRITICAL_PERCENT =
        previousCritical;
    }
  }
});

test("Proxmox Demo Mode is populated and isolated from production data", () => {
  const snapshot = getDemoProxmoxSnapshot() as unknown as Record<
    string,
    unknown
  >;
  const serialized = JSON.stringify(snapshot);

  assert.ok(Array.isArray(snapshot.connections));
  const connections = snapshot.connections as Array<Record<string, unknown>>;
  assert.ok(connections.length > 0);
  assert.ok(Array.isArray(connections[0]?.nodes));
  assert.ok(Array.isArray(connections[0]?.guests));
  assert.ok(Array.isArray(connections[0]?.storage));
  assert.deepEqual(snapshot.summary, {
    connections: 2,
    connectionsAvailable: 1,
    nodesOnline: 3,
    nodesTotal: 4,
    guestsRunning: 3,
    guestsTotal: 4,
    storageHealthy: 3,
    storageTotal: 4,
    storageWarnings: 0,
    storageCritical: 0,
    storageUnavailable: 1,
  });
  assert.ok(serialized.length > 200);
  assert.doesNotMatch(serialized, /muthu\.eu/i);
  assert.doesNotMatch(serialized, /192\.168\.178\./);
});

test("Proxmox sync lock skips overlapping work and releases after completion", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstRuns = 0;
  let overlappingRuns = 0;

  const first = runWithProxmoxSyncLock("overlap-test", async () => {
    firstRuns += 1;
    await firstGate;
  });
  const overlapping = await runWithProxmoxSyncLock("overlap-test", async () => {
    overlappingRuns += 1;
  });

  assert.equal(overlapping, false);
  assert.equal(overlappingRuns, 0);
  releaseFirst?.();
  assert.equal(await first, true);
  assert.equal(firstRuns, 1);

  assert.equal(
    await runWithProxmoxSyncLock("overlap-test", async () => undefined),
    true,
  );
});
