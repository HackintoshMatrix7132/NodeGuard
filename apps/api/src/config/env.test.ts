import assert from "node:assert/strict";
import test from "node:test";

import { parseAgentUpdateIntervalSeconds, parseProxmoxSyncIntervalSeconds } from "./env.js";

test("Proxmox sync interval defaults safely to 30 seconds", () => {
  assert.equal(parseProxmoxSyncIntervalSeconds(undefined), 30);
  assert.equal(parseProxmoxSyncIntervalSeconds(""), 30);
  assert.equal(parseProxmoxSyncIntervalSeconds("invalid"), 30);
  assert.equal(parseProxmoxSyncIntervalSeconds("NaN"), 30);
  assert.equal(parseProxmoxSyncIntervalSeconds("Infinity"), 30);
});

test("Proxmox sync interval enforces its minimum and accepts slower intervals", () => {
  assert.equal(parseProxmoxSyncIntervalSeconds("1"), 30);
  assert.equal(parseProxmoxSyncIntervalSeconds("29"), 30);
  assert.equal(parseProxmoxSyncIntervalSeconds("30"), 30);
  assert.equal(parseProxmoxSyncIntervalSeconds("60"), 60);
  assert.equal(parseProxmoxSyncIntervalSeconds("300"), 300);
});

test("Agent update interval defaults to six hours and rejects unsafe values", () => {
  assert.equal(parseAgentUpdateIntervalSeconds(undefined), 21600);
  assert.equal(parseAgentUpdateIntervalSeconds(""), 21600);
  assert.equal(parseAgentUpdateIntervalSeconds("invalid"), 21600);
  assert.equal(parseAgentUpdateIntervalSeconds("Infinity"), 21600);
  assert.equal(parseAgentUpdateIntervalSeconds("60"), 900);
  assert.equal(parseAgentUpdateIntervalSeconds("899"), 900);
  assert.equal(parseAgentUpdateIntervalSeconds("900"), 900);
  assert.equal(parseAgentUpdateIntervalSeconds("21600"), 21600);
});
