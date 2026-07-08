import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Container, ContainerMonitor, ContainerMonitorStatus, CreateContainerMonitorInput, DockerSnapshot } from "../types/nodeguard.js";

const dataDir = path.resolve(process.cwd(), "data");
const dataFile = path.join(dataDir, "container-monitors.json");

function createId(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "container"}-${Date.now().toString(36)}`;
}

async function readStoredMonitors(): Promise<ContainerMonitor[]> {
  try {
    const raw = await readFile(dataFile, "utf8");
    return JSON.parse(raw) as ContainerMonitor[];
  } catch {
    return [];
  }
}

async function writeStoredMonitors(monitors: ContainerMonitor[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(monitors, null, 2)}\n`, "utf8");
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
  const monitors = await readStoredMonitors();
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
  const monitors = await readStoredMonitors();
  const monitor: ContainerMonitor = {
    id: createId(values.name),
    ...values,
    createdAt: new Date().toISOString()
  };
  await writeStoredMonitors([...monitors, monitor]);
  return monitor;
}

export async function updateContainerMonitor(id: string, input: CreateContainerMonitorInput) {
  const values = validateInput(input);
  const monitors = await readStoredMonitors();
  const existingMonitor = monitors.find((monitor) => monitor.id === id);
  if (!existingMonitor) {
    return null;
  }

  const updatedMonitor: ContainerMonitor = { ...existingMonitor, ...values };
  await writeStoredMonitors(monitors.map((monitor) => (monitor.id === id ? updatedMonitor : monitor)));
  return updatedMonitor;
}

export async function removeContainerMonitor(id: string) {
  const monitors = await readStoredMonitors();
  const nextMonitors = monitors.filter((monitor) => monitor.id !== id);
  await writeStoredMonitors(nextMonitors);
  return { removed: nextMonitors.length !== monitors.length };
}
