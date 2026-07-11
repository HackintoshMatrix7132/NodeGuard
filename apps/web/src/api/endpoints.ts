import type { AgentDetail, AgentEnrollmentToken, AgentSummary, Alert, AuthSession, Container, CreateAgentEnrollmentInput, CreateContainerMonitorInput, CreateDomainInput, CreateMonitoredServerInput, CreatedAgentEnrollmentToken, DockerSnapshot, DomainCheck, HomeAssistantSettings, HomeAssistantSettingsInput, LoginInput, MetricHistory, MetricHistoryRange, MetricSnapshot, MonitoredServerStatus, Overview, ServerListItem, Server, UpdateCenterSnapshot } from "../types/nodeguard";
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

export function getServerMetricHistory(config: ApiConfig, id: string, range: MetricHistoryRange) {
  return apiFetch<MetricHistory>(config, `/api/servers/${id}/metrics/history?range=${range}`);
}

export function getContainers(config: ApiConfig) {
  return apiFetch<DockerSnapshot>(config, "/api/containers");
}

export function getAgents(config: ApiConfig) {
  return apiFetch<{ agents: AgentSummary[] }>(config, "/api/agents");
}

export function getAgent(config: ApiConfig, id: string) {
  return apiFetch<AgentDetail>(config, `/api/agents/${id}`);
}

export function getAgentEnrollmentTokens(config: ApiConfig) {
  return apiFetch<{ tokens: AgentEnrollmentToken[] }>(config, "/api/agents/enrollment-tokens");
}

export function createAgentEnrollmentToken(config: ApiConfig, input: CreateAgentEnrollmentInput) {
  return apiFetch<CreatedAgentEnrollmentToken>(config, "/api/agents/enrollment-tokens", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function revokeAgentEnrollmentToken(config: ApiConfig, id: string) {
  return apiFetch<{ revoked: boolean }>(config, `/api/agents/enrollment-tokens/${id}`, { method: "DELETE" });
}

export function renameAgent(config: ApiConfig, id: string, displayName: string) {
  return apiFetch<AgentDetail>(config, `/api/agents/${id}`, {
    method: "PUT",
    body: JSON.stringify({ displayName })
  });
}

export function createAgentRotationToken(config: ApiConfig, id: string) {
  return apiFetch<CreatedAgentEnrollmentToken>(config, `/api/agents/${id}/rotate-credential`, { method: "POST" });
}

export function revokeAgent(config: ApiConfig, id: string) {
  return apiFetch<{ revoked: boolean }>(config, `/api/agents/${id}/revoke`, { method: "POST" });
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

export function getContainer(config: ApiConfig, id: string, serverId?: string | null) {
  const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
  return apiFetch<Container>(config, `/api/containers/${id}${query}`);
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

export function removeAlert(config: ApiConfig, id: string) {
  return apiFetch<{ removed: boolean }>(config, `/api/alerts/${id}`, { method: "DELETE" });
}

export function runChecks(config: ApiConfig) {
  return apiFetch<Overview>(config, "/api/checks/run", { method: "POST" });
}

export function getUpdates(config: ApiConfig) {
  return apiFetch<UpdateCenterSnapshot>(config, "/api/updates");
}

export function refreshUpdates(config: ApiConfig) {
  return apiFetch<UpdateCenterSnapshot>(config, "/api/updates/refresh", { method: "POST" });
}

export function getHomeAssistantSettings(config: ApiConfig) {
  return apiFetch<HomeAssistantSettings>(config, "/api/updates/settings/home-assistant");
}

export function saveHomeAssistantSettings(config: ApiConfig, input: HomeAssistantSettingsInput) {
  return apiFetch<HomeAssistantSettings>(config, "/api/updates/settings/home-assistant", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function testHomeAssistantConnection(config: ApiConfig, input: HomeAssistantSettingsInput) {
  return apiFetch<{ connected: boolean; updateEntities: number }>(config, "/api/updates/settings/home-assistant/test", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
