import dotenv from "dotenv";

dotenv.config();

function numberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function listEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function cookieSecureEnv(): boolean | "auto" {
  const value = (process.env.SESSION_COOKIE_SECURE ?? "auto").trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return "auto";
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const agentStaleAfterSeconds = Math.max(30, numberEnv("AGENT_STALE_AFTER_SECONDS", 75));
const agentOfflineAfterSeconds = Math.max(agentStaleAfterSeconds + 30, numberEnv("AGENT_OFFLINE_AFTER_SECONDS", 180));

export function parseProxmoxSyncIntervalSeconds(raw: string | undefined): number {
  if (!raw) return 30;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(30, parsed);
}

export function parseAgentUpdateIntervalSeconds(raw: string | undefined): number {
  if (!raw) return 21600;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 21600;
  return Math.max(900, Math.floor(parsed));
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: numberEnv("PORT", 3000),
  apiKey: process.env.NODEGUARD_API_KEY ?? "",
  adminUsername: process.env.NODEGUARD_ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.NODEGUARD_ADMIN_PASSWORD ?? "",
  demoUsername: process.env.NODEGUARD_DEMO_USERNAME ?? "demo",
  demoPassword: process.env.NODEGUARD_DEMO_PASSWORD ?? "",
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "nodeguard_session",
  sessionCookieSecure: cookieSecureEnv(),
  sessionDurationDays: numberEnv("SESSION_DURATION_DAYS", 7),
  rememberedSessionDurationDays: numberEnv("REMEMBERED_SESSION_DURATION_DAYS", 30),
  allowedOrigins: listEnv("ALLOWED_ORIGINS"),
  monitoredDomains: listEnv("MONITORED_DOMAINS"),
  databaseUrl: process.env.DATABASE_URL ?? "file:data/nodeguard.sqlite",
  trustProxy: Math.max(0, numberEnv("TRUST_PROXY", 0)),
  requestJsonLimit: process.env.REQUEST_JSON_LIMIT ?? "512kb",
  rateLimitWindowMs: numberEnv("RATE_LIMIT_WINDOW_MS", 60000),
  rateLimitMax: numberEnv("RATE_LIMIT_MAX", 1200),
  webDistDir: process.env.WEB_DIST_DIR ?? "apps/web/dist",
  agentInstallerPath: process.env.AGENT_INSTALLER_PATH ?? "agent/install-agent.sh",
  agentReleaseDir: process.env.AGENT_RELEASE_DIR ?? "agent-releases",
  agentReleaseVersion: process.env.AGENT_RELEASE_VERSION ?? "0.3.0",
  serverDisplayName: process.env.SERVER_DISPLAY_NAME ?? "local-nodeguard-host",
  logPreviewLines: numberEnv("LOG_PREVIEW_LINES", 80),
  domainCheckTimeoutMs: numberEnv("DOMAIN_CHECK_TIMEOUT_MS", 5000),
  agentEnrollmentTtlMinutes: Math.max(1, numberEnv("AGENT_ENROLLMENT_TTL_MINUTES", 10)),
  agentHeartbeatIntervalSeconds: Math.max(10, numberEnv("AGENT_HEARTBEAT_INTERVAL_SECONDS", 20)),
  agentMetricsIntervalSeconds: Math.max(15, numberEnv("AGENT_METRICS_INTERVAL_SECONDS", 30)),
  agentDockerIntervalSeconds: Math.max(30, numberEnv("AGENT_DOCKER_INTERVAL_SECONDS", 60)),
  agentInventoryIntervalSeconds: Math.max(300, numberEnv("AGENT_INVENTORY_INTERVAL_SECONDS", 21600)),
  agentUpdateIntervalSeconds: parseAgentUpdateIntervalSeconds(process.env.AGENT_UPDATE_INTERVAL_SECONDS),
  agentStaleAfterSeconds,
  agentOfflineAfterSeconds,
  agentTimestampToleranceSeconds: Math.max(60, numberEnv("AGENT_TIMESTAMP_TOLERANCE_SECONDS", 900)),
  agentMaxContainers: Math.max(10, numberEnv("AGENT_MAX_CONTAINERS", 500)),
  agentRateLimitMax: Math.max(60, numberEnv("AGENT_RATE_LIMIT_MAX", 600)),
  agentEnrollmentRateLimitMax: Math.max(3, numberEnv("AGENT_ENROLLMENT_RATE_LIMIT_MAX", 10)),
  metricSampleIntervalSeconds: Math.max(10, numberEnv("METRIC_SAMPLE_INTERVAL_SECONDS", 60)),
  metricHistoryRetentionDays: Math.max(30, numberEnv("METRIC_HISTORY_RETENTION_DAYS", 30)),
  proxmoxSyncIntervalSeconds: parseProxmoxSyncIntervalSeconds(process.env.NODEGUARD_PROXMOX_SYNC_INTERVAL_SECONDS),
  thresholds: {
    cpuWarning: numberEnv("CPU_WARNING_PERCENT", 80),
    cpuCritical: numberEnv("CPU_CRITICAL_PERCENT", 90),
    memoryWarning: numberEnv("MEMORY_WARNING_PERCENT", 80),
    memoryCritical: numberEnv("MEMORY_CRITICAL_PERCENT", 90),
    diskWarning: numberEnv("DISK_WARNING_PERCENT", 80),
    diskCritical: numberEnv("DISK_CRITICAL_PERCENT", 90)
  }
};
