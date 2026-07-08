import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getAlert,
  getAlerts,
  getContainer,
  getContainers,
  getDomains,
  getOverview,
  getServer,
  getServerMetrics,
  getServers,
  runChecks,
  validateConnection
} from "@/api/mockApi";

export const queryKeys = {
  overview: ["overview"] as const,
  servers: ["servers"] as const,
  server: (id: string) => ["server", id] as const,
  metrics: (id: string) => ["server", id, "metrics"] as const,
  containers: ["containers"] as const,
  container: (id: string) => ["container", id] as const,
  domains: ["domains"] as const,
  alerts: ["alerts"] as const,
  alert: (id: string) => ["alert", id] as const
};

export function useOverview() {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: getOverview
  });
}

export function useServers() {
  return useQuery({
    queryKey: queryKeys.servers,
    queryFn: getServers
  });
}

export function useServer(id: string) {
  return useQuery({
    queryKey: queryKeys.server(id),
    queryFn: () => getServer(id)
  });
}

export function useServerMetrics(id: string) {
  return useQuery({
    queryKey: queryKeys.metrics(id),
    queryFn: () => getServerMetrics(id)
  });
}

export function useContainers() {
  return useQuery({
    queryKey: queryKeys.containers,
    queryFn: getContainers
  });
}

export function useContainer(id: string) {
  return useQuery({
    queryKey: queryKeys.container(id),
    queryFn: () => getContainer(id)
  });
}

export function useDomains() {
  return useQuery({
    queryKey: queryKeys.domains,
    queryFn: getDomains
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts,
    queryFn: getAlerts
  });
}

export function useAlert(id: string) {
  return useQuery({
    queryKey: queryKeys.alert(id),
    queryFn: () => getAlert(id)
  });
}

export function useRunChecks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runChecks,
    onSuccess: (overview) => {
      queryClient.setQueryData(queryKeys.overview, overview);
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.containers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.domains });
      void queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    }
  });
}

export function useValidateConnection() {
  return useMutation({
    mutationFn: ({ backendUrl, apiKey }: { backendUrl: string; apiKey: string }) =>
      validateConnection(backendUrl, apiKey)
  });
}
