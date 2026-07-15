import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentCommand } from "./agentCommand";

test("new installations use the secure installer prompt without embedding a token", () => {
  const command = buildAgentCommand({
    serverUrl: "https://nodeguard.example.test",
    displayName: "docker-main",
    rotation: false,
  });

  assert.match(command, /^curl -fsSL /);
  assert.match(command, /install-agent\.sh/);
  assert.match(command, /--server 'https:\/\/nodeguard\.example\.test'/);
  assert.doesNotMatch(command, /--token/);
});

test("credential rotation securely supports v0.2 register and v0.3 compatibility alias", () => {
  const command = buildAgentCommand({
    serverUrl: "https://nodeguard.example.test",
    displayName: "host 'one'",
    rotation: true,
  });

  assert.match(command, /^sudo bash -c /);
  assert.match(command, /read -rsp/);
  assert.match(command, /NODEGUARD_ENROLLMENT_TOKEN/);
  assert.match(command, /nodeguard-agent register --server "\$1" --name "\$2"/);
  assert.match(command, /register[\s\S]*unset NODEGUARD_ENROLLMENT_TOKEN && systemctl restart nodeguard-agent/);
  assert.match(command, /'https:\/\/nodeguard\.example\.test'/);
  assert.doesNotMatch(command, /--token/);
  assert.doesNotMatch(command, /re-enroll/);
});
