import assert from "node:assert/strict";
import test from "node:test";

const validation = await import("./agentValidation.js");

test("Agent registration validates optional machine identity and explicit replacement flag", () => {
  const valid = validation.parseAgentRegistration({
    enrollmentToken: "ng_join_test",
    requestedCredential: `ng_agent_${"A".repeat(43)}`,
    machineIdentity: "7A216DA5-C4E2-4EC2-9D45-83FEFD890134",
    replaceExisting: true,
    hostname: "machine.example",
    agentVersion: "0.2.0"
  });
  assert.equal(valid.machineIdentity, "7a216da5-c4e2-4ec2-9d45-83fefd890134");
  assert.equal(valid.replaceExisting, true);
  assert.equal(valid.requestedCredential, `ng_agent_${"A".repeat(43)}`);

  assert.equal(validation.parseAgentRegistration({
    enrollmentToken: "ng_join_test",
    machineIdentity: "2509c555-0dc8-4764-b0f9-dc60fa38c238",
    hostname: "machine.example",
    agentVersion: "0.2.0"
  }).replaceExisting, false);

  assert.equal(validation.parseAgentRegistration({
    enrollmentToken: "ng_rotate_legacy",
    hostname: "legacy.example",
    agentVersion: "0.1.0"
  }).machineIdentity, undefined);

  for (const machineIdentity of ["machine.example", "00000000-0000-0000-0000-000000000000"]) {
    assert.throws(() => validation.parseAgentRegistration({
      enrollmentToken: "ng_join_test",
      machineIdentity,
      hostname: "machine.example",
      agentVersion: "0.2.0"
    }), validation.AgentPayloadError);
  }
  assert.throws(() => validation.parseAgentRegistration({
    enrollmentToken: "ng_join_test",
    machineIdentity: "2509c555-0dc8-4764-b0f9-dc60fa38c238",
    replaceExisting: "true",
    hostname: "machine.example",
    agentVersion: "0.2.0"
  }), validation.AgentPayloadError);

  for (const requestedCredential of ["ng_agent_short", `ng_join_${"A".repeat(43)}`, ` ng_agent_${"A".repeat(43)}`]) {
    assert.throws(() => validation.parseAgentRegistration({
      enrollmentToken: "ng_join_test",
      requestedCredential,
      machineIdentity: "2509c555-0dc8-4764-b0f9-dc60fa38c238",
      hostname: "machine.example",
      agentVersion: "0.2.0"
    }), validation.AgentPayloadError);
  }
});

test("legacy heartbeats may omit machine identity while upgraded Agents send a validated UUID", () => {
  const base = {
    agentVersion: "0.2.0",
    processUptimeSeconds: 1,
    timestamp: new Date().toISOString()
  };
  assert.equal(validation.parseAgentHeartbeat(base).machineIdentity, undefined);
  assert.equal(validation.parseAgentHeartbeat({
    ...base,
    machineIdentity: "9ac23db6-614a-423b-ac47-dd0bc25e0354"
  }).machineIdentity, "9ac23db6-614a-423b-ac47-dd0bc25e0354");
  assert.throws(() => validation.parseAgentHeartbeat({ ...base, machineIdentity: "hostname" }), validation.AgentPayloadError);
});

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
