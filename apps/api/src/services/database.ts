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

  CREATE INDEX IF NOT EXISTS idx_alert_history_status ON alert_history(status);
  CREATE INDEX IF NOT EXISTS idx_alert_history_last_seen ON alert_history(last_seen_at);
  CREATE INDEX IF NOT EXISTS idx_domain_check_history_domain_time ON domain_check_history(domain_id, checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_metric_history_server_time ON metric_history(server_id, sampled_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
`);

export function getDatabase() {
  return database;
}

function hasColumn(tableName: string, columnName: string) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return columns.some((column) => column.name === columnName);
}

if (!hasColumn("server_monitors", "allow_insecure_tls")) {
  database.prepare("ALTER TABLE server_monitors ADD COLUMN allow_insecure_tls INTEGER NOT NULL DEFAULT 0").run();
}

if (!hasColumn("metric_history", "swap_usage_percent")) {
  database.prepare("ALTER TABLE metric_history ADD COLUMN swap_usage_percent REAL").run();
}
