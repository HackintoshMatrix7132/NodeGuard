import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATABASE_URL = ":memory:";
process.env.NODEGUARD_INTEGRATION_SECRET = "nodeguard-database-migration-test-secret";

const {
  ensureAgentMachineIdentitySchema,
  ensureAgentUpdateErrorCodeSchema,
  ensureServerMonitorApiKeyEncryptionSchema,
  removeLegacyHomeAssistantUpdateSchema
} = await import("./database.js");
const { decryptIntegrationValue } = await import("./integrationCrypto.js");

test("legacy Home Assistant update tables are removed once without touching unrelated data", () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE integration_settings (id TEXT PRIMARY KEY, base_url TEXT);
    CREATE TABLE update_records (id TEXT PRIMARY KEY, source_id TEXT);
    CREATE TABLE unrelated (id TEXT PRIMARY KEY);
    INSERT INTO integration_settings (id, base_url) VALUES ('home_assistant', 'https://ha.example');
    INSERT INTO update_records (id, source_id) VALUES ('update.test', 'home_assistant');
    INSERT INTO unrelated (id) VALUES ('preserved');
  `);

  assert.equal(removeLegacyHomeAssistantUpdateSchema(database), true);
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'integration_settings'").get(), undefined);
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'update_records'").get(), undefined);
  assert.deepEqual(database.prepare("SELECT id FROM unrelated").get(), { id: "preserved" });
  assert.equal(removeLegacyHomeAssistantUpdateSchema(database), false);
  assert.equal((database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number }).count, 1);
  database.close();
});

test("server monitor API-key migration encrypts legacy plaintext transactionally and is idempotent", () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE server_monitors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      backend_url TEXT NOT NULL,
      api_key TEXT,
      allow_insecure_tls INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    INSERT INTO server_monitors (id, name, backend_url, api_key, created_at)
    VALUES ('remote-a', 'Remote A', 'https://remote.example', 'legacy-secret', '2026-07-22T00:00:00.000Z');
  `);

  assert.equal(ensureServerMonitorApiKeyEncryptionSchema(database), true);
  const stored = database.prepare(`
    SELECT api_key, encrypted_api_key, api_key_iv, api_key_tag
    FROM server_monitors WHERE id = 'remote-a'
  `).get() as {
    api_key: string | null;
    encrypted_api_key: string;
    api_key_iv: string;
    api_key_tag: string;
  };
  assert.equal(stored.api_key, null);
  assert.equal(JSON.stringify(stored).includes("legacy-secret"), false);
  assert.equal(decryptIntegrationValue({
    encrypted: stored.encrypted_api_key,
    iv: stored.api_key_iv,
    tag: stored.api_key_tag
  }), "legacy-secret");

  assert.equal(ensureServerMonitorApiKeyEncryptionSchema(database), false);
  assert.deepEqual(database.prepare(`
    SELECT api_key, encrypted_api_key, api_key_iv, api_key_tag
    FROM server_monitors WHERE id = 'remote-a'
  `).get(), stored);
  assert.equal((database.prepare(`
    SELECT COUNT(*) AS count FROM schema_migrations
    WHERE name = '2026-07-22-encrypt-server-monitor-api-keys'
  `).get() as { count: number }).count, 1);
  database.close();
});

