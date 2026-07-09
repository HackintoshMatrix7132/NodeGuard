import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { env } from "../config/env.js";
import type { CreateDomainInput } from "../types/nodeguard.js";
import { getDatabase } from "./database.js";

export const DEFAULT_EXPECTED_STATUS_CODES = [200, 301, 302, 401];

export type StoredDomain = {
  id: string;
  domain: string;
  path: string;
  expectedStatusCodes: number[];
  createdAt: string;
  lastSuccessfulAt: string | null;
  lastFailedAt: string | null;
};

type DomainMonitorRow = {
  id: string;
  domain: string;
  path: string;
  expected_status_codes: string;
  created_at: string;
  last_successful_at: string | null;
  last_failed_at: string | null;
};

type LegacyDomain = {
  id: string;
  domain: string;
  createdAt: string;
};

const database = getDatabase();
const legacyDataFile = path.resolve(process.cwd(), "data", "domain-monitors.json");
let legacyImported = false;
let configuredDomainsSeeded = false;

function parseExpectedStatusCodes(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_EXPECTED_STATUS_CODES;
    }

    return normalizeExpectedStatusCodes(parsed);
  } catch {
    return DEFAULT_EXPECTED_STATUS_CODES;
  }
}

function normalizeExpectedStatusCodes(value: unknown) {
  if (!Array.isArray(value)) {
    return DEFAULT_EXPECTED_STATUS_CODES;
  }

  const codes = [...new Set(
    value
      .map((code) => Number(code))
      .filter((code) => Number.isInteger(code) && code >= 100 && code <= 599)
  )].sort((a, b) => a - b);

  return codes.length > 0 ? codes : DEFAULT_EXPECTED_STATUS_CODES;
}

