import Database from "better-sqlite3";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const requiredNodeGuardTables = [
  "agent_containers",
  "agent_enrollment_tokens",
  "agent_metrics",
  "agent_package_updates",
  "agent_update_inventories",
  "agents",
  "alert_deletions",
  "alert_history",
  "configured_domain_deletions",
  "container_monitors",
  "domain_check_history",
  "domain_monitors",
  "metric_history",
  "proxmox_connections",
  "proxmox_guests",
  "proxmox_nodes",
  "proxmox_storage",
  "schema_migrations",
  "server_monitors",
  "user_sessions",
  "users"
] as const;
const restoreConfirmation = "RESTORE";

export class DatabaseMaintenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseMaintenanceError";
  }
}

export type DatabaseVerification = {
  databasePath: string;
  tableCount: number;
  foreignKeyViolationCount: number;
};

export type DatabaseBackupResult = DatabaseVerification & {
  outputPath: string;
};

export type DatabaseRestoreResult = DatabaseVerification & {
  sourcePath: string;
  recoveryPath: string;
};

export function resolveSqliteFile(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ":memory:") {
    throw new DatabaseMaintenanceError("Database maintenance requires an on-disk SQLite database path.");
  }
  if (trimmed.startsWith("file://")) return fileURLToPath(trimmed);
  if (trimmed.startsWith("file:")) {
    const filePath = trimmed.slice("file:".length);
    return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}

function existingRegularFile(value: string, label: string): string {
  const filePath = resolveSqliteFile(value);
  if (!existsSync(filePath)) {
    throw new DatabaseMaintenanceError(`${label} does not exist: ${filePath}`);
  }
  const details = lstatSync(filePath);
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new DatabaseMaintenanceError(`${label} must be a regular file and not a symbolic link: ${filePath}`);
  }
  return filePath;
}

function checkRows(database: Database.Database, pragma: "integrity_check" | "foreign_key_check") {
  return database.pragma(pragma) as Array<Record<string, unknown>>;
}

