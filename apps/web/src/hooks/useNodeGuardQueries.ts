import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addContainerMonitor,
  addDomain,
  addServerMonitor,
  createAgentEnrollmentToken,
  createAgentRotationToken,
  deleteAgent,
  getAgent,
  getAgentEnrollmentProgress,
  getAgentEnrollmentTokens,
  getAgents,
  getAlert,
  getAlerts,
  getContainer,
  getContainers,
  getDomains,
  getOverview,
  getUpdates,
  getHomeAssistantSettings,
  getServer,
  getServerMetricHistory,
  getServerMetrics,
  getServerMonitors,
  getServers,
  login,
  refreshUpdates,
  renameAgent,
  revokeAgent,
  revokeAgentEnrollmentToken,
  removeAlert,
  removeServerMonitor,
  removeContainerMonitor,
  removeDomain,
  runChecks,
  saveHomeAssistantSettings,
  testHomeAssistantConnection,
  updateContainerMonitor,
  updateDomain,
  updateServerMonitor
} from "../api/endpoints";
import type { ApiConfig } from "../api/client";
import type { CreateAgentEnrollmentInput, CreateContainerMonitorInput, CreateDomainInput, CreateMonitoredServerInput, HomeAssistantSettingsInput, LoginInput, MetricHistoryRange } from "../types/nodeguard";
import { demoAgentDetails, demoAgents, demoAlerts, demoContainers, demoDocker, demoDomains, getDemoMetricHistory, getDemoOverview, getDemoUpdateCenter, demoMetrics, demoServer, demoServerMonitors, demoServers } from "../demoData";
import { useSettingsStore } from "../store/settingsStore";

const dismissedDemoAlertIds = new Set<string>();

export const queryKeys = {
  overview: ["overview"] as const,
  servers: ["servers"] as const,
  serverMonitors: ["server-monitors"] as const,
  server: (id: string) => ["server", id] as const,
  metrics: (id: string) => ["server", id, "metrics"] as const,
  metricHistory: (id: string, range: MetricHistoryRange) => ["server", id, "metrics", "history", range] as const,
  containers: ["containers"] as const,
  container: (id: string, serverId = "") => ["container", serverId, id] as const,
  agents: ["agents"] as const,
  agent: (id: string) => ["agents", id] as const,
  agentEnrollmentTokens: ["agents", "enrollment-tokens"] as const,
  agentEnrollmentProgress: (id: string) => ["agents", "enrollment-tokens", id, "status"] as const,
  domains: ["domains"] as const,
  alerts: (status: "active" | "resolved" | "all" = "active") => ["alerts", status] as const,
  alert: (id: string) => ["alert", id] as const,
  updates: ["updates"] as const,
  homeAssistantSettings: ["updates", "settings", "home-assistant"] as const
};

function useConfig() {
  const config = useSettingsStore((state) => state.backendConfig);
  const demoMode = useSettingsStore((state) => state.demoMode);
  if (!config && !demoMode) {
    throw new Error("NodeGuard is not connected.");
  }

  return config ? { backendUrl: config.backendUrl } : { backendUrl: "demo://nodeguard" };
}

function useLiveQueryOptions(enabled = true) {
  const refreshIntervalSeconds = useSettingsStore((state) => state.refreshIntervalSeconds);
  const intervalMs = Math.max(1, refreshIntervalSeconds) * 1000;
  const refetchInterval: number | false = enabled ? intervalMs : false;

  return {
    refetchInterval,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: Math.min(intervalMs, 10000)
  };
}

export function useLogin() {
  return useMutation({
    mutationFn: ({ config, input }: { config: ApiConfig; input: LoginInput }) => login(config, input)
  });
}

export function useOverview() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({
    queryKey: [...queryKeys.overview, demoMode],
    queryFn: () => demoMode
      ? Promise.resolve(getDemoOverview(demoAlerts.filter((alert) => !dismissedDemoAlertIds.has(alert.id))))
      : getOverview(config),
    ...liveOptions
  });
}

export function useServers() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({ queryKey: [...queryKeys.servers, demoMode], queryFn: () => demoMode ? Promise.resolve([...demoServers, ...demoServerMonitors]) : getServers(config), ...liveOptions });
}

export function useAgents() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({
    queryKey: [...queryKeys.agents, demoMode],
    queryFn: () => demoMode ? Promise.resolve({ agents: demoAgents }) : getAgents(config),
    ...liveOptions
  });
}

export function useAgent(id: string | null) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions(Boolean(id));
  return useQuery({
    queryKey: [...queryKeys.agent(id ?? ""), demoMode],
    queryFn: () => demoMode ? Promise.resolve(demoAgentDetails[id ?? ""] ?? demoAgentDetails[demoAgents[0].id]) : getAgent(config, id ?? ""),
    enabled: Boolean(id),
    ...liveOptions
  });
}

export function useAgentEnrollmentTokens() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({
    queryKey: [...queryKeys.agentEnrollmentTokens, demoMode],
    queryFn: () => demoMode ? Promise.resolve({ tokens: [] }) : getAgentEnrollmentTokens(config)
  });
}

