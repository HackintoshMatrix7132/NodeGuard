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

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: numberEnv("PORT", 3000),
  apiKey: process.env.NODEGUARD_API_KEY ?? "",
  allowedOrigins: listEnv("ALLOWED_ORIGINS"),
  monitoredDomains: listEnv("MONITORED_DOMAINS"),
  databaseUrl: process.env.DATABASE_URL ?? "file:data/nodeguard.sqlite",
  trustProxy: booleanEnv("TRUST_PROXY", false),
  requestJsonLimit: process.env.REQUEST_JSON_LIMIT ?? "64kb",
  rateLimitWindowMs: numberEnv("RATE_LIMIT_WINDOW_MS", 60000),
  rateLimitMax: numberEnv("RATE_LIMIT_MAX", 120),
  webDistDir: process.env.WEB_DIST_DIR ?? "apps/web/dist",
  serverDisplayName: process.env.SERVER_DISPLAY_NAME ?? "local-nodeguard-host",
  logPreviewLines: numberEnv("LOG_PREVIEW_LINES", 80),
  domainCheckTimeoutMs: numberEnv("DOMAIN_CHECK_TIMEOUT_MS", 5000),
  thresholds: {
    cpuWarning: numberEnv("CPU_WARNING_PERCENT", 80),
    cpuCritical: numberEnv("CPU_CRITICAL_PERCENT", 90),
    memoryWarning: numberEnv("MEMORY_WARNING_PERCENT", 80),
    memoryCritical: numberEnv("MEMORY_CRITICAL_PERCENT", 90),
    diskWarning: numberEnv("DISK_WARNING_PERCENT", 80),
    diskCritical: numberEnv("DISK_CRITICAL_PERCENT", 90)
  }
};
