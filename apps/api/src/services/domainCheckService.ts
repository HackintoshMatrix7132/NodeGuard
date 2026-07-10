import tls from "node:tls";

import { env } from "../config/env.js";
import type { DomainCheck, HealthStatus } from "../types/nodeguard.js";
import { listStoredDomains, markStoredDomainResult, recordStoredDomainCheck, type DomainCheckStats, type StoredDomain } from "./domainConfigService.js";

type SslInfo = {
  sslExpiresAt: string | null;
  sslExpiresInDays: number | null;
};

type DomainTarget = StoredDomain & {
  editable: boolean;
};

function currentOnlyStats(healthy: boolean): DomainCheckStats {
  return {
    uptimePercent: healthy ? 100 : 0,
    checkSamples: 1,
    previousResponseTimeMs: null,
    latencyTrendPercent: null
  };
}

function buildCheckUrl(domain: string, domainPath: string) {
  return `${domain}${domainPath === "/" ? "" : domainPath}`;
}

function readSslInfo(domain: string): Promise<SslInfo> {
  const parsed = new URL(domain);
  if (parsed.protocol !== "https:") {
    return Promise.resolve({ sslExpiresAt: null, sslExpiresInDays: null });
  }

  return new Promise((resolve) => {
    const socket = tls.connect({
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 443,
      servername: parsed.hostname,
      rejectUnauthorized: false,
      timeout: env.domainCheckTimeoutMs
    }, () => {
      const certificate = socket.getPeerCertificate();
      socket.end();
      if (!certificate.valid_to) {
        resolve({ sslExpiresAt: null, sslExpiresInDays: null });
        return;
      }

      const expiresAt = new Date(certificate.valid_to);
      const sslExpiresInDays = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
      resolve({ sslExpiresAt: expiresAt.toISOString(), sslExpiresInDays });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ sslExpiresAt: null, sslExpiresInDays: null });
    });
    socket.on("error", () => resolve({ sslExpiresAt: null, sslExpiresInDays: null }));
  });
}

function statusForHttpResponse(statusCode: number, expectedStatusCodes: number[]): HealthStatus {
  if (expectedStatusCodes.includes(statusCode)) {
    return "healthy";
  }

  return statusCode >= 500 ? "critical" : "warning";
}

async function checkDomain(target: DomainTarget): Promise<DomainCheck> {
  const controller = new AbortController();
  const startedAt = performance.now();
  const timeout = setTimeout(() => controller.abort(), env.domainCheckTimeoutMs);
  const now = new Date().toISOString();
  const checkUrl = buildCheckUrl(target.domain, target.path);

  try {
    const [response, sslInfo] = await Promise.all([
      fetch(checkUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal
      }),
      readSslInfo(target.domain)
    ]);
    const responseTimeMs = Math.round(performance.now() - startedAt);
    const status = statusForHttpResponse(response.status, target.expectedStatusCodes);
    const healthy = status === "healthy";

    if (target.editable) {
      markStoredDomainResult(target.id, healthy, now);
    }
    const stats = target.editable
      ? recordStoredDomainCheck(target.id, { healthy, statusCode: response.status, responseTimeMs, checkedAt: now })
      : currentOnlyStats(healthy);

    return {
      id: target.id,
      domain: target.domain,
      path: target.path,
      expectedStatusCodes: target.expectedStatusCodes,
      editable: target.editable,
      status,
      statusCode: response.status,
      responseTimeMs,
      ...stats,
      https: target.domain.startsWith("https://"),
      sslExpiresAt: sslInfo.sslExpiresAt,
      sslExpiresInDays: sslInfo.sslExpiresInDays,
      lastCheckedAt: now,
      lastSuccessfulAt: healthy ? now : target.lastSuccessfulAt,
      lastFailedAt: healthy ? target.lastFailedAt : now,
      error: healthy ? null : `Expected HTTP ${target.expectedStatusCodes.join(", ")} but received HTTP ${response.status}.`
    };
  } catch (error) {
    if (target.editable) {
      markStoredDomainResult(target.id, false, now);
    }
    const stats = target.editable
      ? recordStoredDomainCheck(target.id, { healthy: false, statusCode: null, responseTimeMs: null, checkedAt: now })
      : currentOnlyStats(false);

    return {
      id: target.id,
      domain: target.domain,
      path: target.path,
      expectedStatusCodes: target.expectedStatusCodes,
      editable: target.editable,
      status: "offline",
      statusCode: null,
      responseTimeMs: null,
      ...stats,
      https: target.domain.startsWith("https://"),
      sslExpiresAt: null,
      sslExpiresInDays: null,
      lastCheckedAt: now,
      lastSuccessfulAt: target.lastSuccessfulAt,
      lastFailedAt: now,
      error: error instanceof Error && error.name === "AbortError" ? "Domain check timed out." : "Domain is unreachable."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDomainChecks(): Promise<DomainCheck[]> {
  const domains: DomainTarget[] = (await listStoredDomains()).map((domain) => ({ ...domain, editable: true }));
  return Promise.all(domains.map((domain) => checkDomain(domain)));
}
