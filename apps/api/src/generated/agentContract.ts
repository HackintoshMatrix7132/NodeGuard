// Code generated from contracts/agent-contract.json by scripts/generate-agent-contracts.mjs. DO NOT EDIT.

export const AGENT_API_BASE_PATH = "/api/agent" as const;

export const AGENT_ROUTE_PATHS = {
  "register": "/register",
  "status": "/status",
  "heartbeat": "/heartbeat",
  "inventory": "/inventory",
  "metrics": "/metrics",
  "docker": "/docker",
  "updates": "/updates"
} as const;

export const AGENT_ENDPOINTS = {
  "register": "/api/agent/register",
  "status": "/api/agent/status",
  "heartbeat": "/api/agent/heartbeat",
  "inventory": "/api/agent/inventory",
  "metrics": "/api/agent/metrics",
  "docker": "/api/agent/docker",
  "updates": "/api/agent/updates"
} as const;

export type AgentEndpointName = keyof typeof AGENT_ENDPOINTS;

export const AGENT_UPDATE_SCHEMA_VERSION = 1 as const;
export type AgentUpdateSchemaVersion = typeof AGENT_UPDATE_SCHEMA_VERSION;

export const AGENT_UPDATE_PROVIDER = "apt" as const;
export type AgentUpdateProvider = typeof AGENT_UPDATE_PROVIDER;

export const AGENT_UPDATE_STATUSES = [
  "ok",
  "unsupported",
  "package_manager_busy",
  "metadata_refresh_failed",
  "check_failed"
] as const;
export type AgentUpdateStatus = (typeof AGENT_UPDATE_STATUSES)[number];

export const AGENT_UPDATE_ERROR_CODES = [
  "unsupported_os",
  "os_detection_failed",
  "apt_unavailable",
  "package_lock_check_failed",
  "package_manager_busy",
  "metadata_refresh_timeout",
  "metadata_refresh_failed",
  "metadata_output_too_large",
  "check_output_too_large",
  "check_timeout",
  "check_failed",
  "malformed_apt_output",
  "reboot_state_unavailable"
] as const;
export type AgentUpdateErrorCode = (typeof AGENT_UPDATE_ERROR_CODES)[number];

export const AGENT_UPDATE_ALLOWED_ERROR_CODES_BY_STATUS = {
  "ok": [],
  "unsupported": [
    "unsupported_os"
  ],
  "package_manager_busy": [
    "package_manager_busy"
  ],
  "metadata_refresh_failed": [
    "metadata_refresh_timeout",
    "metadata_refresh_failed",
    "metadata_output_too_large"
  ],
  "check_failed": [
    "os_detection_failed",
    "apt_unavailable",
    "package_lock_check_failed",
    "check_timeout",
    "check_failed",
    "malformed_apt_output",
    "check_output_too_large",
    "reboot_state_unavailable"
  ]
} as const satisfies Readonly<Record<AgentUpdateStatus, readonly AgentUpdateErrorCode[]>>;
