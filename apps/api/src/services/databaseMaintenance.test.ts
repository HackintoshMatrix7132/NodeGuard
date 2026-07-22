import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  verifyNodeGuardDatabase
} from "./databaseMaintenance.js";
import { runDatabaseMaintenanceCli } from "../cli/databaseMaintenance.js";

function createFixture(filePath: string, value: string) {
  const database = new Database(filePath);
  database.pragma("journal_mode = WAL");
  database.pragma("wal_autocheckpoint = 0");
  database.exec(`
    CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE user_sessions (id TEXT PRIMARY KEY);
    CREATE TABLE server_monitors (id TEXT PRIMARY KEY);
    CREATE TABLE container_monitors (id TEXT PRIMARY KEY);
    CREATE TABLE domain_monitors (id TEXT PRIMARY KEY);
    CREATE TABLE configured_domain_deletions (id TEXT PRIMARY KEY);
    CREATE TABLE domain_check_history (id INTEGER PRIMARY KEY);
    CREATE TABLE metric_history (id INTEGER PRIMARY KEY);
    CREATE TABLE alert_history (id TEXT PRIMARY KEY);
    CREATE TABLE alert_deletions (id TEXT PRIMARY KEY);
    CREATE TABLE agents (id TEXT PRIMARY KEY);
    CREATE TABLE agent_enrollment_tokens (id TEXT PRIMARY KEY);
    CREATE TABLE agent_metrics (id INTEGER PRIMARY KEY, agent_id TEXT);
    CREATE TABLE agent_containers (agent_id TEXT, container_id TEXT, PRIMARY KEY (agent_id, container_id));
    CREATE TABLE agent_update_inventories (agent_id TEXT PRIMARY KEY);
    CREATE TABLE agent_package_updates (agent_id TEXT, package_name TEXT, PRIMARY KEY (agent_id, package_name));
    CREATE TABLE proxmox_connections (id TEXT PRIMARY KEY);
    CREATE TABLE proxmox_nodes (connection_id TEXT, node_id TEXT, PRIMARY KEY (connection_id, node_id));
    CREATE TABLE proxmox_guests (connection_id TEXT, guest_id TEXT, PRIMARY KEY (connection_id, guest_id));
    CREATE TABLE proxmox_storage (connection_id TEXT, storage_id TEXT, PRIMARY KEY (connection_id, storage_id));
    CREATE TABLE maintenance_probe (value TEXT NOT NULL);
  `);
  database.prepare("INSERT INTO maintenance_probe (value) VALUES (?)").run(value);
  return database;
}

function readProbe(filePath: string) {
  const database = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    return (database.prepare("SELECT value FROM maintenance_probe").get() as { value: string }).value;
  } finally {
    database.close();
  }
}

