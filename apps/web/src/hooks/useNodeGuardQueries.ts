import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addContainerMonitor,
  addDomain,
  addServerMonitor,
  getAlert,
  getAlerts,
  getContainer,
  getContainers,
  getDomains,
  getOverview,
  getServer,
  getServerMetrics,
  getServerMonitors,
  getServers,
  removeServerMonitor,
  removeContainerMonitor,
  removeDomain,
  runChecks,
  updateContainerMonitor,
  updateDomain,
  updateServerMonitor,
  validateConnection
} from "../api/endpoints";
import type { ApiConfig } from "../api/client";
import type { CreateContainerMonitorInput, CreateDomainInput, CreateMonitoredServerInput } from "../types/nodeguard";
import { demoAlerts, demoContainers, demoDocker, demoDomains, demoMetrics, demoOverview, demoServer, demoServerMonitors } from "../demoData";
import { useSettingsStore } from "../store/settingsStore";

export const queryKeys = {
  overview: ["overview"] as const,
  servers: ["servers"] as const,
  serverMonitors: ["server-monitors"] as const,
  server: (id: string) => ["server", id] as const,
  metrics: (id: string) => ["server", id, "metrics"] as const,
  containers: ["containers"] as const,
  container: (id: string) => ["container", id] as const,
  domains: ["domains"] as const,
  alerts: ["alerts"] as const,
  alert: (id: string) => ["alert", id] as const
};

function useConfig() {
  const config = useSettingsStore((state) => state.backendConfig);
  const demoMode = useSettingsStore((state) => state.demoMode);
  if (!config && !demoMode) {
    throw new Error("NodeGuard is not connected.");
  }

  return config ? { backendUrl: config.backendUrl, apiKey: config.apiKey } : { backendUrl: "demo://nodeguard", apiKey: "demo" };
}

export function useValidateConnection() {
  return useMutation({
    mutationFn: (config: ApiConfig) => validateConnection(config)
  });
}

export function useOverview() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const refreshIntervalSeconds = useSettingsStore((state) => state.refreshIntervalSeconds);
  return useQuery({
    queryKey: [...queryKeys.overview, demoMode],
    queryFn: () => demoMode ? Promise.resolve({ ...demoOverview, lastCheckedAt: new Date().toISOString() }) : getOverview(config),
    refetchInterval: refreshIntervalSeconds * 1000
  });
}

export function useServers() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({ queryKey: [...queryKeys.servers, demoMode], queryFn: () => demoMode ? Promise.resolve([demoServer, ...demoServerMonitors]) : getServers(config) });
}

export function useServerMonitors() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({ queryKey: [...queryKeys.serverMonitors, demoMode], queryFn: () => demoMode ? Promise.resolve(demoServerMonitors) : getServerMonitors(config) });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    }
  });
}

export function useServer(id: string) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({ queryKey: [...queryKeys.server(id), demoMode], queryFn: () => demoMode ? Promise.resolve({ ...demoServer, lastCheckedAt: new Date().toISOString() }) : getServer(config, id) });
}

export function useServerMetrics(id: string) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({ queryKey: [...queryKeys.metrics(id), demoMode], queryFn: () => demoMode ? Promise.resolve({ ...demoMetrics, createdAt: new Date().toISOString() }) : getServerMetrics(config, id) });
}

export function useContainers() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({ queryKey: [...queryKeys.containers, demoMode], queryFn: () => demoMode ? Promise.resolve(demoDocker) : getContainers(config) });
}

function invalidateContainerMonitorQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.containers });
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
  void queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
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

export function useContainer(id: string | null) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({
    queryKey: [...queryKeys.container(id ?? ""), demoMode],
    queryFn: () => demoMode ? Promise.resolve(demoContainers.find((container) => container.id === id) ?? demoContainers[0]) : getContainer(config, id ?? ""),
    enabled: Boolean(id)
  });
}

export function useDomains() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({ queryKey: [...queryKeys.domains, demoMode], queryFn: () => demoMode ? Promise.resolve(demoDomains) : getDomains(config) });
}

function invalidateDomainQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.domains });
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
  void queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
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

export function useAlerts() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({ queryKey: [...queryKeys.alerts, demoMode], queryFn: () => demoMode ? Promise.resolve(demoAlerts) : getAlerts(config) });
}

export function useAlert(id: string | null) {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  return useQuery({
    queryKey: [...queryKeys.alert(id ?? ""), demoMode],
    queryFn: () => demoMode ? Promise.resolve(demoAlerts.find((alert) => alert.id === id) ?? demoAlerts[0]) : getAlert(config, id ?? ""),
    enabled: Boolean(id)
  });
}

export function useRunChecks() {
  const config = useConfig();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => demoMode ? Promise.resolve({ ...demoOverview, lastCheckedAt: new Date().toISOString() }) : runChecks(config),
    onSuccess: (overview) => {
      queryClient.setQueryData(queryKeys.overview, overview);
      void queryClient.invalidateQueries();
    }
  });
}