test("server monitor API-key migration checkpoints and securely removes plaintext from SQLite files", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nodeguard-api-key-migration-"));
  const databasePath = path.join(directory, "nodeguard.sqlite");
  const secret = "plaintext-migration-sentinel-4d877d";
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("wal_autocheckpoint = 0");
  database.exec(`
    CREATE TABLE server_monitors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      backend_url TEXT NOT NULL,
      api_key TEXT,
      allow_insecure_tls INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  database.prepare(`
    INSERT INTO server_monitors (id, name, backend_url, api_key, created_at)
    VALUES ('remote-disk', 'Remote disk', 'https://remote.example', ?, '2026-07-22T00:00:00.000Z')
  `).run(secret);

  try {
    const before = [databasePath, `${databasePath}-wal`]
      .filter(existsSync)
      .map((filePath) => readFileSync(filePath))
      .some((contents) => contents.includes(Buffer.from(secret)));
    assert.equal(before, true, "the fixture must begin with a plaintext SQLite/WAL credential");

    assert.equal(ensureServerMonitorApiKeyEncryptionSchema(database), true);
    database.close();
    const after = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]
      .filter(existsSync)
      .map((filePath) => readFileSync(filePath))
      .some((contents) => contents.includes(Buffer.from(secret)));
    assert.equal(after, false);
  } finally {
    if (database.open) database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("server monitor API-key migration rolls back rather than retaining a partial ciphertext", () => {
  const names = [
    "NODEGUARD_INTEGRATION_ENCRYPTION_KEY",
    "NODEGUARD_SESSION_SECRET",
    "NODEGUARD_AUTH_SECRET",
    "NODEGUARD_INTEGRATION_SECRET"
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE server_monitors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      backend_url TEXT NOT NULL,
      api_key TEXT,
      allow_insecure_tls INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    INSERT INTO server_monitors (id, name, backend_url, api_key, created_at)
    VALUES ('remote-b', 'Remote B', 'https://remote.example', 'must-survive-rollback', '2026-07-22T00:00:00.000Z');
  `);

  try {
    for (const name of names) delete process.env[name];
    assert.throws(
      () => ensureServerMonitorApiKeyEncryptionSchema(database),
      /integration encryption secret is required/
    );
    assert.deepEqual(database.prepare("SELECT api_key FROM server_monitors").get(), {
      api_key: "must-survive-rollback"
    });
    const columns = database.prepare("PRAGMA table_info(server_monitors)").all() as { name: string }[];
    assert.equal(columns.some((column) => column.name === "encrypted_api_key"), false);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number }).count, 0);
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    database.close();
  }
});

test("Agent machine identity migration is idempotent and enforces one registration per identity", () => {
  const database = new Database(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      hostname TEXT NOT NULL,
      status TEXT NOT NULL,
      agent_version TEXT NOT NULL,
      credential_hash TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  assert.equal(ensureAgentMachineIdentitySchema(database), true);
  const columns = database.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
  assert.equal(columns.some((column) => column.name === "machine_identity"), true);
  const insert = database.prepare(`
    INSERT INTO agents (
      id, machine_identity, display_name, hostname, status, agent_version, credential_hash,
      registered_at, created_at, updated_at
    ) VALUES (?, ?, 'Machine', 'same-host', 'offline', '0.2.0', 'hash', ?, ?, ?)
  `);
  const timestamp = new Date().toISOString();
  insert.run("agent-a", "166c3022-e455-4a9c-b5a5-0d922c444889", timestamp, timestamp, timestamp);
  assert.throws(
    () => insert.run("agent-b", "166c3022-e455-4a9c-b5a5-0d922c444889", timestamp, timestamp, timestamp),
    /agents\.machine_identity/
  );
  insert.run("legacy-a", null, timestamp, timestamp, timestamp);
  insert.run("legacy-b", null, timestamp, timestamp, timestamp);
  assert.equal(ensureAgentMachineIdentitySchema(database), false);
  assert.equal((database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE name = ?").get("2026-07-15-agent-machine-identity") as { count: number }).count, 1);
  database.close();
});

test("Agent identity migration repairs schema safely when another startup already wrote the marker", () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      hostname TEXT NOT NULL,
      status TEXT NOT NULL,
      agent_version TEXT NOT NULL,
      credential_hash TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations (name, applied_at)
    VALUES ('2026-07-15-agent-machine-identity', '2026-07-15T00:00:00.000Z');
  `);

  assert.equal(ensureAgentMachineIdentitySchema(database), false);
  const columns = database.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
  assert.equal(columns.some((column) => column.name === "machine_identity"), true);
  assert.ok(database.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'index' AND name = 'idx_agents_machine_identity_unique'
  `).get());
  assert.equal((database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number }).count, 1);
  database.close();
});

test("Agent update error-code migration is additive and idempotent", () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE agent_update_inventories (
      agent_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      last_error TEXT
    );
    INSERT INTO agent_update_inventories (agent_id, status, checked_at, last_error)
    VALUES ('agent-existing', 'check_failed', '2026-07-16T00:00:00.000Z', 'Preserved message');
  `);

  assert.equal(ensureAgentUpdateErrorCodeSchema(database), true);
  assert.equal(ensureAgentUpdateErrorCodeSchema(database), false);
  const columns = database.prepare("PRAGMA table_info(agent_update_inventories)").all() as { name: string }[];
  assert.equal(columns.some((column) => column.name === "last_error_code"), true);
  assert.deepEqual(database.prepare(`
    SELECT agent_id, status, checked_at, last_error, last_error_code
    FROM agent_update_inventories
  `).get(), {
    agent_id: "agent-existing", status: "check_failed", checked_at: "2026-07-16T00:00:00.000Z",
    last_error: "Preserved message", last_error_code: null
  });
  database.close();
});
