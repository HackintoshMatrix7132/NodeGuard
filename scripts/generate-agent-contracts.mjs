#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repositoryRoot, "contracts", "agent-contract.json");
const generatedPaths = [
  "apps/api/src/generated/agentContract.ts",
  "apps/web/src/generated/agentContract.ts",
  "agent/internal/contract/agent_contract.gen.go"
];
const requiredRoutes = ["register", "status", "heartbeat", "inventory", "metrics", "docker", "updates"];
const tokenPattern = /^[a-z][a-z0-9_]*$/;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function uniqueStrings(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || !tokenPattern.test(entry))) {
    throw new Error(`${label} must be a non-empty array of lowercase protocol tokens.`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates.`);
  return value;
}

export function validateManifest(input) {
  const manifest = object(input, "contract manifest");
  if (manifest.manifestVersion !== 1) throw new Error("manifestVersion must be 1.");

  const agentApi = object(manifest.agentApi, "agentApi");
  if (typeof agentApi.basePath !== "string" || !/^\/[a-z0-9/-]+$/.test(agentApi.basePath) || agentApi.basePath.endsWith("/")) {
    throw new Error("agentApi.basePath must be an absolute path without a trailing slash.");
  }
  const routes = object(agentApi.routes, "agentApi.routes");
  if (JSON.stringify(Object.keys(routes).sort()) !== JSON.stringify([...requiredRoutes].sort())) {
    throw new Error(`agentApi.routes must define exactly: ${requiredRoutes.join(", ")}.`);
  }
  for (const [name, route] of Object.entries(routes)) {
    if (typeof route !== "string" || !/^\/[a-z0-9/-]+$/.test(route) || route.endsWith("/")) {
      throw new Error(`agentApi.routes.${name} must be an absolute route suffix without a trailing slash.`);
    }
  }
  if (new Set(Object.values(routes)).size !== Object.keys(routes).length) {
    throw new Error("agentApi.routes must not contain duplicate route suffixes.");
  }

  const updates = object(manifest.updates, "updates");
  if (!Number.isSafeInteger(updates.schemaVersion) || updates.schemaVersion < 1) {
    throw new Error("updates.schemaVersion must be a positive integer.");
  }
  if (typeof updates.provider !== "string" || !tokenPattern.test(updates.provider)) {
    throw new Error("updates.provider must be a lowercase protocol token.");
  }
  const statuses = uniqueStrings(updates.statuses, "updates.statuses");
  if (!statuses.includes("ok")) throw new Error("updates.statuses must include ok.");
  const errorCodes = uniqueStrings(updates.errorCodes, "updates.errorCodes");
  const mappings = object(updates.allowedErrorCodesByStatus, "updates.allowedErrorCodesByStatus");
  if (JSON.stringify(Object.keys(mappings).sort()) !== JSON.stringify([...statuses].sort())) {
    throw new Error("updates.allowedErrorCodesByStatus must define every update status exactly once.");
  }
  if (!Array.isArray(mappings.ok) || mappings.ok.length !== 0) {
    throw new Error("The ok status must not allow error codes.");
  }

  const assignedCodes = [];
  for (const status of statuses) {
    const allowed = mappings[status];
    if (!Array.isArray(allowed) || allowed.some((code) => typeof code !== "string" || !errorCodes.includes(code))) {
      throw new Error(`Allowed error codes for ${status} must come from updates.errorCodes.`);
    }
    if (new Set(allowed).size !== allowed.length) throw new Error(`Allowed error codes for ${status} must not contain duplicates.`);
    assignedCodes.push(...allowed);
  }
  if (JSON.stringify([...assignedCodes].sort()) !== JSON.stringify([...errorCodes].sort())) {
    throw new Error("Every update error code must be assigned to exactly one status.");
  }

  return manifest;
}

function readManifest() {
  return validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
}

function generatedHeader(source, comment = "//") {
  return `${comment} Code generated from ${source} by scripts/generate-agent-contracts.mjs. DO NOT EDIT.\n`;
}

function pascalCase(value) {
  const initialisms = new Map([["api", "API"], ["apt", "APT"], ["id", "ID"], ["ok", "OK"], ["os", "OS"]]);
  return value.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => {
    const normalized = part.toLowerCase();
    return initialisms.get(normalized) ?? `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
  }).join("");
}

