import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Container, ContainerMonitor, ContainerMonitorStatus, CreateContainerMonitorInput, DockerSnapshot } from "../types/nodeguard.js";
import { getDatabase } from "./database.js";

type ContainerMonitorRow = {
  id: string;
  name: string;
  container_ref: string;
  created_at: string;
};

const database = getDatabase();
const legacyDataFile = path.resolve(process.cwd(), "data", "container-monitors.json");
let legacyImported = false;

function createId(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "container"}-${Date.now().toString(36)}`;
}

function rowToMonitor(row: ContainerMonitorRow): ContainerMonitor {
  return {
    id: row.id,
    name: row.name,
    containerRef: row.container_ref,
    createdAt: row.created_at
  };
}

function ensureLegacyImport() {
  if (legacyImported) {
    return;
  }

  legacyImported = true;
  const count = database.prepare("SELECT COUNT(*) AS count FROM container_monitors").get() as { count: number };
  if (count.count > 0 || !existsSync(legacyDataFile)) {
    return;
  }

  try {
    const monitors = JSON.parse(readFileSync(legacyDataFile, "utf8")) as ContainerMonitor[];
    const insert = database.prepare(`
      INSERT OR IGNORE INTO container_monitors (id, name, container_ref, created_at)
      VALUES (@id, @name, @containerRef, @createdAt)
    `);
    const importMonitors = database.transaction((items: ContainerMonitor[]) => {
      for (const monitor of items) {
        insert.run({
          id: monitor.id,
          name: monitor.name,
          containerRef: monitor.containerRef,
          createdAt: monitor.createdAt ?? new Date().toISOString()
        });
      }
    });
    importMonitors(monitors);
  } catch {
    // Ignore unreadable legacy files; the SQLite database is authoritative.
  }
}

function readStoredMonitors(): ContainerMonitor[] {
  ensureLegacyImport();
  const rows = database.prepare("SELECT * FROM container_monitors ORDER BY created_at ASC").all() as ContainerMonitorRow[];
  return rows.map(rowToMonitor);
}

function validateInput(input: CreateContainerMonitorInput) {
  const name = input.name.trim();
  const containerRef = input.containerRef.trim();
  if (!name) {
    throw new Error("Monitor name is required.");
  }
  if (!containerRef) {
    throw new Error("Container name or ID is required.");
  }

  return { name, containerRef };
}

function findContainer(containers: Container[], containerRef: string) {
  const query = containerRef.toLowerCase();
  return containers.find((container) =>
    container.id.toLowerCase().startsWith(query) ||
    container.name.toLowerCase() === query ||
    container.name.toLowerCase().includes(query)
  );
}

export async function listContainerMonitors() {
  return readStoredMonitors();
}

export async function listContainerMonitorStatuses(docker: Pick<DockerSnapshot, "dockerAvailable" | "containers" | "message">): Promise<ContainerMonitorStatus[]> {
  const monitors = readStoredMonitors();
  const now = new Date().toISOString();

  return monitors.map((monitor) => {
    if (!docker.dockerAvailable) {
      return {
        id: monitor.id,
        name: monitor.name,
        containerRef: monitor.containerRef,
        status: "offline",
        matchedContainerId: null,
        matchedContainerName: null,
        lastCheckedAt: now,
        lastError: docker.message ?? "Docker is unavailable."
      };
    }

    const matchedContainer = findContainer(docker.containers, monitor.containerRef);
    if (!matchedContainer) {
      return {
        id: monitor.id,
        name: monitor.name,
        containerRef: monitor.containerRef,
        status: "offline",
        matchedContainerId: null,
        matchedContainerName: null,
        lastCheckedAt: now,
        lastError: "Container was not found."
      };
    }

    return {
      id: monitor.id,
      name: monitor.name,
      containerRef: monitor.containerRef,
      status: matchedContainer.status === "running" && matchedContainer.health !== "unhealthy" ? "healthy" : matchedContainer.status === "running" ? "warning" : "offline",
      matchedContainerId: matchedContainer.id,
      matchedContainerName: matchedContainer.name,
      lastCheckedAt: now,
      lastError: matchedContainer.status === "running" && matchedContainer.health !== "unhealthy" ? null : `Container is ${matchedContainer.status} with health ${matchedContainer.health}.`
    };
  });
}

export async function addContainerMonitor(input: CreateContainerMonitorInput) {
  const values = validateInput(input);
  const monitor: ContainerMonitor = {
    id: createId(values.name),
    ...values,
    createdAt: new Date().toISOString()
  };
  ensureLegacyImport();
  database.prepare(`
    INSERT INTO container_monitors (id, name, container_ref, created_at)
    VALUES (@id, @name, @containerRef, @createdAt)
  `).run({
    id: monitor.id,
    name: monitor.name,
    containerRef: monitor.containerRef,
    createdAt: monitor.createdAt
  });
  return monitor;
}

export async function updateContainerMonitor(id: string, input: CreateContainerMonitorInput) {
  const values = validateInput(input);
  ensureLegacyImport();
  const existingMonitor = database.prepare("SELECT * FROM container_monitors WHERE id = ?").get(id) as ContainerMonitorRow | undefined;
  if (!existingMonitor) {
    return null;
  }

  const updatedMonitor: ContainerMonitor = { ...rowToMonitor(existingMonitor), ...values };
  database.prepare(`
    UPDATE container_monitors
    SET name = @name, container_ref = @containerRef
    WHERE id = @id
  `).run({
    id,
    name: updatedMonitor.name,
    containerRef: updatedMonitor.containerRef
  });
  return updatedMonitor;
}

export async function removeContainerMonitor(id: string) {
  ensureLegacyImport();
  const result = database.prepare("DELETE FROM container_monitors WHERE id = ?").run(id);
  return { removed: result.changes > 0 };
}
