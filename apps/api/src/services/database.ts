import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../config/env.js";

function resolveDatabasePath(value: string) {
  if (value === ":memory:") {
    return value;
  }

  if (value.startsWith("file://")) {
    return fileURLToPath(value);
  }

  if (value.startsWith("file:")) {
    const filePath = value.slice("file:".length);
    return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  }

  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

const databasePath = resolveDatabasePath(env.databaseUrl);

if (databasePath !== ":memory:") {
  mkdirSync(path.dirname(databasePath), { recursive: true });
}

const database = new Database(databasePath);

database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

database.exec(`
  CREATE TABLE IF NOT EXISTS server_monitors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    backend_url TEXT NOT NULL,
    api_key TEXT,
    allow_insecure_tls INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS container_monitors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    container_ref TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS domain_monitors (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    expected_status_codes TEXT NOT NULL DEFAULT '[200,301,302,401]',
    created_at TEXT NOT NULL,
    last_successful_at TEXT,
    last_failed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS configured_domain_deletions (
    id TEXT PRIMARY KEY,
    deleted_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS domain_check_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id TEXT NOT NULL,
    sample_minute INTEGER NOT NULL,
    healthy INTEGER NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    checked_at TEXT NOT NULL,
    FOREIGN KEY(domain_id) REFERENCES domain_monitors(id) ON DELETE CASCADE,
    UNIQUE(domain_id, sample_minute)
  );

  CREATE TABLE IF NOT EXISTS metric_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    sample_minute INTEGER NOT NULL,
    cpu_usage_percent REAL,
    memory_usage_percent REAL,
    disk_usage_percent REAL,
    swap_usage_percent REAL,
    sampled_at TEXT NOT NULL,
    UNIQUE(server_id, sample_minute)
  );

  CREATE TABLE IF NOT EXISTS alert_history (
    id TEXT PRIMARY KEY,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    affected_resource TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    resolved_at TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    failed_checks TEXT NOT NULL DEFAULT '[]',
    possible_cause TEXT,
    suggested_next_steps TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS alert_deletions (
    id TEXT PRIMARY KEY,
    deleted_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    machine_identity TEXT,
    display_name TEXT NOT NULL,
    hostname TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    agent_version TEXT NOT NULL,
    os_name TEXT,
    os_version TEXT,
    kernel TEXT,
    architecture TEXT,
    cpu_model TEXT,
    physical_core_count INTEGER,
    logical_cpu_count INTEGER,
    total_memory_bytes INTEGER,
    total_swap_bytes INTEGER,
    filesystems_json TEXT NOT NULL DEFAULT '[]',
    ip_addresses_json TEXT NOT NULL DEFAULT '[]',
    boot_time TEXT,
    system_uptime_seconds INTEGER,
    docker_available INTEGER NOT NULL DEFAULT 0,
    docker_version TEXT,
    docker_inventory_hash TEXT,
    credential_hash TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    last_seen_at TEXT,
    last_metrics_at TEXT,
    last_inventory_at TEXT,
    last_docker_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_enrollment_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL DEFAULT 'enroll',
    agent_id TEXT,
    display_name TEXT,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    sample_epoch INTEGER NOT NULL,
    cpu_usage_percent REAL,
    memory_used_bytes INTEGER,
    memory_total_bytes INTEGER,
    memory_usage_percent REAL,
    disk_used_bytes INTEGER,
    disk_total_bytes INTEGER,
    disk_usage_percent REAL,
    swap_used_bytes INTEGER,
    swap_total_bytes INTEGER,
    swap_usage_percent REAL,
    load_average_1 REAL,
    load_average_5 REAL,
    load_average_15 REAL,
    system_uptime_seconds INTEGER,
    sampled_at TEXT NOT NULL,
    FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    UNIQUE(agent_id, sample_epoch)
  );

  CREATE TABLE IF NOT EXISTS agent_containers (
    agent_id TEXT NOT NULL,
    container_id TEXT NOT NULL,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    runtime_state TEXT NOT NULL,
    health TEXT NOT NULL,
    created_at TEXT,
    started_at TEXT,
    uptime_seconds INTEGER,
    restart_count INTEGER,
    stack TEXT,
    ip_addresses_json TEXT NOT NULL DEFAULT '[]',
    networks_json TEXT NOT NULL DEFAULT '[]',
    published_ports_json TEXT NOT NULL DEFAULT '[]',
    container_ports_json TEXT NOT NULL DEFAULT '[]',
    labels_json TEXT NOT NULL DEFAULT '{}',
    cpu_percent REAL,
    memory_used_bytes INTEGER,
    memory_limit_bytes INTEGER,
    reported_at TEXT NOT NULL,
    PRIMARY KEY(agent_id, container_id),
    FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_update_inventories (
    agent_id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL CHECK(schema_version = 1),
    provider TEXT NOT NULL CHECK(provider = 'apt'),
    supported INTEGER NOT NULL CHECK(supported IN (0, 1)),
    status TEXT NOT NULL CHECK(status IN ('ok', 'unsupported', 'package_manager_busy', 'metadata_refresh_failed', 'check_failed')),
    checked_at TEXT NOT NULL,
    last_successful_at TEXT,
    update_count INTEGER NOT NULL DEFAULT 0 CHECK(update_count >= 0),
    security_update_count INTEGER NOT NULL DEFAULT 0 CHECK(security_update_count >= 0 AND security_update_count <= update_count),
    reboot_required INTEGER NOT NULL DEFAULT 0 CHECK(reboot_required IN (0, 1)),
    truncated INTEGER NOT NULL DEFAULT 0 CHECK(truncated IN (0, 1)),
    os_id TEXT,
    os_version_id TEXT,
    os_pretty_name TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_package_updates (
    agent_id TEXT NOT NULL,
    package_name TEXT NOT NULL,
    installed_version TEXT NOT NULL,
    candidate_version TEXT NOT NULL,
    security INTEGER NOT NULL DEFAULT 0 CHECK(security IN (0, 1)),
    source TEXT,
    inventory_checked_at TEXT NOT NULL,
    PRIMARY KEY(agent_id, package_name),
    FOREIGN KEY(agent_id) REFERENCES agent_update_inventories(agent_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_alert_history_status ON alert_history(status);
  CREATE INDEX IF NOT EXISTS idx_alert_history_last_seen ON alert_history(last_seen_at);
  CREATE INDEX IF NOT EXISTS idx_domain_check_history_domain_time ON domain_check_history(domain_id, checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_metric_history_server_time ON metric_history(server_id, sampled_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
  CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen_at);
  CREATE INDEX IF NOT EXISTS idx_agent_enrollment_token_hash ON agent_enrollment_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_agent_enrollment_expires ON agent_enrollment_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_time ON agent_metrics(agent_id, sampled_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_containers_agent ON agent_containers(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_update_inventories_status ON agent_update_inventories(status);
  CREATE INDEX IF NOT EXISTS idx_agent_update_inventories_success ON agent_update_inventories(last_successful_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_package_updates_security ON agent_package_updates(agent_id, security);
`);

export function getDatabase() {
  return database;
}

const removeHomeAssistantUpdatesMigration = "2026-07-14-remove-home-assistant-updates";

export function removeLegacyHomeAssistantUpdateSchema(target: typeof database = database) {
  target.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = target.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get(removeHomeAssistantUpdatesMigration);
  if (applied) return false;

  const migrate = target.transaction(() => {
    target.exec(`
      DROP TABLE IF EXISTS update_records;
      DROP TABLE IF EXISTS integration_settings;
    `);
    target.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
      .run(removeHomeAssistantUpdatesMigration, new Date().toISOString());
  });
  migrate();
  return true;
}

removeLegacyHomeAssistantUpdateSchema();

function hasColumn(tableName: string, columnName: string, target: typeof database = database) {
  const columns = target.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return columns.some((column) => column.name === columnName);
}

const agentMachineIdentityMigration = "2026-07-15-agent-machine-identity";

export function ensureAgentMachineIdentitySchema(target: typeof database = database) {
  target.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const migrate = target.transaction(() => {
    if (!hasColumn("agents", "machine_identity", target)) {
      target.prepare("ALTER TABLE agents ADD COLUMN machine_identity TEXT").run();
    }
    target.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_machine_identity_unique
      ON agents(machine_identity)
      WHERE machine_identity IS NOT NULL
    `);
    const marker = target.prepare("INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)")
      .run(agentMachineIdentityMigration, new Date().toISOString());
    return marker.changes === 1;
  });
  return migrate.immediate();
}

ensureAgentMachineIdentitySchema();

if (!hasColumn("server_monitors", "allow_insecure_tls")) {
  database.prepare("ALTER TABLE server_monitors ADD COLUMN allow_insecure_tls INTEGER NOT NULL DEFAULT 0").run();
}

if (!hasColumn("metric_history", "swap_usage_percent")) {
  database.prepare("ALTER TABLE metric_history ADD COLUMN swap_usage_percent REAL").run();
}

if (!hasColumn("users", "data_mode")) {
  database.prepare("ALTER TABLE users ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'live'").run();
}
