package config

import (
	"os"
	"path/filepath"
	"testing"
)

func validConfig() Config {
	return Config{
		ServerURL: "http://127.0.0.1:3000", AgentID: "agent-id", Credential: "secret",
		DisplayName: "test", HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30,
		DockerIntervalSeconds: 60, InventoryIntervalSeconds: 3600, DockerEnabled: true,
	}
}

func TestValidateServerURL(t *testing.T) {
	if _, err := ValidateServerURL("https://nodeguard.example"); err != nil {
		t.Fatalf("HTTPS URL rejected: %v", err)
	}
	if _, err := ValidateServerURL("http://192.0.2.10:3000"); err == nil {
		t.Fatal("non-loopback HTTP URL was accepted")
	}
	if _, err := ValidateServerURL("http://127.0.0.1:3000"); err != nil {
		t.Fatalf("loopback development URL rejected: %v", err)
	}
}

func TestSaveAndLoadProtectedConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nodeguard", "config.json")
	if err := Save(path, validConfig()); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("configuration mode = %o, want 600", info.Mode().Perm())
	}
	loaded, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Credential != "secret" || loaded.AgentID != "agent-id" {
		t.Fatal("saved configuration did not round-trip")
	}
}
