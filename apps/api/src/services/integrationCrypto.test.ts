import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptIntegrationValue,
  encryptIntegrationValue,
} from "./integrationCrypto.js";

const TEST_KEY = "nodeguard-test-integration-key-that-is-long-enough";

test("integration credentials are encrypted and can be decrypted", () => {
  const previousKey = process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY;
  process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY = TEST_KEY;

  try {
    const plaintext = "pve-secret-value";
    const encrypted = encryptIntegrationValue(plaintext);
    const serialized = JSON.stringify(encrypted);

    assert.equal(serialized.includes(plaintext), false);
    assert.equal(decryptIntegrationValue(encrypted), plaintext);
  } finally {
    if (previousKey === undefined) {
      delete process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY;
    } else {
      process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY = previousKey;
    }
  }
});

test("integration credentials cannot be decrypted with another key", () => {
  const previousKey = process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY;
  process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY = TEST_KEY;

  try {
    const encrypted = encryptIntegrationValue("pve-secret-value");
    process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY =
      "a-different-nodeguard-test-integration-key-value";

    assert.throws(() => decryptIntegrationValue(encrypted));
  } finally {
    if (previousKey === undefined) {
      delete process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY;
    } else {
      process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY = previousKey;
    }
  }
});

test("the standard integration secret encrypts Proxmox credentials", () => {
  const names = [
    "NODEGUARD_INTEGRATION_ENCRYPTION_KEY",
    "NODEGUARD_SESSION_SECRET",
    "NODEGUARD_AUTH_SECRET",
    "NODEGUARD_INTEGRATION_SECRET",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  try {
    for (const name of names) delete process.env[name];
    process.env.NODEGUARD_INTEGRATION_SECRET = TEST_KEY;
    const encrypted = encryptIntegrationValue("pve-secret-value");
    assert.equal(decryptIntegrationValue(encrypted), "pve-secret-value");
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
