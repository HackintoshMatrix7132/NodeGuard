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

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: numberEnv("PORT", 3000),
  apiKey: process.env.NODEGUARD_API_KEY ?? "",
  adminUsername: process.env.NODEGUARD_ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.NODEGUARD_ADMIN_PASSWORD ?? "",
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "nodeguard_session",
  sessionCookieSecure: cookieSecureEnv(),
  sessionDurationDays: numberEnv("SESSION_DURATION_DAYS", 7),
  allowedOrigins: listEnv("ALLOWED_ORIGINS"),
  monitoredDomains: listEnv("MONITORED_DOMAINS"),
  databaseUrl: process.env.DATABASE_URL ?? "file:data/nodeguard.sqlite",
  trustProxy: booleanEnv("TRUST_PROXY", false),
  requestJsonLimit: process.env.REQUEST_JSON_LIMIT ?? "64kb",
  rateLimitWindowMs: numberEnv("RATE_LIMIT_WINDOW_MS", 60000),
  rateLimitMax: numberEnv("RATE_LIMIT_MAX", 1200),
  webDistDir: process.env.WEB_DIST_DIR ?? "apps/web/dist",
  serverDisplayName: process.env.SERVER_DISPLAY_NAME ?? "local-nodeguard-host",
  logPreviewLines: numberEnv("LOG_PREVIEW_LINES", 80),
  domainCheckTimeoutMs: numberEnv("DOMAIN_CHECK_TIMEOUT_MS", 5000),
  metricSampleIntervalSeconds: Math.max(10, numberEnv("METRIC_SAMPLE_INTERVAL_SECONDS", 60)),
  metricHistoryRetentionDays: Math.max(30, numberEnv("METRIC_HISTORY_RETENTION_DAYS", 30)),
  thresholds: {
    cpuWarning: numberEnv("CPU_WARNING_PERCENT", 80),
    cpuCritical: numberEnv("CPU_CRITICAL_PERCENT", 90),
    memoryWarning: numberEnv("MEMORY_WARNING_PERCENT", 80),
    memoryCritical: numberEnv("MEMORY_CRITICAL_PERCENT", 90),
    diskWarning: numberEnv("DISK_WARNING_PERCENT", 80),
    diskCritical: numberEnv("DISK_CRITICAL_PERCENT", 90)
  }
};
