export type View = "dashboard" | "server" | "proxmox" | "proxmox-node" | "agents" | "containers" | "domains" | "updates" | "alerts" | "settings";
export type MetricTone = "blue" | "green" | "orange" | "red" | "purple";
export type BreakdownItem = { label: string; value: string; tone?: MetricTone };
export type HistoricalResource = "cpu" | "memory" | "disk" | "swap";
export type HistoricalMetricKey = "cpuUsagePercent" | "memoryUsagePercent" | "diskUsagePercent" | "swapUsagePercent";
