import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

process.env.DATABASE_URL = ":memory:";

const { removeLegacyHomeAssistantUpdateSchema } = await import("./database.js");

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
