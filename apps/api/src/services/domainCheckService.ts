import tls from "node:tls";

import { env } from "../config/env.js";
import type { DomainCheck } from "../types/nodeguard.js";
import { idForDomain, listStoredDomains, normalizeDomain } from "./domainConfigService.js";

type SslInfo = {
  sslExpiresAt: string | null;
  sslExpiresInDays: number | null;
};

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

async function checkDomain(domain: string, editable: boolean): Promise<DomainCheck> {
  const controller = new AbortController();
  const startedAt = performance.now();
  const timeout = setTimeout(() => controller.abort(), env.domainCheckTimeoutMs);
  const now = new Date().toISOString();

  try {
    const [response, sslInfo] = await Promise.all([
      fetch(domain, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal
      }),
      readSslInfo(domain)
    ]);
    const responseTimeMs = Math.round(performance.now() - startedAt);
    const isServerError = [500, 502, 503].includes(response.status);

    return {
      id: idForDomain(domain),
      domain,
      editable,
      status: isServerError ? "critical" : response.ok ? "healthy" : "warning",
      statusCode: response.status,
      responseTimeMs,
      https: domain.startsWith("https://"),
      sslExpiresAt: sslInfo.sslExpiresAt,
      sslExpiresInDays: sslInfo.sslExpiresInDays,
      lastCheckedAt: now,
      error: null
    };
  } catch (error) {
    return {
      id: idForDomain(domain),
      domain,
      editable,
      status: "offline",
      statusCode: null,
      responseTimeMs: null,
      https: domain.startsWith("https://"),
      sslExpiresAt: null,
      sslExpiresInDays: null,
      lastCheckedAt: now,
      error: error instanceof Error && error.name === "AbortError" ? "Domain check timed out." : "Domain is unreachable."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDomainChecks(): Promise<DomainCheck[]> {
  const envDomains = env.monitoredDomains.map((domain) => ({ domain: normalizeDomain(domain), editable: false }));
  const storedDomains = (await listStoredDomains()).map((domain) => ({ domain: domain.domain, editable: true }));
  const domains = [...envDomains, ...storedDomains].filter(
    (domain, index, all) => all.findIndex((item) => item.domain === domain.domain) === index
  );
  return Promise.all(domains.map((domain) => checkDomain(domain.domain, domain.editable)));
}
