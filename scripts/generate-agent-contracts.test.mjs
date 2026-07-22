import assert from "node:assert/strict";
import test from "node:test";

import { findArtifactDrift, renderArtifacts, validateManifest } from "./generate-agent-contracts.mjs";

const manifest = {
  manifestVersion: 1,
  agentApi: {
    basePath: "/api/agent",
    routes: {
      register: "/register",
      status: "/status",
      heartbeat: "/heartbeat",
      inventory: "/inventory",
      metrics: "/metrics",
      docker: "/docker",
      updates: "/updates"
    }
  },
  updates: {
    schemaVersion: 1,
    provider: "apt",
    statuses: ["ok", "unsupported"],
    errorCodes: ["unsupported_os"],
    allowedErrorCodesByStatus: { ok: [], unsupported: ["unsupported_os"] }
  }
};

test("contract generation is deterministic and drift checking only reads artifacts", () => {
  const artifacts = renderArtifacts(manifest);
  const reads = [];
  const current = new Map(artifacts);
  assert.deepEqual(findArtifactDrift(artifacts, (relativePath) => {
    reads.push(relativePath);
    return current.get(relativePath);
  }), []);
  assert.deepEqual(reads, [...artifacts.keys()]);

  current.set("apps/web/src/generated/agentContract.ts", "stale");
  assert.deepEqual(findArtifactDrift(artifacts, (relativePath) => current.get(relativePath)), [
    "apps/web/src/generated/agentContract.ts"
  ]);
});

test("the manifest rejects unmapped error codes and incomplete status mappings", () => {
  assert.throws(() => validateManifest({
    ...manifest,
    updates: {
      ...manifest.updates,
      errorCodes: ["unsupported_os", "check_failed"]
    }
  }), /assigned to exactly one status/);

  assert.throws(() => validateManifest({
    ...manifest,
    updates: {
      ...manifest.updates,
      allowedErrorCodesByStatus: { ok: [] }
    }
  }), /define every update status exactly once/);
});

test("the manifest rejects duplicate Agent endpoint paths", () => {
  assert.throws(() => validateManifest({
    ...manifest,
    agentApi: {
      ...manifest.agentApi,
      routes: {
        ...manifest.agentApi.routes,
        updates: manifest.agentApi.routes.metrics
      }
    }
  }), /must not contain duplicate route suffixes/);
});
