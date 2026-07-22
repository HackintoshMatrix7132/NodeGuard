// Code generated from contracts/agent-contract.json by scripts/generate-agent-contracts.mjs. DO NOT EDIT.

package contract

const AgentAPIBasePath = "/api/agent"
const AgentRouteRegister = "/register"
const AgentRouteStatus = "/status"
const AgentRouteHeartbeat = "/heartbeat"
const AgentRouteInventory = "/inventory"
const AgentRouteMetrics = "/metrics"
const AgentRouteDocker = "/docker"
const AgentRouteUpdates = "/updates"

const AgentEndpointRegister = AgentAPIBasePath + AgentRouteRegister
const AgentEndpointStatus = AgentAPIBasePath + AgentRouteStatus
const AgentEndpointHeartbeat = AgentAPIBasePath + AgentRouteHeartbeat
const AgentEndpointInventory = AgentAPIBasePath + AgentRouteInventory
const AgentEndpointMetrics = AgentAPIBasePath + AgentRouteMetrics
const AgentEndpointDocker = AgentAPIBasePath + AgentRouteDocker
const AgentEndpointUpdates = AgentAPIBasePath + AgentRouteUpdates

const AgentUpdateSchemaVersion = 1
const AgentUpdateProvider = "apt"

const AgentUpdateStatusOK = "ok"
const AgentUpdateStatusUnsupported = "unsupported"
const AgentUpdateStatusPackageManagerBusy = "package_manager_busy"
const AgentUpdateStatusMetadataRefreshFailed = "metadata_refresh_failed"
const AgentUpdateStatusCheckFailed = "check_failed"

const AgentUpdateErrorUnsupportedOS = "unsupported_os"
const AgentUpdateErrorOSDetectionFailed = "os_detection_failed"
const AgentUpdateErrorAPTUnavailable = "apt_unavailable"
const AgentUpdateErrorPackageLockCheckFailed = "package_lock_check_failed"
const AgentUpdateErrorPackageManagerBusy = "package_manager_busy"
const AgentUpdateErrorMetadataRefreshTimeout = "metadata_refresh_timeout"
const AgentUpdateErrorMetadataRefreshFailed = "metadata_refresh_failed"
const AgentUpdateErrorMetadataOutputTooLarge = "metadata_output_too_large"
const AgentUpdateErrorCheckOutputTooLarge = "check_output_too_large"
const AgentUpdateErrorCheckTimeout = "check_timeout"
const AgentUpdateErrorCheckFailed = "check_failed"
const AgentUpdateErrorMalformedAPTOutput = "malformed_apt_output"
const AgentUpdateErrorRebootStateUnavailable = "reboot_state_unavailable"

var agentUpdateStatuses = [...]string{
	AgentUpdateStatusOK,
	AgentUpdateStatusUnsupported,
	AgentUpdateStatusPackageManagerBusy,
	AgentUpdateStatusMetadataRefreshFailed,
	AgentUpdateStatusCheckFailed,
}

var agentUpdateErrorCodes = [...]string{
	AgentUpdateErrorUnsupportedOS,
	AgentUpdateErrorOSDetectionFailed,
	AgentUpdateErrorAPTUnavailable,
	AgentUpdateErrorPackageLockCheckFailed,
	AgentUpdateErrorPackageManagerBusy,
	AgentUpdateErrorMetadataRefreshTimeout,
	AgentUpdateErrorMetadataRefreshFailed,
	AgentUpdateErrorMetadataOutputTooLarge,
	AgentUpdateErrorCheckOutputTooLarge,
	AgentUpdateErrorCheckTimeout,
	AgentUpdateErrorCheckFailed,
	AgentUpdateErrorMalformedAPTOutput,
	AgentUpdateErrorRebootStateUnavailable,
}

var agentUpdateAllowedErrorCodesByStatus = map[string][]string{
	AgentUpdateStatusOK:                    {},
	AgentUpdateStatusUnsupported:           {AgentUpdateErrorUnsupportedOS},
	AgentUpdateStatusPackageManagerBusy:    {AgentUpdateErrorPackageManagerBusy},
	AgentUpdateStatusMetadataRefreshFailed: {AgentUpdateErrorMetadataRefreshTimeout, AgentUpdateErrorMetadataRefreshFailed, AgentUpdateErrorMetadataOutputTooLarge},
	AgentUpdateStatusCheckFailed:           {AgentUpdateErrorOSDetectionFailed, AgentUpdateErrorAPTUnavailable, AgentUpdateErrorPackageLockCheckFailed, AgentUpdateErrorCheckTimeout, AgentUpdateErrorCheckFailed, AgentUpdateErrorMalformedAPTOutput, AgentUpdateErrorCheckOutputTooLarge, AgentUpdateErrorRebootStateUnavailable},
}
