import "dotenv/config";
import { pathToFileURL } from "node:url";

import {
  createDatabaseBackup,
  DatabaseMaintenanceError,
  restoreDatabaseBackup,
  verifyNodeGuardDatabase
} from "../services/databaseMaintenance.js";

const usage = `NodeGuard SQLite maintenance

Usage:
  databaseMaintenance backup --output <file> [--database <file-or-DATABASE_URL>]
  databaseMaintenance verify --source <file>
  databaseMaintenance restore --source <file> [--database <file-or-DATABASE_URL>]
    --confirm RESTORE [--recovery-output <file>]

Restore is destructive and must run while the NodeGuard API is stopped. It verifies
the source first and preserves a verified pre-restore database copy before replacement.`;

type FlagName = "database" | "output" | "source" | "confirm" | "recovery-output";

function parseFlags(arguments_: string[], allowed: ReadonlySet<FlagName>) {
  const flags = new Map<FlagName, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (!argument.startsWith("--")) {
      throw new DatabaseMaintenanceError(`Unexpected argument: ${argument}`);
    }
    const [rawName, inlineValue] = argument.slice(2).split("=", 2);
    const name = rawName as FlagName;
    if (!allowed.has(name)) {
      throw new DatabaseMaintenanceError(`Unknown option: --${rawName}`);
    }
    if (flags.has(name)) {
      throw new DatabaseMaintenanceError(`Option may be provided only once: --${name}`);
    }
    const value = inlineValue ?? arguments_[index + 1];
    if (!value || (!inlineValue && value.startsWith("--"))) {
      throw new DatabaseMaintenanceError(`Option requires a value: --${name}`);
    }
    if (inlineValue === undefined) index += 1;
    flags.set(name, value);
  }
  return flags;
}

function required(flags: Map<FlagName, string>, name: FlagName) {
  const value = flags.get(name);
  if (!value) throw new DatabaseMaintenanceError(`Missing required option: --${name}`);
  return value;
}

function configuredDatabase(flags: Map<FlagName, string>) {
  return flags.get("database") ?? process.env.DATABASE_URL ?? "file:data/nodeguard.sqlite";
}

export async function runDatabaseMaintenanceCli(
  arguments_: string[],
  write: (line: string) => void = console.log
) {
  const [command, ...rawFlags] = arguments_;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    write(usage);
    return;
  }

  if (command === "backup") {
    const flags = parseFlags(rawFlags, new Set<FlagName>(["database", "output"]));
    const result = await createDatabaseBackup({
      database: configuredDatabase(flags),
      output: required(flags, "output")
    });
    write(JSON.stringify({ operation: "backup", status: "ok", ...result }, null, 2));
    return;
  }

  if (command === "verify") {
    const flags = parseFlags(rawFlags, new Set<FlagName>(["source"]));
    const result = verifyNodeGuardDatabase(required(flags, "source"));
    write(JSON.stringify({ operation: "verify", status: "ok", ...result }, null, 2));
    return;
  }

  if (command === "restore") {
    const flags = parseFlags(
      rawFlags,
      new Set<FlagName>(["database", "source", "confirm", "recovery-output"])
    );
    const result = await restoreDatabaseBackup({
      source: required(flags, "source"),
      database: configuredDatabase(flags),
      confirmation: required(flags, "confirm"),
      ...(flags.has("recovery-output") ? { recoveryOutput: flags.get("recovery-output")! } : {})
    });
    write(JSON.stringify({ operation: "restore", status: "ok", ...result }, null, 2));
    return;
  }

  throw new DatabaseMaintenanceError(`Unknown command: ${command}\n\n${usage}`);
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  runDatabaseMaintenanceCli(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown database maintenance failure.";
    console.error(`NodeGuard database maintenance failed: ${message}`);
    process.exitCode = 1;
  });
}
