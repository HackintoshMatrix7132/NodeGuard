import assert from "node:assert/strict";
import test from "node:test";

const validation = await import("./agentValidation.js");

test("agent metric payload rejects invalid ranges and stale timestamps", () => {
  assert.throws(() => validation.parseAgentMetrics({ samples: [{
    timestamp: new Date().toISOString(),
    cpuUsagePercent: 101
  }] }), validation.AgentPayloadError);

  assert.throws(() => validation.parseAgentHeartbeat({
    agentVersion: "0.1.0",
    processUptimeSeconds: 1,
    timestamp: "2000-01-01T00:00:00.000Z"
  }), validation.AgentPayloadError);
});

test("Docker payload keeps runtime state and health separate", () => {
  const payload = validation.parseAgentDocker({
    timestamp: new Date().toISOString(),
    available: true,
    version: "27.5.1",
    inventoryHash: "hash",
    containers: [{
      id: "abc",
      name: "web",
      image: "nginx:latest",
      runtimeState: "running",
      health: "none",
      ipAddresses: [],
      networks: [],
      publishedPorts: [],
      containerPorts: [],
      labels: {}
    }]
  });
  assert.equal(payload.containers[0]?.runtimeState, "running");
  assert.equal(payload.containers[0]?.health, "none");
});
