package uninstall

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/identity"
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
		StateDir:   filepath.Join(directory, "var", "lib", "nodeguard-agent"),
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
	if _, _, err := identity.Ensure(options.StateDir); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(options.StateDir, "runtime-cache"), []byte("test"), 0o600); err != nil {
		t.Fatal(err)
	}
	return options
}

func TestExecutePreservesOnlyStableIdentityByDefault(t *testing.T) {
	options := createInstallation(t)
	runner := &fakeRunner{}
	var output bytes.Buffer
	if err := Execute(options, bytes.NewBuffer(nil), &output, runner); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(options.BinaryPath); !os.IsNotExist(err) {
		t.Fatalf("binary still exists: %v", err)
	}
	if _, err := os.Stat(options.ConfigDir); !os.IsNotExist(err) {
		t.Fatalf("configuration was not removed: %v", err)
	}
	if _, err := identity.Load(options.StateDir); err != nil {
		t.Fatalf("machine identity was not preserved: %v", err)
	}
	if _, err := os.Stat(filepath.Join(options.StateDir, "runtime-cache")); !os.IsNotExist(err) {
		t.Fatalf("runtime cache was not removed: %v", err)
	}
	expected := [][]string{{"systemctl", "disable", "--now", ServiceName}, {"systemctl", "daemon-reload"}}
	if !reflect.DeepEqual(runner.commands, expected) {
		t.Fatalf("unexpected commands: %#v", runner.commands)
	}
	if err := Execute(options, bytes.NewBuffer(nil), &output, runner); err != nil {
		t.Fatalf("second uninstall was not idempotent: %v", err)
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
	if _, err := os.Stat(options.StateDir); !os.IsNotExist(err) {
		t.Fatalf("state directory still exists: %v", err)
	}
}

func TestExecutePurgeYesDoesNotPrompt(t *testing.T) {
	options := createInstallation(t)
	options.Purge = true
	options.AssumeYes = true
	if err := Execute(options, bytes.NewBuffer(nil), &bytes.Buffer{}, &fakeRunner{}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(options.StateDir); !os.IsNotExist(err) {
		t.Fatalf("state directory still exists: %v", err)
	}
}

func TestExecuteRejectsUnsafeDestructivePaths(t *testing.T) {
	options := Options{Purge: true, AssumeYes: true, ConfigDir: "/", StateDir: "/", BinaryPath: "/nodeguard-agent", UnitPath: "/nodeguard-agent.service"}
	if err := Execute(options, bytes.NewBuffer(nil), &bytes.Buffer{}, &fakeRunner{}); err == nil {
		t.Fatal("unsafe destructive paths were accepted")
	}
}

func TestExecuteRejectsSymlinkStateDirectory(t *testing.T) {
	options := createInstallation(t)
	target := filepath.Join(t.TempDir(), "nodeguard-agent")
	if err := os.Mkdir(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(options.StateDir); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, options.StateDir); err != nil {
		t.Fatal(err)
	}
	if err := Execute(options, bytes.NewBuffer(nil), &bytes.Buffer{}, &fakeRunner{}); err == nil {
		t.Fatal("symlink state directory was accepted")
	}
}

func TestExecuteRejectsUnsafeManagedDirectoryModeBeforeMutation(t *testing.T) {
	options := createInstallation(t)
	if err := os.Chmod(options.ConfigDir, 0o777); err != nil {
		t.Fatal(err)
	}
	runner := &fakeRunner{}
	if err := Execute(options, bytes.NewBuffer(nil), &bytes.Buffer{}, runner); err == nil {
		t.Fatal("unsafe configuration directory was accepted")
	}
	if len(runner.commands) != 0 {
		t.Fatalf("service was mutated before path validation: %#v", runner.commands)
	}
	if _, err := os.Stat(options.BinaryPath); err != nil {
		t.Fatalf("installation was partially removed: %v", err)
	}
}

func TestExecutePreflightsStableIdentityBeforeMutation(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		mutate func(t *testing.T, path string)
	}{
		{
			name: "malformed",
			mutate: func(t *testing.T, path string) {
				t.Helper()
				if err := os.WriteFile(path, []byte("not-a-uuid\n"), 0o600); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "unsafe-permissions",
			mutate: func(t *testing.T, path string) {
				t.Helper()
				if err := os.Chmod(path, 0o644); err != nil {
					t.Fatal(err)
				}
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			options := createInstallation(t)
			testCase.mutate(t, identity.Path(options.StateDir))
			runner := &fakeRunner{}
			if err := Execute(options, bytes.NewBuffer(nil), &bytes.Buffer{}, runner); err == nil {
				t.Fatal("unsafe stable identity was accepted")
			}
			if len(runner.commands) != 0 {
				t.Fatalf("service was mutated before identity validation: %#v", runner.commands)
			}
			for _, path := range []string{options.BinaryPath, options.ConfigDir, options.UnitPath} {
				if _, err := os.Stat(path); err != nil {
					t.Fatalf("installation was partially removed at %s: %v", path, err)
				}
			}
		})
	}
}
