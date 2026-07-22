import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const encryptionEnvironmentNames = [
  "NODEGUARD_INTEGRATION_ENCRYPTION_KEY",
  "NODEGUARD_SESSION_SECRET",
  "NODEGUARD_AUTH_SECRET",
  "NODEGUARD_INTEGRATION_SECRET"
] as const;

test("a failed encrypted legacy import remains retryable and removes plaintext only after commit", async () => {
  const previousDirectory = process.cwd();
  const previousEnvironment = Object.fromEntries(
    encryptionEnvironmentNames.map((name) => [name, process.env[name]])
  );
  const directory = mkdtempSync(path.join(tmpdir(), "nodeguard-server-monitor-legacy-"));
  const dataDirectory = path.join(directory, "data");
  const legacyFile = path.join(dataDirectory, "server-monitors.json");
  const apiKey = "legacy-plaintext-api-key";
  let authorization: string | undefined;
  const server = http.createServer((request, response) => {
    authorization = request.headers.authorization;
    response.writeHead(200).end();
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  let closeDatabase: (() => void) | undefined;
  try {
    process.chdir(directory);
    process.env.DATABASE_URL = ":memory:";
    for (const name of encryptionEnvironmentNames) delete process.env[name];
    mkdirSync(dataDirectory, { recursive: true });
    writeFileSync(legacyFile, JSON.stringify([{
      id: "legacy-remote",
      name: "Legacy remote",
      backendUrl: origin,
      apiKey,
      allowInsecureTls: false,
      createdAt: "2026-07-22T00:00:00.000Z"
    }]));

    const serverMonitorService = await import("./serverMonitorService.js");
    const databaseService = await import("./database.js");
    closeDatabase = databaseService.closeDatabase;

    await assert.rejects(
      serverMonitorService.listMonitoredServerStatuses(),
      /integration encryption secret is required/
    );
    assert.equal(existsSync(legacyFile), true, "a failed transaction must preserve the only legacy source");
    assert.equal((databaseService.getDatabase().prepare(
      "SELECT COUNT(*) AS count FROM server_monitors"
    ).get() as { count: number }).count, 0);

    process.env.NODEGUARD_INTEGRATION_SECRET = "nodeguard-legacy-import-retry-secret";
    const statuses = await serverMonitorService.listMonitoredServerStatuses();
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0]?.apiKeyPreview, "••••-key");
    assert.equal(authorization, `Bearer ${apiKey}`);
    assert.equal(existsSync(legacyFile), false, "plaintext must be removed after encrypted persistence commits");

    const stored = databaseService.getDatabase().prepare(`
      SELECT api_key, encrypted_api_key, api_key_iv, api_key_tag
      FROM server_monitors WHERE id = 'legacy-remote'
    `).get() as Record<string, string | null>;
    assert.equal(stored.api_key, null);
    assert.ok(stored.encrypted_api_key);
    assert.ok(stored.api_key_iv);
    assert.ok(stored.api_key_tag);
    assert.equal(JSON.stringify(stored).includes(apiKey), false);
  } finally {
    closeDatabase?.();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    process.chdir(previousDirectory);
    for (const name of encryptionEnvironmentNames) {
      const value = previousEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
