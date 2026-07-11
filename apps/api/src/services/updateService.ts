import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "../config/env.js";
import type { HomeAssistantSettings, HomeAssistantSettingsInput, UpdateCategory, UpdateCenterSnapshot, UpdateItem, UpdateSource } from "../types/nodeguard.js";
import { getDatabase } from "./database.js";

type IntegrationRow = {
  id: string;
  base_url: string;
  encrypted_secret: string;
  secret_iv: string;
  secret_tag: string;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type UpdateRow = {
  id: string;
  source_id: string;
  source_name: string;
  name: string;
  installed_version: string | null;
  available_version: string | null;
  category: UpdateCategory;
  status: UpdateItem["status"];
  security_critical: number;
  last_checked_at: string;
  open_url: string | null;
  release_notes_url: string | null;
};

type HomeAssistantState = {
  entity_id?: unknown;
  state?: unknown;
  attributes?: Record<string, unknown>;
};

const database = getDatabase();
const homeAssistantSourceId = "home_assistant";

function integrationKey() {
  if (!env.integrationSecret.trim()) {
    throw new Error("NODEGUARD_INTEGRATION_SECRET must be configured before storing integration credentials.");
  }
  return createHash("sha256").update(env.integrationSecret).digest();
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", integrationKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function decryptSecret(row: IntegrationRow) {
  const decipher = createDecipheriv("aes-256-gcm", integrationKey(), Buffer.from(row.secret_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.secret_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_secret, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function normalizeUrl(value: string) {
  const parsed = new URL(value.trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("Home Assistant URL must use http:// or https://.");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function stringAttribute(attributes: Record<string, unknown>, key: string) {
  const value = attributes[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function updateCategory(entityId: string, attributes: Record<string, unknown>): UpdateCategory {
  const text = [
    entityId,
    stringAttribute(attributes, "friendly_name"),
    stringAttribute(attributes, "title"),
    stringAttribute(attributes, "device_class")
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("home assistant core") || entityId === "update.home_assistant_core_update") return "core";
  if (text.includes("add-on") || text.includes("addon")) return "add-on";
  if (text.includes("firmware") || text.includes("device firmware")) return "firmware";
  if (text.includes("integration") || text.includes("hacs")) return "integration";
  return "application";
}

function isSecurityCritical(attributes: Record<string, unknown>) {
  if (attributes.security === true || attributes.security_critical === true) return true;
  const text = [
    stringAttribute(attributes, "friendly_name"),
    stringAttribute(attributes, "title"),
    stringAttribute(attributes, "release_summary")
  ].filter(Boolean).join(" ").toLowerCase();
  return /security[- ]critical|critical security update/.test(text);
}

export function normalizeHomeAssistantUpdates(states: HomeAssistantState[], baseUrl: string, checkedAt = new Date().toISOString()): UpdateItem[] {
  return states.flatMap((entry) => {
    if (typeof entry.entity_id !== "string" || !entry.entity_id.startsWith("update.")) return [];
    const attributes = entry.attributes ?? {};
    const state = typeof entry.state === "string" ? entry.state : "unknown";
    const status: UpdateItem["status"] = attributes.in_progress === true
      ? "installing"
      : state === "on"
        ? "available"
        : state === "off"
          ? "up_to_date"
          : "unknown";
    const fallbackName = entry.entity_id.slice("update.".length).replace(/_/g, " ");
    const name = stringAttribute(attributes, "friendly_name") ?? stringAttribute(attributes, "title") ?? fallbackName;

    return [{
      id: `${homeAssistantSourceId}:${entry.entity_id}`,
      sourceId: homeAssistantSourceId,
      sourceName: "Home Assistant",
      name,
      installedVersion: stringAttribute(attributes, "installed_version"),
      availableVersion: stringAttribute(attributes, "latest_version"),
      category: updateCategory(entry.entity_id, attributes),
      status,
      securityCritical: isSecurityCritical(attributes),
      lastCheckedAt: checkedAt,
      openUrl: `${baseUrl}/config/updates`,
      releaseNotesUrl: safeHttpUrl(stringAttribute(attributes, "release_url"))
    }];
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function rowToUpdate(row: UpdateRow): UpdateItem {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    name: row.name,
    installedVersion: row.installed_version,
    availableVersion: row.available_version,
    category: row.category,
    status: row.status,
    securityCritical: Boolean(row.security_critical),
    lastCheckedAt: row.last_checked_at,
    openUrl: row.open_url,
    releaseNotesUrl: row.release_notes_url
  };
}

function getHomeAssistantRow() {
  return database.prepare("SELECT * FROM integration_settings WHERE id = ?").get(homeAssistantSourceId) as IntegrationRow | undefined;
}

function sourceFromRow(row?: IntegrationRow): UpdateSource {
  return {
    id: homeAssistantSourceId,
    name: "Home Assistant",
    configured: Boolean(row),
    connected: Boolean(row && row.last_checked_at && !row.last_error),
    lastCheckedAt: row?.last_checked_at ?? null,
    lastError: row?.last_error ?? null
  };
}

export function getHomeAssistantSettings(): HomeAssistantSettings {
  const row = getHomeAssistantRow();
  return {
    configured: Boolean(row),
    url: row?.base_url ?? null,
    lastCheckedAt: row?.last_checked_at ?? null,
    lastError: row?.last_error ?? null
  };
}

function listStoredUpdates() {
  return (database.prepare("SELECT * FROM update_records ORDER BY source_name, name").all() as UpdateRow[]).map(rowToUpdate);
}

export function getUpdateCenterSnapshot(): UpdateCenterSnapshot {
  const updates = listStoredUpdates();
  const available = updates.filter((update) => update.status === "available");
  const row = getHomeAssistantRow();
  const lastCheckedAt = updates.reduce<string | null>((latest, update) => !latest || update.lastCheckedAt > latest ? update.lastCheckedAt : latest, row?.last_checked_at ?? null);
  return {
    updates,
    sources: [sourceFromRow(row)],
    availableCount: available.length,
    securityCriticalCount: available.filter((update) => update.securityCritical).length,
    lastCheckedAt
  };
}

async function fetchHomeAssistantStates(url: string, token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.updateCheckTimeoutMs);
  try {
    const response = await fetch(`${url}/api/states`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(response.status === 401 ? "Home Assistant rejected the access token." : `Home Assistant returned HTTP ${response.status}.`);
    }
    const body = await response.json() as unknown;
    if (!Array.isArray(body)) throw new Error("Home Assistant returned an unexpected response.");
    return body as HomeAssistantState[];
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Home Assistant connection timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function connectionValues(input?: HomeAssistantSettingsInput) {
  const row = getHomeAssistantRow();
  const url = input?.url ? normalizeUrl(input.url) : row?.base_url;
  const suppliedToken = input?.accessToken?.trim();
  const token = suppliedToken || (row ? decryptSecret(row) : null);
  if (!url) throw new Error("Enter the Home Assistant URL.");
  if (!token) throw new Error("Enter a Home Assistant long-lived access token.");
  return { url, token };
}

export async function testHomeAssistantConnection(input: HomeAssistantSettingsInput) {
  const values = await connectionValues(input);
  const states = await fetchHomeAssistantStates(values.url, values.token);
  return { connected: true, updateEntities: states.filter((entry) => typeof entry.entity_id === "string" && entry.entity_id.startsWith("update.")).length };
}

export async function saveHomeAssistantSettings(input: HomeAssistantSettingsInput) {
  const values = await connectionValues(input);
  await fetchHomeAssistantStates(values.url, values.token);
  const encrypted = encryptSecret(values.token);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO integration_settings (id, base_url, encrypted_secret, secret_iv, secret_tag, last_checked_at, last_error, created_at, updated_at)
    VALUES (@id, @baseUrl, @encrypted, @iv, @tag, @checkedAt, NULL, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      base_url = excluded.base_url,
      encrypted_secret = excluded.encrypted_secret,
      secret_iv = excluded.secret_iv,
      secret_tag = excluded.secret_tag,
      last_checked_at = excluded.last_checked_at,
      last_error = NULL,
      updated_at = excluded.updated_at
  `).run({ id: homeAssistantSourceId, baseUrl: values.url, ...encrypted, checkedAt: now, createdAt: now, updatedAt: now });
  await refreshUpdates();
  return getHomeAssistantSettings();
}

function replaceSourceUpdates(sourceId: string, updates: UpdateItem[]) {
  const replace = database.transaction(() => {
    database.prepare("DELETE FROM update_records WHERE source_id = ?").run(sourceId);
    const insert = database.prepare(`
      INSERT INTO update_records (
        id, source_id, source_name, name, installed_version, available_version, category, status,
        security_critical, last_checked_at, open_url, release_notes_url
      ) VALUES (
        @id, @sourceId, @sourceName, @name, @installedVersion, @availableVersion, @category, @status,
        @securityCritical, @lastCheckedAt, @openUrl, @releaseNotesUrl
      )
    `);
    for (const update of updates) insert.run({ ...update, securityCritical: update.securityCritical ? 1 : 0 });
  });
  replace();
}

export async function refreshUpdates(): Promise<UpdateCenterSnapshot> {
  const row = getHomeAssistantRow();
  if (!row) return getUpdateCenterSnapshot();
  const checkedAt = new Date().toISOString();
  try {
    const states = await fetchHomeAssistantStates(row.base_url, decryptSecret(row));
    replaceSourceUpdates(homeAssistantSourceId, normalizeHomeAssistantUpdates(states, row.base_url, checkedAt));
    database.prepare("UPDATE integration_settings SET last_checked_at = ?, last_error = NULL, updated_at = ? WHERE id = ?").run(checkedAt, checkedAt, homeAssistantSourceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Home Assistant update check failed.";
    database.prepare("UPDATE integration_settings SET last_checked_at = ?, last_error = ?, updated_at = ? WHERE id = ?").run(checkedAt, message, checkedAt, homeAssistantSourceId);
  }
  return getUpdateCenterSnapshot();
}

export function getUpdateAlerts() {
  const snapshot = getUpdateCenterSnapshot();
  const available = snapshot.updates.filter((update) => update.status === "available");
  if (available.length === 0) return [];
  const checkedAt = snapshot.lastCheckedAt ?? new Date().toISOString();
  const standardCount = available.length - snapshot.securityCriticalCount;
  const alerts = [];
  if (standardCount > 0) {
    alerts.push({ count: standardCount, securityCritical: false, checkedAt });
  }
  if (snapshot.securityCriticalCount > 0) {
    alerts.push({ count: snapshot.securityCriticalCount, securityCritical: true, checkedAt });
  }
  return alerts;
}

let refreshTimer: NodeJS.Timeout | null = null;

export function startUpdateRefreshScheduler() {
  if (refreshTimer) return;
  void refreshUpdates();
  refreshTimer = setInterval(() => void refreshUpdates(), env.updateRefreshIntervalMinutes * 60 * 1000);
  refreshTimer.unref();
}