function renderTypeScript(manifest) {
  const { agentApi, updates } = manifest;
  const routePaths = JSON.stringify(agentApi.routes, null, 2);
  const endpoints = Object.fromEntries(Object.entries(agentApi.routes).map(([name, route]) => [name, `${agentApi.basePath}${route}`]));
  return `${generatedHeader("contracts/agent-contract.json")}\n` +
    `export const AGENT_API_BASE_PATH = ${JSON.stringify(agentApi.basePath)} as const;\n\n` +
    `export const AGENT_ROUTE_PATHS = ${routePaths} as const;\n\n` +
    `export const AGENT_ENDPOINTS = ${JSON.stringify(endpoints, null, 2)} as const;\n\n` +
    `export type AgentEndpointName = keyof typeof AGENT_ENDPOINTS;\n\n` +
    `export const AGENT_UPDATE_SCHEMA_VERSION = ${updates.schemaVersion} as const;\n` +
    `export type AgentUpdateSchemaVersion = typeof AGENT_UPDATE_SCHEMA_VERSION;\n\n` +
    `export const AGENT_UPDATE_PROVIDER = ${JSON.stringify(updates.provider)} as const;\n` +
    `export type AgentUpdateProvider = typeof AGENT_UPDATE_PROVIDER;\n\n` +
    `export const AGENT_UPDATE_STATUSES = ${JSON.stringify(updates.statuses, null, 2)} as const;\n` +
    `export type AgentUpdateStatus = (typeof AGENT_UPDATE_STATUSES)[number];\n\n` +
    `export const AGENT_UPDATE_ERROR_CODES = ${JSON.stringify(updates.errorCodes, null, 2)} as const;\n` +
    `export type AgentUpdateErrorCode = (typeof AGENT_UPDATE_ERROR_CODES)[number];\n\n` +
    `export const AGENT_UPDATE_ALLOWED_ERROR_CODES_BY_STATUS = ${JSON.stringify(updates.allowedErrorCodesByStatus, null, 2)} as const satisfies Readonly<Record<AgentUpdateStatus, readonly AgentUpdateErrorCode[]>>;\n`;
}

function renderGo(manifest) {
  const { agentApi, updates } = manifest;
  const lines = [
    generatedHeader("contracts/agent-contract.json").trimEnd(),
    "",
    "package contract",
    "",
    `const AgentAPIBasePath = ${JSON.stringify(agentApi.basePath)}`
  ];
  for (const [name, route] of Object.entries(agentApi.routes)) {
    lines.push(`const AgentRoute${pascalCase(name)} = ${JSON.stringify(route)}`);
  }
  lines.push("");
  for (const name of Object.keys(agentApi.routes)) {
    lines.push(`const AgentEndpoint${pascalCase(name)} = AgentAPIBasePath + AgentRoute${pascalCase(name)}`);
  }
  lines.push("", `const AgentUpdateSchemaVersion = ${updates.schemaVersion}`, `const AgentUpdateProvider = ${JSON.stringify(updates.provider)}`);
  lines.push("");
  for (const status of updates.statuses) {
    lines.push(`const AgentUpdateStatus${pascalCase(status)} = ${JSON.stringify(status)}`);
  }
  lines.push("");
  for (const code of updates.errorCodes) {
    lines.push(`const AgentUpdateError${pascalCase(code)} = ${JSON.stringify(code)}`);
  }
  lines.push("", "var agentUpdateStatuses = [...]string{");
  for (const status of updates.statuses) lines.push(`\tAgentUpdateStatus${pascalCase(status)},`);
  lines.push("}", "", "var agentUpdateErrorCodes = [...]string{");
  for (const code of updates.errorCodes) lines.push(`\tAgentUpdateError${pascalCase(code)},`);
  lines.push("}", "", "var agentUpdateAllowedErrorCodesByStatus = map[string][]string{");
  const statusConstantNames = updates.statuses.map((status) => `AgentUpdateStatus${pascalCase(status)}`);
  const longestStatusConstant = Math.max(...statusConstantNames.map((name) => name.length));
  for (const status of updates.statuses) {
    const allowed = updates.allowedErrorCodesByStatus[status];
    const values = allowed.map((code) => `AgentUpdateError${pascalCase(code)}`).join(", ");
    const statusConstant = `AgentUpdateStatus${pascalCase(status)}`;
    lines.push(`\t${statusConstant}:${" ".repeat(longestStatusConstant - statusConstant.length + 1)}{${values}},`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

export function renderArtifacts(manifest) {
  const typescript = renderTypeScript(validateManifest(manifest));
  return new Map([
    [generatedPaths[0], typescript],
    [generatedPaths[1], typescript],
    [generatedPaths[2], renderGo(manifest)]
  ]);
}

export function findArtifactDrift(artifacts, readArtifact) {
  const drift = [];
  for (const [relativePath, expected] of artifacts) {
    let actual;
    try {
      actual = readArtifact(relativePath);
    } catch {
      drift.push(relativePath);
      continue;
    }
    if (actual !== expected) drift.push(relativePath);
  }
  return drift;
}

function generate(artifacts) {
  for (const [relativePath, content] of artifacts) {
    const outputPath = path.join(repositoryRoot, relativePath);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content);
  }
  console.log(`Generated ${artifacts.size} Agent contract outputs.`);
}

function check(artifacts) {
  const drift = findArtifactDrift(artifacts, (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
  if (drift.length) {
    console.error("Generated Agent contracts are missing or stale:");
    for (const relativePath of drift) console.error(`- ${relativePath}`);
    console.error("Run npm run contracts:generate and commit the generated outputs.");
    process.exitCode = 1;
    return;
  }
  console.log("Generated Agent contracts are current.");
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check") || args.filter((arg) => arg === "--check").length > 1) {
    throw new Error("Usage: node scripts/generate-agent-contracts.mjs [--check]");
  }
  const artifacts = renderArtifacts(readManifest());
  if (args.includes("--check")) {
    check(artifacts);
  } else {
    generate(artifacts);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