export function useAgentEnrollmentProgress(id: string | null) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({
    queryKey: [...queryKeys.agentEnrollmentProgress(id ?? ""), demoMode],
    queryFn: () => demoMode
      ? Promise.resolve({ id: id ?? "demo-enrollment", purpose: "enroll" as const, displayName: "Demo agent", expiresAt: new Date(Date.now() + 600000).toISOString(), state: "waiting" as const, agent: null })
      : getAgentEnrollmentProgress(config, id ?? ""),
    enabled: Boolean(id),
    refetchInterval: (query) => ["online", "expired", "revoked"].includes(query.state.data?.state ?? "") ? false : 1500,
    staleTime: 0
  });
}

function invalidateAgentQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
  void queryClient.invalidateQueries({ queryKey: queryKeys.servers });
  void queryClient.invalidateQueries({ queryKey: queryKeys.containers });
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
  void queryClient.invalidateQueries({ queryKey: ["alerts"] });
}

export function useCreateAgentEnrollmentToken() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentEnrollmentInput) => demoMode
      ? Promise.reject(new Error("Agent enrollment is unavailable in Demo Mode."))
      : createAgentEnrollmentToken(config, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.agentEnrollmentTokens })
  });
}

export function useRevokeAgentEnrollmentToken() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => demoMode ? Promise.resolve({ revoked: Boolean(id) }) : revokeAgentEnrollmentToken(config, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.agentEnrollmentTokens })
  });
}

export function useRenameAgent() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) => demoMode
      ? Promise.resolve({ ...demoAgentDetails[id], displayName })
      : renameAgent(config, id, displayName),
    onSuccess: (_agent, input) => {
      invalidateAgentQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent(input.id) });
    }
  });
}

export function useCreateAgentRotationToken() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useMutation({
    mutationFn: (id: string) => demoMode
      ? Promise.reject(new Error("Credential rotation is unavailable in Demo Mode."))
      : createAgentRotationToken(config, id)
  });
}

export function useRevokeAgent() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => demoMode ? Promise.resolve({ revoked: Boolean(id) }) : revokeAgent(config, id),
    onSuccess: () => invalidateAgentQueries(queryClient)
  });
}

export function useDeleteAgent() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => demoMode
      ? Promise.reject(new Error("Agent deletion is unavailable in Demo Mode."))
      : deleteAgent(config, id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.agent(id) });
      invalidateAgentQueries(queryClient);
    }
  });
}

export function useServerMonitors() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({ queryKey: [...queryKeys.serverMonitors, demoMode], queryFn: () => demoMode ? Promise.resolve(demoServerMonitors) : getServerMonitors(config), ...liveOptions });
}

export function useAddServerMonitor() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMonitoredServerInput) => demoMode ? Promise.resolve({ ...demoServerMonitors[0], name: input.name, backendUrl: input.backendUrl }) : addServerMonitor(config, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.serverMonitors });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    }
  });
}

export function useRemoveServerMonitor() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => demoMode ? Promise.resolve({ removed: Boolean(id) }) : removeServerMonitor(config, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.serverMonitors });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    }
  });
}

export function useUpdateServerMonitor() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateMonitoredServerInput }) => demoMode ? Promise.resolve({ ...demoServerMonitors[0], id, name: input.name, backendUrl: input.backendUrl }) : updateServerMonitor(config, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.serverMonitors });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    }
  });
}

export function useServer(id: string) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({ queryKey: [...queryKeys.server(id), demoMode], queryFn: () => demoMode ? Promise.resolve({ ...(demoServers.find((server) => server.id === id) ?? demoServer), lastCheckedAt: new Date().toISOString() }) : getServer(config, id), ...liveOptions });
}

export function useServerMetrics(id: string) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({ queryKey: [...queryKeys.metrics(id), demoMode], queryFn: () => demoMode ? Promise.resolve({ ...(demoAgentDetails[id]?.latestMetrics ?? demoMetrics), createdAt: new Date().toISOString() }) : getServerMetrics(config, id), ...liveOptions });
}

export function useServerMetricHistory(id: string, range: MetricHistoryRange, enabled = true) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions(enabled);
  return useQuery({
    queryKey: [...queryKeys.metricHistory(id, range), demoMode],
    queryFn: () => demoMode ? Promise.resolve({ ...getDemoMetricHistory(range), serverId: id }) : getServerMetricHistory(config, id, range),
    enabled,
    ...liveOptions
  });
}

export function useContainers() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({ queryKey: [...queryKeys.containers, demoMode], queryFn: () => demoMode ? Promise.resolve(demoDocker) : getContainers(config), ...liveOptions });
}

function invalidateContainerMonitorQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.containers });
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
  void queryClient.invalidateQueries({ queryKey: ["alerts"] });
}

export function useAddContainerMonitor() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContainerMonitorInput) => demoMode ? Promise.resolve([{ ...demoDocker.containerMonitors[0], name: input.name, containerRef: input.containerRef }]) : addContainerMonitor(config, input),
    onSuccess: () => invalidateContainerMonitorQueries(queryClient)
  });
}

