import assert from "node:assert/strict";
import test from "node:test";

import { getDemoProxmoxSnapshot } from "./proxmoxService.js";

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
  assert.ok(serialized.length > 200);
  assert.doesNotMatch(serialized, /muthu\.eu/i);
  assert.doesNotMatch(serialized, /192\.168\.178\./);
});
