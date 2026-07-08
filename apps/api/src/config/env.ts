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

function listEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: numberEnv("PORT", 3000),
  apiKey: process.env.NODEGUARD_API_KEY ?? "",
  allowedOrigins: listEnv("ALLOWED_ORIGINS"),
  monitoredDomains: listEnv("MONITORED_DOMAINS"),
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