export function useUpdateContainerMonitor() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateContainerMonitorInput }) => demoMode ? Promise.resolve([{ ...demoDocker.containerMonitors[0], id, name: input.name, containerRef: input.containerRef }]) : updateContainerMonitor(config, id, input),
    onSuccess: () => invalidateContainerMonitorQueries(queryClient)
  });
}

export function useRemoveContainerMonitor() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => demoMode ? Promise.resolve({ removed: Boolean(id) }) : removeContainerMonitor(config, id),
    onSuccess: () => invalidateContainerMonitorQueries(queryClient)
  });
}

export function useContainer(id: string | null, serverId: string | null = null) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions(Boolean(id));
  return useQuery({
    queryKey: [...queryKeys.container(id ?? "", serverId ?? ""), demoMode],
    queryFn: () => demoMode ? Promise.resolve(demoContainers.find((container) => container.id === id && (!serverId || container.serverId === serverId)) ?? demoContainers[0]) : getContainer(config, id ?? "", serverId),
    enabled: Boolean(id),
    ...liveOptions
  });
}

export function useDomains() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({ queryKey: [...queryKeys.domains, demoMode], queryFn: () => demoMode ? Promise.resolve(demoDomains) : getDomains(config), ...liveOptions });
}

function invalidateDomainQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.domains });
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
  void queryClient.invalidateQueries({ queryKey: ["alerts"] });
}

export function useAddDomain() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDomainInput) => demoMode ? Promise.resolve([{ ...demoDomains[0], domain: input.domain }]) : addDomain(config, input),
    onSuccess: () => invalidateDomainQueries(queryClient)
  });
}

export function useUpdateDomain() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateDomainInput }) => demoMode ? Promise.resolve([{ ...demoDomains[0], id, domain: input.domain }]) : updateDomain(config, id, input),
    onSuccess: () => invalidateDomainQueries(queryClient)
  });
}

export function useRemoveDomain() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => demoMode ? Promise.resolve({ removed: Boolean(id) }) : removeDomain(config, id),
    onSuccess: () => invalidateDomainQueries(queryClient)
  });
}

export function useAlerts(status: "active" | "resolved" | "all" = "active") {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({
    queryKey: [...queryKeys.alerts(status), demoMode],
    queryFn: () => demoMode
      ? Promise.resolve(demoAlerts.filter((alert) => !dismissedDemoAlertIds.has(alert.id) && (status === "all" || alert.status === status)))
      : getAlerts(config, status),
    ...liveOptions
  });
}

export function useAlert(id: string | null) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions(Boolean(id));
  return useQuery({
    queryKey: [...queryKeys.alert(id ?? ""), demoMode],
    queryFn: () => demoMode ? Promise.resolve(demoAlerts.find((alert) => alert.id === id) ?? demoAlerts[0]) : getAlert(config, id ?? ""),
    enabled: Boolean(id),
    ...liveOptions
  });
}

export function useRemoveAlert() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      if (demoMode) {
        dismissedDemoAlertIds.add(id);
        return Promise.resolve({ removed: Boolean(id) });
      }
      return removeAlert(config, id);
    },
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.alert(id) });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
    }
  });
}

export function useUpdates() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const liveOptions = useLiveQueryOptions();
  return useQuery({
    queryKey: [...queryKeys.updates, demoMode],
    queryFn: () => demoMode ? Promise.resolve(getDemoUpdateCenter()) : getUpdates(config),
    ...liveOptions
  });
}

export function useRefreshUpdates() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => demoMode ? Promise.resolve(getDemoUpdateCenter()) : refreshUpdates(config),
    onSuccess: (snapshot) => {
      queryClient.setQueryData([...queryKeys.updates, demoMode], snapshot);
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
    }
  });
}

export function useHomeAssistantSettings() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({
    queryKey: [...queryKeys.homeAssistantSettings, demoMode],
    queryFn: () => demoMode
      ? Promise.resolve({ configured: true, url: "https://ha.demo.example", lastCheckedAt: new Date().toISOString(), lastError: null })
      : getHomeAssistantSettings(config)
  });
}

export function useTestHomeAssistantConnection() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useMutation({
    mutationFn: (input: HomeAssistantSettingsInput) => demoMode
      ? Promise.resolve({ connected: true, updateEntities: 5 })
      : testHomeAssistantConnection(config, input)
  });
}

export function useSaveHomeAssistantSettings() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HomeAssistantSettingsInput) => demoMode
      ? Promise.resolve({ configured: true, url: input.url, lastCheckedAt: new Date().toISOString(), lastError: null })
      : saveHomeAssistantSettings(config, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.homeAssistantSettings });
      void queryClient.invalidateQueries({ queryKey: queryKeys.updates });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    }
  });
}

export function useRunChecks() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => demoMode
      ? Promise.resolve(getDemoOverview(demoAlerts.filter((alert) => !dismissedDemoAlertIds.has(alert.id))))
      : runChecks(config),
    onSuccess: (overview) => {
      queryClient.setQueryData(queryKeys.overview, overview);
      void queryClient.invalidateQueries();
    }
  });
}
