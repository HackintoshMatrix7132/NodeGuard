package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func validConfig() Config {
	return Config{
		ServerURL: "http://127.0.0.1:3000", AgentID: "agent-id", Credential: "secret",
		DisplayName: "test", HeartbeatIntervalSeconds: 20, MetricsIntervalSeconds: 30,
		DockerIntervalSeconds: 60, InventoryIntervalSeconds: 3600,
		UpdateIntervalSeconds: DefaultUpdateIntervalSeconds, DockerEnabled: true,
	}
}

func TestLoadDefaultsMissingUpdateInterval(t *testing.T) {
	directory := t.TempDir()
	if err := os.Chmod(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, "config.json")
	data := []byte(`{
  "serverUrl": "http://127.0.0.1:3000",
  "agentId": "agent-id",
  "credential": "secret",
  "heartbeatIntervalSeconds": 20,
  "metricsIntervalSeconds": 30,
  "dockerIntervalSeconds": 60,
  "inventoryIntervalSeconds": 3600
}`)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.UpdateIntervalSeconds != DefaultUpdateIntervalSeconds {
		t.Fatalf("update interval = %d, want %d", loaded.UpdateIntervalSeconds, DefaultUpdateIntervalSeconds)
	}
}

func TestUpdateIntervalMinimum(t *testing.T) {
	cfg := validConfig()
	cfg.UpdateIntervalSeconds = MinimumUpdateIntervalSeconds - 1
	if err := cfg.Validate(); err == nil {
		t.Fatal("unsafe update interval was accepted")
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

func TestPreflightSaveDoesNotReplaceExistingConfiguration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nodeguard", "config.json")
	if err := Save(path, validConfig()); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := PreflightSave(path); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(before) {
		t.Fatal("preflight changed the existing credential")
	}
}

func TestLoadRejectsUnsafeCredentialPaths(t *testing.T) {
	t.Run("world-readable", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "config.json")
		if err := Save(path, validConfig()); err != nil {
			t.Fatal(err)
		}
		if err := os.Chmod(path, 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := Load(path); err == nil {
			t.Fatal("world-readable credential was accepted")
		}
	})
	t.Run("unsafe-parent", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "config", "config.json")
		if err := Save(path, validConfig()); err != nil {
			t.Fatal(err)
		}
		if err := os.Chmod(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if _, err := Load(path); err == nil {
			t.Fatal("credential under unsafe parent was accepted")
		}
	})
	t.Run("symlink-file", func(t *testing.T) {
		directory := t.TempDir()
		target := filepath.Join(directory, "target.json")
		if err := Save(target, validConfig()); err != nil {
			t.Fatal(err)
		}
		link := filepath.Join(directory, "config.json")
		if err := os.Symlink(target, link); err != nil {
			t.Fatal(err)
		}
		if _, err := Load(link); err == nil {
			t.Fatal("symlink credential was accepted")
		}
	})
	t.Run("symlink-parent", func(t *testing.T) {
		root := t.TempDir()
		targetDirectory := filepath.Join(root, "target")
		path := filepath.Join(targetDirectory, "config.json")
		if err := Save(path, validConfig()); err != nil {
			t.Fatal(err)
		}
		link := filepath.Join(root, "linked")
		if err := os.Symlink(targetDirectory, link); err != nil {
			t.Fatal(err)
		}
		if _, err := Load(filepath.Join(link, "config.json")); err == nil {
			t.Fatal("credential under symlink parent was accepted")
		}
	})
}

func TestPreparedSaveCommitsAndCleansRecoveryFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nodeguard", "config.json")
	prepared, err := PrepareSave(path)
	if err != nil {
		t.Fatal(err)
	}
	defer prepared.Abort()
	if err := prepared.Commit(validConfig()); err != nil {
		t.Fatal(err)
	}
	if prepared.RecoveryPath() != "" {
		t.Fatal("successful commit retained a recovery path")
	}
	if _, err := Load(path); err != nil {
		t.Fatalf("committed configuration unavailable: %v", err)
	}
	matches, err := filepath.Glob(filepath.Join(filepath.Dir(path), ".config-recovery-*"))
	if err != nil || len(matches) != 0 {
		t.Fatalf("unexpected recovery files: %v err=%v", matches, err)
	}
}

func TestPreparedSaveFailureKeepsProtectedRecoveryAndOldConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nodeguard", "config.json")
	old := validConfig()
	old.Credential = "old-credential"
	if err := Save(path, old); err != nil {
		t.Fatal(err)
	}
	prepared, err := PrepareSave(path)
	if err != nil {
		t.Fatal(err)
	}
	prepared.rename = func(string, string) error { return errors.New("simulated atomic rename failure") }
	newConfig := validConfig()
	newConfig.Credential = "new-credential"
	if err := prepared.Commit(newConfig); err == nil {
		t.Fatal("simulated commit failure succeeded")
	}
	prepared.Abort()
	loaded, err := Load(path)
	if err != nil || loaded.Credential != old.Credential {
		t.Fatalf("old active config changed: cfg=%#v err=%v", loaded, err)
	}
	recoveryPath := prepared.RecoveryPath()
	if recoveryPath == "" {
		t.Fatal("new credential recovery path was lost")
	}
	data, err := os.ReadFile(recoveryPath)
	if err != nil || !strings.Contains(string(data), "new-credential") {
		t.Fatalf("recovery credential unavailable: err=%v", err)
	}
	info, err := os.Stat(recoveryPath)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("recovery mode unsafe: info=%v err=%v", info, err)
	}
}
