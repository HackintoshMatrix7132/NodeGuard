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

function updatePayload(overrides: Record<string, unknown> = {}): any {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 1,
    provider: "apt",
    supported: true,
    status: "ok",
    os: { id: "debian", versionId: "12", prettyName: "Debian GNU/Linux 12" },
    checkedAt: timestamp,
    lastSuccessfulAt: timestamp,
    updateCount: 1,
    securityUpdateCount: 1,
    rebootRequired: false,
    truncated: false,
    packages: [{
      name: "openssl",
      installedVersion: "3.0.0-1",
      candidateVersion: "3.0.0-2",
      security: true,
      source: "debian-security"
    }],
    ...overrides
  };
}

test("accepts the Agent-shaped bounded versioned APT update inventory", () => {
  const payload = validation.parseAgentUpdates(updatePayload());
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.provider, "apt");
  assert.equal(payload.packages[0]?.name, "openssl");
});

test("successful inventories use one atomic check timestamp", () => {
  const checkedAt = new Date().toISOString();
  assert.throws(() => validation.parseAgentUpdates(updatePayload({
    checkedAt,
    lastSuccessfulAt: new Date(Date.parse(checkedAt) - 1_000).toISOString()
  })), validation.AgentPayloadError);
});

test("rejects malformed, inconsistent, duplicate, and oversized update inventories", () => {
  assert.throws(() => validation.parseAgentUpdates(updatePayload({ schemaVersion: 2 })), validation.AgentPayloadError);
  assert.throws(() => validation.parseAgentUpdates(updatePayload({ provider: "shell" })), validation.AgentPayloadError);
  assert.throws(() => validation.parseAgentUpdates(updatePayload({ securityUpdateCount: 2 })), validation.AgentPayloadError);
  const duplicate = updatePayload();
  duplicate.updateCount = 2;
  duplicate.securityUpdateCount = 2;
  duplicate.packages = [duplicate.packages[0], duplicate.packages[0]];
  assert.throws(() => validation.parseAgentUpdates(duplicate), validation.AgentPayloadError);
  const tooMany = updatePayload({ truncated: true, updateCount: 501, securityUpdateCount: 0 });
  tooMany.packages = Array.from({ length: 501 }, (_, index) => ({
    name: `package-${index}`,
    installedVersion: "1",
    candidateVersion: "2",
    security: false,
    source: null
  }));
  assert.throws(() => validation.parseAgentUpdates(tooMany), validation.AgentPayloadError);
  assert.throws(() => validation.parseAgentUpdates(updatePayload({
    packages: [{
      name: "openssl",
      installedVersion: "1",
      candidateVersion: "2",
      security: true,
      source: "https://user:secret@private.example/repository"
    }]
  })), validation.AgentPayloadError);

  const maximumSource = "a".repeat(96);
  assert.equal(validation.parseAgentUpdates(updatePayload({
    packages: [{
      name: "openssl",
      installedVersion: "1",
      candidateVersion: "2",
      security: true,
      source: maximumSource
    }]
  })).packages[0]?.source, maximumSource);
  assert.throws(() => validation.parseAgentUpdates(updatePayload({
    packages: [{
      name: "openssl",
      installedVersion: "1",
      candidateVersion: "2",
      security: true,
      source: "a".repeat(97)
    }]
  })), validation.AgentPayloadError);
});

test("accepts explicit unsupported and failed states without package results", () => {
  const unsupported = validation.parseAgentUpdates(updatePayload({
    supported: false,
    status: "unsupported",
    lastSuccessfulAt: null,
    updateCount: 0,
    securityUpdateCount: 0,
    rebootRequired: null,
    packages: []
  }));
  assert.equal(unsupported.status, "unsupported");

  const failed = validation.parseAgentUpdates(updatePayload({
    status: "package_manager_busy",
    lastSuccessfulAt: null,
    updateCount: 0,
    securityUpdateCount: 0,
    rebootRequired: null,
    packages: []
  }));
  assert.equal(failed.status, "package_manager_busy");
});
