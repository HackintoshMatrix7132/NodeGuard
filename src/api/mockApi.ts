import { mockAlerts, mockContainers, mockDomains, mockMetrics, mockOverview, mockServer } from "@/data/mockData";
import type { Alert, Container, DomainCheck, MetricSnapshot, Overview, Server } from "@/types/nodeguard";

const delay = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));

export type ValidationResult = {
  ok: true;
  backendName: string;
  checkedAt: string;
};

export async function validateConnection(backendUrl: string, apiKey: string): Promise<ValidationResult> {
  await delay(650);

  if (!backendUrl.trim()) {
    throw new Error("Enter a backend URL.");
  }

  try {
    const parsed = new URL(backendUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Use http:// or https:// for the backend URL.");
    }
  } catch {
    throw new Error("Enter a valid backend URL.");
  }

  if (apiKey.trim().length < 8) {
    throw new Error("Use an API key with at least 8 characters.");
  }

  return {
    ok: true,
    backendName: "NodeGuard Mock API",
    checkedAt: new Date().toISOString()
  };
}

export async function getOverview(): Promise<Overview> {
  await delay();
  return mockOverview;
}

export async function getServers(): Promise<Server[]> {
  await delay();
  return [mockServer];
}

export async function getServer(id: string): Promise<Server> {
  await delay();
  if (id !== mockServer.id) {
    throw new Error("Server not found.");
  }

  return mockServer;
}

export async function getServerMetrics(id: string): Promise<MetricSnapshot> {
  await delay();
  if (id !== mockServer.id) {
    throw new Error("Metrics unavailable for this server.");
  }

  return mockMetrics;
}

export async function getContainers(): Promise<Container[]> {
  await delay();
  return mockContainers;
}

export async function getContainer(id: string): Promise<Container> {
  await delay();
  const container = mockContainers.find((item) => item.id === id);

  if (!container) {
    throw new Error("Container not found.");
  }

  return container;
}

export async function getDomains(): Promise<DomainCheck[]> {
  await delay();
  return mockDomains;
}

export async function getAlerts(): Promise<Alert[]> {
  await delay();
  return mockAlerts;
}

export async function getAlert(id: string): Promise<Alert> {
  await delay();
  const alert = mockAlerts.find((item) => item.id === id);

  if (!alert) {
    throw new Error("Alert not found.");
  }

  return alert;
}

export async function runChecks(): Promise<Overview> {
  await delay(850);
  return {
    ...mockOverview,
    lastCheckedAt: new Date().toISOString()
  };
}