function normalizePath(value: string | undefined) {
  const raw = (value ?? "/").trim();
  if (!raw) {
    return "/";
  }

  if (/^https?:\/\//i.test(raw)) {
    const parsed = new URL(raw);
    return `${parsed.pathname || "/"}${parsed.search}`;
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}

function rowToDomain(row: DomainMonitorRow): StoredDomain {
  return {
    id: row.id,
    domain: row.domain,
    path: row.path,
    expectedStatusCodes: parseExpectedStatusCodes(row.expected_status_codes),
    createdAt: row.created_at,
    lastSuccessfulAt: row.last_successful_at,
    lastFailedAt: row.last_failed_at
  };
}

export function idForDomain(domain: string, domainPath = "/") {
  const base = domain.replace(/^https?:\/\//, "");
  const suffix = domainPath === "/" ? "" : domainPath;
  return `${base}${suffix}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

export function normalizeDomainInput(input: CreateDomainInput) {
  const raw = input.domain.trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Use http:// or https:// for the domain URL.");
  }

  const domain = parsed.origin;
  const detectedPath = `${parsed.pathname || "/"}${parsed.search}`;
  const domainPath = normalizePath(input.path === undefined ? detectedPath : input.path);
  const expectedStatusCodes = normalizeExpectedStatusCodes(input.expectedStatusCodes);

  return {
    id: idForDomain(domain, domainPath),
    domain,
    path: domainPath,
    expectedStatusCodes
  };
}

export function normalizeDomain(value: string) {
  return normalizeDomainInput({ domain: value });
}

function ensureLegacyImport() {
  if (legacyImported) {
    return;
  }

  legacyImported = true;
  const count = database.prepare("SELECT COUNT(*) AS count FROM domain_monitors").get() as { count: number };
  if (count.count > 0 || !existsSync(legacyDataFile)) {
    return;
  }

  try {
    const domains = JSON.parse(readFileSync(legacyDataFile, "utf8")) as LegacyDomain[];
    const insert = database.prepare(`
      INSERT OR IGNORE INTO domain_monitors (id, domain, path, expected_status_codes, created_at, last_successful_at, last_failed_at)
      VALUES (@id, @domain, @path, @expectedStatusCodes, @createdAt, NULL, NULL)
    `);
    const importDomains = database.transaction((items: LegacyDomain[]) => {
      for (const item of items) {
        const normalized = normalizeDomainInput({ domain: item.domain });
        insert.run({
          id: normalized.id,
          domain: normalized.domain,
          path: normalized.path,
          expectedStatusCodes: JSON.stringify(normalized.expectedStatusCodes),
          createdAt: item.createdAt ?? new Date().toISOString()
        });
      }
    });
    importDomains(domains);
  } catch {
    // Ignore unreadable legacy files; the SQLite database is authoritative.
  }
}

function seedConfiguredDomains() {
  if (configuredDomainsSeeded) {
    return;
  }

  configuredDomainsSeeded = true;
  const insert = database.prepare(`
    INSERT OR IGNORE INTO domain_monitors (id, domain, path, expected_status_codes, created_at, last_successful_at, last_failed_at)
    VALUES (@id, @domain, @path, @expectedStatusCodes, @createdAt, NULL, NULL)
  `);
  const deleted = database.prepare("SELECT id FROM configured_domain_deletions WHERE id = ?");
  const seedDomains = database.transaction((domains: string[]) => {
    for (const value of domains) {
      const normalized = normalizeDomainInput({ domain: value });
      if (deleted.get(normalized.id)) {
        continue;
      }

      insert.run({
        id: normalized.id,
        domain: normalized.domain,
        path: normalized.path,
        expectedStatusCodes: JSON.stringify(normalized.expectedStatusCodes),
        createdAt: new Date().toISOString()
      });
    }
  });

  seedDomains(env.monitoredDomains);
}

export async function listStoredDomains() {
  ensureLegacyImport();
  seedConfiguredDomains();
  const rows = database.prepare("SELECT * FROM domain_monitors ORDER BY created_at ASC").all() as DomainMonitorRow[];
  return rows.map(rowToDomain);
}

export async function addStoredDomain(input: CreateDomainInput) {
  const domain = normalizeDomainInput(input);
  const createdAt = new Date().toISOString();
  ensureLegacyImport();
  seedConfiguredDomains();
  database.prepare("DELETE FROM configured_domain_deletions WHERE id = ?").run(domain.id);
  database.prepare(`
    INSERT INTO domain_monitors (id, domain, path, expected_status_codes, created_at, last_successful_at, last_failed_at)
    VALUES (@id, @domain, @path, @expectedStatusCodes, @createdAt, NULL, NULL)
    ON CONFLICT(id) DO UPDATE SET
      domain = excluded.domain,
      path = excluded.path,
      expected_status_codes = excluded.expected_status_codes
  `).run({
    id: domain.id,
    domain: domain.domain,
    path: domain.path,
    expectedStatusCodes: JSON.stringify(domain.expectedStatusCodes),
    createdAt
  });

  return {
    ...domain,
    createdAt,
    lastSuccessfulAt: null,
    lastFailedAt: null
  };
}

export async function updateStoredDomain(id: string, input: CreateDomainInput) {
  ensureLegacyImport();
  seedConfiguredDomains();
  const existingDomain = database.prepare("SELECT * FROM domain_monitors WHERE id = ?").get(id) as DomainMonitorRow | undefined;
  if (!existingDomain) {
    return null;
  }

  const domain = normalizeDomainInput(input);
  const updateDomain = database.transaction(() => {
    database.prepare("DELETE FROM domain_monitors WHERE id = ?").run(id);
    database.prepare("INSERT OR IGNORE INTO configured_domain_deletions (id, deleted_at) VALUES (?, ?)").run(id, new Date().toISOString());
    database.prepare("DELETE FROM configured_domain_deletions WHERE id = ?").run(domain.id);
    database.prepare(`
      INSERT INTO domain_monitors (id, domain, path, expected_status_codes, created_at, last_successful_at, last_failed_at)
      VALUES (@id, @domain, @path, @expectedStatusCodes, @createdAt, @lastSuccessfulAt, @lastFailedAt)
    `).run({
      id: domain.id,
      domain: domain.domain,
      path: domain.path,
      expectedStatusCodes: JSON.stringify(domain.expectedStatusCodes),
      createdAt: existingDomain.created_at,
      lastSuccessfulAt: existingDomain.last_successful_at,
      lastFailedAt: existingDomain.last_failed_at
    });
  });
  updateDomain();

  return {
    ...domain,
    createdAt: existingDomain.created_at,
    lastSuccessfulAt: existingDomain.last_successful_at,
    lastFailedAt: existingDomain.last_failed_at
  };
}

export async function removeStoredDomain(id: string) {
  ensureLegacyImport();
  seedConfiguredDomains();
  const result = database.prepare("DELETE FROM domain_monitors WHERE id = ?").run(id);
  if (result.changes > 0) {
    database.prepare("INSERT OR IGNORE INTO configured_domain_deletions (id, deleted_at) VALUES (?, ?)").run(id, new Date().toISOString());
  }
  return { removed: result.changes > 0 };
}

export function markStoredDomainResult(id: string, healthy: boolean, checkedAt: string) {
  ensureLegacyImport();
  seedConfiguredDomains();
  database.prepare(`
    UPDATE domain_monitors
    SET last_successful_at = CASE WHEN @healthy THEN @checkedAt ELSE last_successful_at END,
        last_failed_at = CASE WHEN @healthy THEN last_failed_at ELSE @checkedAt END
    WHERE id = @id
  `).run({
    id,
    healthy: healthy ? 1 : 0,
    checkedAt
  });
}
