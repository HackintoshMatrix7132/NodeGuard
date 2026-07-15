import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

process.env.DATABASE_URL = ":memory:";

const { ensureAgentMachineIdentitySchema, removeLegacyHomeAssistantUpdateSchema } = await import("./database.js");

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
