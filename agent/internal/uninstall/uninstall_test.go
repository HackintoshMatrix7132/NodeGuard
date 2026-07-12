package uninstall

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type fakeRunner struct {
	commands [][]string
}

func (runner *fakeRunner) Run(name string, args ...string) error {
	runner.commands = append(runner.commands, append([]string{name}, args...))
	return nil
}

func createInstallation(t *testing.T) Options {
	t.Helper()
	directory := t.TempDir()
	options := Options{
		BinaryPath: filepath.Join(directory, "bin", "nodeguard-agent"),
		ConfigDir:  filepath.Join(directory, "etc", "nodeguard-agent"),
		UnitPath:   filepath.Join(directory, "systemd", "nodeguard-agent.service"),
	}
	for _, path := range []string{options.BinaryPath, filepath.Join(options.ConfigDir, "config.json"), options.UnitPath} {
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("test"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return options
}

func TestExecutePreservesConfigurationByDefault(t *testing.T) {
	options := createInstallation(t)
	runner := &fakeRunner{}
	var output bytes.Buffer
	if err := Execute(options, bytes.NewBuffer(nil), &output, runner); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(options.BinaryPath); !os.IsNotExist(err) {
		t.Fatalf("binary still exists: %v", err)
	}
	if _, err := os.Stat(filepath.Join(options.ConfigDir, "config.json")); err != nil {
		t.Fatalf("configuration was not preserved: %v", err)
	}
	expected := [][]string{{"systemctl", "disable", "--now", ServiceName}, {"systemctl", "daemon-reload"}}
	if !reflect.DeepEqual(runner.commands, expected) {
		t.Fatalf("unexpected commands: %#v", runner.commands)
	}
}

func TestExecutePurgesOnlyAfterConfirmation(t *testing.T) {
	options := createInstallation(t)
	options.Purge = true
	runner := &fakeRunner{}
	if err := Execute(options, bytes.NewBufferString("no\n"), &bytes.Buffer{}, runner); err == nil {
		t.Fatal("expected declined purge to fail")
	}
	if _, err := os.Stat(options.BinaryPath); err != nil {
		t.Fatalf("declined purge changed installation: %v", err)
	}

	if err := Execute(options, bytes.NewBufferString("yes\n"), &bytes.Buffer{}, runner); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(options.ConfigDir); !os.IsNotExist(err) {
		t.Fatalf("configuration still exists: %v", err)
	}
}
