package contract

import (
	"strings"
	"testing"
)

func TestGeneratedAgentEndpointsRemainUnderTheCanonicalBasePath(t *testing.T) {
	for name, endpoint := range map[string]string{
		"register":  AgentEndpointRegister,
		"status":    AgentEndpointStatus,
		"heartbeat": AgentEndpointHeartbeat,
		"inventory": AgentEndpointInventory,
		"metrics":   AgentEndpointMetrics,
		"docker":    AgentEndpointDocker,
		"updates":   AgentEndpointUpdates,
	} {
		if !strings.HasPrefix(endpoint, AgentAPIBasePath+"/") {
			t.Fatalf("%s endpoint %q is outside %q", name, endpoint, AgentAPIBasePath)
		}
	}
}

func TestGeneratedUpdateErrorMappingsCoverEveryCodeOnce(t *testing.T) {
	statuses := make(map[string]bool, len(agentUpdateStatuses))
	for _, status := range agentUpdateStatuses {
		if statuses[status] {
			t.Fatalf("duplicate update status %q", status)
		}
		statuses[status] = true
	}
	if len(agentUpdateAllowedErrorCodesByStatus[AgentUpdateStatusOK]) != 0 {
		t.Fatal("successful update inventories must not allow error codes")
	}

	knownCodes := make(map[string]bool, len(agentUpdateErrorCodes))
	for _, code := range agentUpdateErrorCodes {
		knownCodes[code] = true
	}
	assignedCodes := make(map[string]string, len(agentUpdateErrorCodes))
	for status, codes := range agentUpdateAllowedErrorCodesByStatus {
		if !statuses[status] {
			t.Fatalf("error-code mapping has unknown status %q", status)
		}
		for _, code := range codes {
			if !knownCodes[code] {
				t.Fatalf("status %q allows unknown error code %q", status, code)
			}
			if previous, exists := assignedCodes[code]; exists {
				t.Fatalf("error code %q is assigned to both %q and %q", code, previous, status)
			}
			assignedCodes[code] = status
		}
	}
	if len(assignedCodes) != len(knownCodes) {
		t.Fatalf("mapped %d of %d update error codes", len(assignedCodes), len(knownCodes))
	}
}