export function verifyNodeGuardDatabase(value: string): DatabaseVerification {
  const databasePath = existingRegularFile(value, "SQLite database");
  let database: Database.Database | null = null;
  try {
    database = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 5000 });
    const integrity = checkRows(database, "integrity_check")
      .flatMap((row) => Object.values(row))
      .map(String);
    if (integrity.length !== 1 || integrity[0]?.toLowerCase() !== "ok") {
      throw new DatabaseMaintenanceError(`SQLite integrity check failed: ${integrity.join("; ") || "unknown failure"}`);
    }

    const foreignKeyViolations = checkRows(database, "foreign_key_check");
    if (foreignKeyViolations.length > 0) {
      throw new DatabaseMaintenanceError(
        `SQLite foreign-key check found ${foreignKeyViolations.length} violation(s).`
      );
    }

    const tables = new Set((database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table'
    `).all() as Array<{ name: string }>).map((row) => row.name));
    const missing = requiredNodeGuardTables.filter((table) => !tables.has(table));
    if (missing.length > 0) {
      throw new DatabaseMaintenanceError(
        `The SQLite file is not a complete NodeGuard database; missing table(s): ${missing.join(", ")}.`
      );
    }

    return {
      databasePath,
      tableCount: tables.size,
      foreignKeyViolationCount: 0
    };
  } catch (error) {
    if (error instanceof DatabaseMaintenanceError) throw error;
    const message = error instanceof Error ? error.message : "unknown SQLite error";
    throw new DatabaseMaintenanceError(`Unable to verify SQLite database: ${message}`);
  } finally {
    database?.close();
  }
}

function uniqueSibling(filePath: string, purpose: string) {
  return `${filePath}.${purpose}-${process.pid}-${randomUUID()}`;
}

function unlinkIfPresent(filePath: string) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function unlinkTemporaryDatabase(filePath: string) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    unlinkIfPresent(`${filePath}${suffix}`);
  }
}

function syncFile(filePath: string) {
  const descriptor = openSync(filePath, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function syncDirectory(directory: string) {
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function prepareNewFile(filePath: string, label: string) {
  if (existsSync(filePath)) {
    throw new DatabaseMaintenanceError(`${label} already exists; choose a new path: ${filePath}`);
  }
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

function publishNewFile(stagedPath: string, outputPath: string) {
  let published = false;
  try {
    linkSync(stagedPath, outputPath);
    published = true;
    unlinkIfPresent(stagedPath);
    syncDirectory(path.dirname(outputPath));
  } catch (error) {
    if (published) unlinkIfPresent(outputPath);
    throw error;
  }
}

function finalizeDatabaseSnapshot(destinationPath: string) {
  let destination: Database.Database | null = null;
  try {
    destination = new Database(destinationPath, { fileMustExist: true, timeout: 5000 });
    destination.pragma("wal_checkpoint(TRUNCATE)");
    destination.pragma("journal_mode = DELETE");
  } finally {
    destination?.close();
  }
  chmodSync(destinationPath, 0o600);
  verifyNodeGuardDatabase(destinationPath);
  syncFile(destinationPath);
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    unlinkIfPresent(`${destinationPath}${suffix}`);
  }
}

async function snapshotDatabase(sourcePath: string, destinationPath: string) {
  let source: Database.Database | null = null;
  try {
    source = new Database(sourcePath, { readonly: true, fileMustExist: true, timeout: 5000 });
    await source.backup(destinationPath);
  } finally {
    source?.close();
  }
  finalizeDatabaseSnapshot(destinationPath);
}

export async function createDatabaseBackup(options: {
  database: string;
  output: string;
}): Promise<DatabaseBackupResult> {
  const databasePath = existingRegularFile(options.database, "Source database");
  const outputPath = resolveSqliteFile(options.output);
  if (databasePath === outputPath) {
    throw new DatabaseMaintenanceError("Backup output must differ from the source database.");
  }
  prepareNewFile(outputPath, "Backup output");
  const stagedPath = uniqueSibling(outputPath, "partial");

  try {
    await snapshotDatabase(databasePath, stagedPath);
    publishNewFile(stagedPath, outputPath);
    const verification = verifyNodeGuardDatabase(outputPath);
    return { ...verification, outputPath };
  } catch (error) {
    unlinkTemporaryDatabase(stagedPath);
    throw error;
  }
}

function timestampSuffix(now: Date) {
  return now.toISOString().replace(/[:.]/g, "-");
}

function checkpointTarget(database: Database.Database) {
  const result = database.pragma("wal_checkpoint(TRUNCATE)") as Array<{
    busy?: number;
    log?: number;
    checkpointed?: number;
  }>;
  if ((result[0]?.busy ?? 0) !== 0) {
    throw new DatabaseMaintenanceError(
      "The target database is busy. Stop NodeGuard before restoring and try again."
    );
  }
}

export async function restoreDatabaseBackup(options: {
  source: string;
  database: string;
  confirmation: string;
  recoveryOutput?: string;
  now?: Date;
}): Promise<DatabaseRestoreResult> {
  if (options.confirmation !== restoreConfirmation) {
    throw new DatabaseMaintenanceError(`Restore requires the exact confirmation value ${restoreConfirmation}.`);
  }

  const sourcePath = existingRegularFile(options.source, "Restore source");
  verifyNodeGuardDatabase(sourcePath);
  const databasePath = existingRegularFile(options.database, "Target database");
  if (sourcePath === databasePath) {
    throw new DatabaseMaintenanceError("Restore source must differ from the target database.");
  }
  const recoveryPath = resolveSqliteFile(
    options.recoveryOutput ?? `${databasePath}.pre-restore-${timestampSuffix(options.now ?? new Date())}`
  );
  if (recoveryPath === sourcePath || recoveryPath === databasePath) {
    throw new DatabaseMaintenanceError("Recovery output must differ from the source and target databases.");
  }
  prepareNewFile(recoveryPath, "Recovery output");

  const stagedRestorePath = uniqueSibling(databasePath, "restore");
  const stagedRecoveryPath = uniqueSibling(recoveryPath, "partial");
  let recoveryCommitted = false;

  try {
    await snapshotDatabase(sourcePath, stagedRestorePath);

    let target: Database.Database | null = null;
    try {
      target = new Database(databasePath, { fileMustExist: true, timeout: 1000 });
      checkpointTarget(target);
      await target.backup(stagedRecoveryPath);
    } finally {
      target?.close();
    }
    finalizeDatabaseSnapshot(stagedRecoveryPath);

    if (existsSync(`${databasePath}-shm`)) {
      throw new DatabaseMaintenanceError(
        "The target database still appears to be open. Stop NodeGuard before restoring and try again."
      );
    }

    publishNewFile(stagedRecoveryPath, recoveryPath);
    recoveryCommitted = true;

    for (const suffix of ["-wal", "-shm", "-journal"]) {
      unlinkIfPresent(`${databasePath}${suffix}`);
    }
    renameSync(stagedRestorePath, databasePath);
    chmodSync(databasePath, 0o600);
    syncFile(databasePath);
    syncDirectory(path.dirname(databasePath));

    const verification = verifyNodeGuardDatabase(databasePath);
    return { ...verification, sourcePath, recoveryPath };
  } catch (error) {
    unlinkTemporaryDatabase(stagedRestorePath);
    unlinkTemporaryDatabase(stagedRecoveryPath);
    if (recoveryCommitted) {
      const message = error instanceof Error ? error.message : "unknown restore failure";
      throw new DatabaseMaintenanceError(
        `Restore failed after preserving the previous database at ${recoveryPath}: ${message}`
      );
    }
    throw error;
  }
}
