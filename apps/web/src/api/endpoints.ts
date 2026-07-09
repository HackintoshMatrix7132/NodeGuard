import type { Alert, AuthSession, Container, CreateContainerMonitorInput, CreateDomainInput, CreateMonitoredServerInput, DockerSnapshot, DomainCheck, LoginInput, MetricSnapshot, MonitoredServerStatus, Overview, ServerListItem, Server } from "../types/nodeguard";
import type { ApiConfig } from "./client";
import { apiFetch } from "./client";

export function login(config: ApiConfig, input: LoginInput) {
  return apiFetch<AuthSession>(config, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getCurrentSession(config: ApiConfig) {
  return apiFetch<AuthSession>(config, "/api/auth/me");
}

export function logout(config: ApiConfig) {
  return apiFetch<{ ok: boolean }>(config, "/api/auth/logout", { method: "POST" });
}

export function getOverview(config: ApiConfig) {
  return apiFetch<Overview>(config, "/api/overview");
}

export function getServers(config: ApiConfig) {
  return apiFetch<ServerListItem[]>(config, "/api/servers");
}

export function getServerMonitors(config: ApiConfig) {
  return apiFetch<MonitoredServerStatus[]>(config, "/api/servers/monitors");
}

export function addServerMonitor(config: ApiConfig, input: CreateMonitoredServerInput) {
  return apiFetch<MonitoredServerStatus>(config, "/api/servers/monitors", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateServerMonitor(config: ApiConfig, id: string, input: CreateMonitoredServerInput) {
  return apiFetch<MonitoredServerStatus>(config, `/api/servers/monitors/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function removeServerMonitor(config: ApiConfig, id: string) {
  return apiFetch<{ removed: boolean }>(config, `/api/servers/monitors/${id}`, { method: "DELETE" });
}

export function getServer(config: ApiConfig, id: string) {
  return apiFetch<Server>(config, `/api/servers/${id}`);
}

export function getServerMetrics(config: ApiConfig, id: string) {
  return apiFetch<MetricSnapshot>(config, `/api/servers/${id}/metrics`);
}

export function getContainers(config: ApiConfig) {
  return apiFetch<DockerSnapshot>(config, "/api/containers");
}

export function addContainerMonitor(config: ApiConfig, input: CreateContainerMonitorInput) {
  return apiFetch<DockerSnapshot["containerMonitors"]>(config, "/api/containers/monitors", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateContainerMonitor(config: ApiConfig, id: string, input: CreateContainerMonitorInput) {
  return apiFetch<DockerSnapshot["containerMonitors"]>(config, `/api/containers/monitors/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function removeContainerMonitor(config: ApiConfig, id: string) {
  return apiFetch<{ removed: boolean }>(config, `/api/containers/monitors/${id}`, { method: "DELETE" });
}

export function getContainer(config: ApiConfig, id: string) {
  return apiFetch<Container>(config, `/api/containers/${id}`);
}

export function getDomains(config: ApiConfig) {
  return apiFetch<DomainCheck[]>(config, "/api/domains");
}

export function addDomain(config: ApiConfig, input: CreateDomainInput) {
  return apiFetch<DomainCheck[]>(config, "/api/domains", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateDomain(config: ApiConfig, id: string, input: CreateDomainInput) {
  return apiFetch<DomainCheck[]>(config, `/api/domains/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function removeDomain(config: ApiConfig, id: string) {
  return apiFetch<{ removed: boolean }>(config, `/api/domains/${id}`, { method: "DELETE" });
}

export function getAlerts(config: ApiConfig, status: "active" | "resolved" | "all" = "active") {
  const query = status === "active" ? "" : `?status=${status}`;
  return apiFetch<Alert[]>(config, `/api/alerts${query}`);
}

export function getAlert(config: ApiConfig, id: string) {
  return apiFetch<Alert>(config, `/api/alerts/${id}`);
}

export function runChecks(config: ApiConfig) {
  return apiFetch<Overview>(config, "/api/checks/run", { method: "POST" });
}