test("online backup captures WAL data, verifies it, and refuses to overwrite", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nodeguard-backup-test-"));
  const sourcePath = path.join(directory, "live.sqlite");
  const outputPath = path.join(directory, "backups", "nodeguard.sqlite");
  const source = createFixture(sourcePath, "present-in-live-wal");

  try {
    assert.equal(existsSync(`${sourcePath}-wal`), true, "fixture should exercise an open WAL database");
    const result = await createDatabaseBackup({ database: sourcePath, output: outputPath });
    assert.equal(result.outputPath, outputPath);
    assert.equal(result.foreignKeyViolationCount, 0);
    assert.equal(readProbe(outputPath), "present-in-live-wal");
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    assert.deepEqual(verifyNodeGuardDatabase(outputPath), {
      databasePath: outputPath,
      tableCount: 22,
      foreignKeyViolationCount: 0
    });
    const cliOutput: string[] = [];
    await runDatabaseMaintenanceCli(["verify", "--source", outputPath], (line) => cliOutput.push(line));
    assert.equal((JSON.parse(cliOutput[0]!) as { status: string }).status, "ok");
    await assert.rejects(
      runDatabaseMaintenanceCli(["verify", "--sorce", outputPath]),
      /Unknown option: --sorce/
    );
    await assert.rejects(
      createDatabaseBackup({ database: sourcePath, output: outputPath }),
      /already exists/
    );
  } finally {
    source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restore verifies before replacement, requires confirmation, and preserves a recovery database", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nodeguard-restore-test-"));
  const sourcePath = path.join(directory, "backup.sqlite");
  const targetPath = path.join(directory, "nodeguard.sqlite");
  const recoveryPath = path.join(directory, "recovery.sqlite");
  createFixture(sourcePath, "restored-value").close();
  createFixture(targetPath, "pre-restore-value").close();
  writeFileSync(`${targetPath}-wal`, "stale-wal");
  writeFileSync(`${targetPath}-shm`, "stale-shm");

  try {
    await assert.rejects(
      restoreDatabaseBackup({
        source: sourcePath,
        database: targetPath,
        confirmation: "restore",
        recoveryOutput: recoveryPath
      }),
      /exact confirmation value RESTORE/
    );
    assert.equal(readProbe(targetPath), "pre-restore-value");
    assert.equal(existsSync(recoveryPath), false);

    const result = await restoreDatabaseBackup({
      source: sourcePath,
      database: targetPath,
      confirmation: "RESTORE",
      recoveryOutput: recoveryPath
    });
    assert.equal(result.sourcePath, sourcePath);
    assert.equal(result.recoveryPath, recoveryPath);
    assert.equal(existsSync(`${targetPath}-wal`), false);
    assert.equal(existsSync(`${targetPath}-shm`), false);
    assert.equal(readProbe(targetPath), "restored-value");
    assert.equal(readProbe(recoveryPath), "pre-restore-value");
    assert.equal(statSync(targetPath).mode & 0o777, 0o600);
    assert.equal(statSync(recoveryPath).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a corrupt or non-NodeGuard restore source cannot change the target", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nodeguard-reject-restore-test-"));
  const sourcePath = path.join(directory, "corrupt.sqlite");
  const targetPath = path.join(directory, "nodeguard.sqlite");
  const recoveryPath = path.join(directory, "recovery.sqlite");
  createFixture(targetPath, "must-remain").close();
  writeFileSync(sourcePath, "not a SQLite database");

  try {
    await assert.rejects(
      restoreDatabaseBackup({
        source: sourcePath,
        database: targetPath,
        confirmation: "RESTORE",
        recoveryOutput: recoveryPath
      }),
      /verify SQLite database/
    );
    assert.equal(readProbe(targetPath), "must-remain");
    assert.equal(existsSync(recoveryPath), false);

    const validButWrong = path.join(directory, "wrong.sqlite");
    const wrong = new Database(validButWrong);
    wrong.exec("CREATE TABLE unrelated (id TEXT PRIMARY KEY)");
    wrong.close();
    await assert.rejects(
      restoreDatabaseBackup({
        source: validButWrong,
        database: targetPath,
        confirmation: "RESTORE",
        recoveryOutput: recoveryPath
      }),
      /not a complete NodeGuard database/
    );
    assert.equal(readProbe(targetPath), "must-remain");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restore rejects an otherwise valid snapshot missing an authoritative Proxmox table", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nodeguard-incomplete-restore-test-"));
  const sourcePath = path.join(directory, "incomplete.sqlite");
  const targetPath = path.join(directory, "nodeguard.sqlite");
  const recoveryPath = path.join(directory, "recovery.sqlite");
  createFixture(sourcePath, "incomplete-source").close();
  createFixture(targetPath, "must-remain").close();
  const incomplete = new Database(sourcePath);
  incomplete.prepare("DROP TABLE proxmox_connections").run();
  incomplete.close();

  try {
    await assert.rejects(
      restoreDatabaseBackup({
        source: sourcePath,
        database: targetPath,
        confirmation: "RESTORE",
        recoveryOutput: recoveryPath
      }),
      /missing table\(s\): proxmox_connections/
    );
    assert.equal(readProbe(targetPath), "must-remain");
    assert.equal(existsSync(recoveryPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restore refuses a target that is still open by another process connection", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nodeguard-active-restore-test-"));
  const sourcePath = path.join(directory, "backup.sqlite");
  const targetPath = path.join(directory, "nodeguard.sqlite");
  const recoveryPath = path.join(directory, "recovery.sqlite");
  createFixture(sourcePath, "restored-value").close();
  const activeTarget = createFixture(targetPath, "active-value");

  try {
    await assert.rejects(
      restoreDatabaseBackup({
        source: sourcePath,
        database: targetPath,
        confirmation: "RESTORE",
        recoveryOutput: recoveryPath
      }),
      /busy|still appears to be open/
    );
    assert.equal(readProbe(targetPath), "active-value");
    assert.equal(existsSync(recoveryPath), false);
  } finally {
    activeTarget.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
