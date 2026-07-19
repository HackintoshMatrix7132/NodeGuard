import type { ProxmoxNodeHistoryRange, ProxmoxNodeTab } from "../types/nodeguard";

export type ProxmoxNodeRoute = {
  connectionId: string;
  node: string;
  tab: ProxmoxNodeTab;
  range: ProxmoxNodeHistoryRange;
};

const proxmoxHistoryRanges = new Set<ProxmoxNodeHistoryRange>(["1h", "6h", "12h", "24h", "7d", "30d", "90d"]);

export function parseProxmoxNodeLocation(location: Pick<Location, "pathname" | "search">): ProxmoxNodeRoute | null {
  const match = location.pathname.match(/^\/proxmox\/nodes\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    const params = new URLSearchParams(location.search);
    const rangeValue = params.get("range") as ProxmoxNodeHistoryRange | null;
    return {
      connectionId: decodeURIComponent(match[1]!),
      node: decodeURIComponent(match[2]!),
      tab: params.get("tab") === "history" ? "history" : "overview",
      range: rangeValue && proxmoxHistoryRanges.has(rangeValue) ? rangeValue : "24h",
    };
  } catch {
    return null;
  }
}

export function proxmoxNodePath(route: ProxmoxNodeRoute): string {
  const query = route.tab === "history" ? `?tab=history&range=${route.range}` : "";
  return `/proxmox/nodes/${encodeURIComponent(route.connectionId)}/${encodeURIComponent(route.node)}${query}`;
}
