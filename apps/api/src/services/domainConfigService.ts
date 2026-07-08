import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CreateDomainInput } from "../types/nodeguard.js";

type StoredDomain = {
  id: string;
  domain: string;
  createdAt: string;
};

const dataDir = path.resolve(process.cwd(), "data");
const dataFile = path.join(dataDir, "domain-monitors.json");

export function idForDomain(domain: string) {
  return domain.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

export function normalizeDomain(value: string) {
  const raw = value.trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Use http:// or https:// for the domain URL.");
  }

  return parsed.toString().replace(/\/$/, "");
}

async function readStoredDomains(): Promise<StoredDomain[]> {
  try {
    const raw = await readFile(dataFile, "utf8");
    return JSON.parse(raw) as StoredDomain[];
  } catch {
    return [];
  }
}

async function writeStoredDomains(domains: StoredDomain[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(domains, null, 2)}\n`, "utf8");
}

export async function listStoredDomains() {
  return readStoredDomains();
}

export async function addStoredDomain(input: CreateDomainInput) {
  const domain = normalizeDomain(input.domain);
  const domains = await readStoredDomains();
  const nextDomain: StoredDomain = {
    id: idForDomain(domain),
    domain,
    createdAt: new Date().toISOString()
  };
  await writeStoredDomains([...domains.filter((item) => item.id !== nextDomain.id), nextDomain]);
  return nextDomain;
}

export async function updateStoredDomain(id: string, input: CreateDomainInput) {
  const domains = await readStoredDomains();
  const existingDomain = domains.find((domain) => domain.id === id);
  if (!existingDomain) {
    return null;
  }

  const domain = normalizeDomain(input.domain);
  const updatedDomain: StoredDomain = {
    ...existingDomain,
    id: idForDomain(domain),
    domain
  };
  await writeStoredDomains(domains.map((item) => (item.id === id ? updatedDomain : item)));
  return updatedDomain;
}

export async function removeStoredDomain(id: string) {
  const domains = await readStoredDomains();
  const nextDomains = domains.filter((domain) => domain.id !== id);
  await writeStoredDomains(nextDomains);
  return { removed: nextDomains.length !== domains.length };
}
