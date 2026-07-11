package collectors

import (
	"context"
	"path/filepath"
	"testing"
)

func TestDockerUnavailableDoesNotReturnInventory(t *testing.T) {
	collector := NewDockerCollector(filepath.Join(t.TempDir(), "missing.sock"))
	payload, err := collector.Collect(context.Background())
	if err == nil || payload.Available || len(payload.Containers) != 0 {
		t.Fatal("missing Docker socket was not reported as unavailable")
	}
}

func TestDockerMetadataNormalization(t *testing.T) {
	published, internal := portLists([]listedPort{{PrivatePort: 3000, PublicPort: 8080, Type: "tcp"}})
	if len(published) != 1 || published[0] != "8080:3000/tcp" || len(internal) != 1 || internal[0] != "3000/tcp" {
		t.Fatal("Docker ports were not normalized")
	}
	labels := safeLabels(map[string]string{"com.docker.compose.project": "photos", "secret": "must-not-leave-host"})
	if labels["com.docker.compose.project"] != "photos" || labels["secret"] != "" {
		t.Fatal("Docker label allowlist was not enforced")
	}
}
