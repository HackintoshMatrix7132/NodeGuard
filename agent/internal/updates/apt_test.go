package updates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

type fakeCommandRunner struct {
	mu        sync.Mutex
	available map[string]bool
	commands  []string
	run       func(context.Context, string, ...string) (CommandResult, error)
}

type staticPackageLockChecker struct {
	busy bool
	err  error
}

func (checker staticPackageLockChecker) Busy() (bool, error) {
	return checker.busy, checker.err
}

func (runner *fakeCommandRunner) Available(name string) bool {
	return runner.available[name]
}

func (runner *fakeCommandRunner) Run(ctx context.Context, name string, args ...string) (CommandResult, error) {
	runner.mu.Lock()
	runner.commands = append(runner.commands, name+" "+strings.Join(args, " "))
	runner.mu.Unlock()
	return runner.run(ctx, name, args...)
}

func writeOSRelease(t *testing.T, directory, contents string) string {
	t.Helper()
	path := filepath.Join(directory, "os-release")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func successfulRunner(simulation string) *fakeCommandRunner {
	return &fakeCommandRunner{
		available: map[string]bool{"apt-get": true},
		run: func(_ context.Context, name string, args ...string) (CommandResult, error) {
			if name != "apt-get" {
				return CommandResult{}, errors.New("unexpected command")
			}
			if args[len(args)-1] == "upgrade" {
				return CommandResult{Stdout: simulation}, nil
			}
			return CommandResult{}, nil
		},
	}
}

func providerForTest(t *testing.T, osReleaseContents string, runner CommandRunner) *APTProvider {
	t.Helper()
	directory := t.TempDir()
	return NewAPTProviderWithOptions(APTProviderOptions{
		Runner: runner, LockChecker: staticPackageLockChecker{}, OSReleasePath: writeOSRelease(t, directory, osReleaseContents),
		RebootRequiredPath: filepath.Join(directory, "reboot-required"), MaxPackages: MaximumPackageRows,
		Now: func() time.Time { return time.Date(2026, 7, 14, 18, 0, 0, 0, time.UTC) },
	})
}

func TestUnreadableOrMalformedOSReleaseFailsSafely(t *testing.T) {
	directory := t.TempDir()
	malformedPath := writeOSRelease(t, directory, "ID=\"debian\nPRETTY_NAME=Debian\n")
	for _, test := range []struct {
		name string
		path string
	}{
		{name: "unreadable", path: filepath.Join(directory, "missing-os-release")},
		{name: "malformed", path: malformedPath},
	} {
		t.Run(test.name, func(t *testing.T) {
			runner := successfulRunner("")
			provider := NewAPTProviderWithOptions(APTProviderOptions{
				Runner: runner, LockChecker: staticPackageLockChecker{}, OSReleasePath: test.path,
				RebootRequiredPath: filepath.Join(directory, "reboot-required"),
			})
			inventory := provider.Check(context.Background())
			if inventory.Status != model.UpdateStatusCheckFailed || !inventory.Supported {
				t.Fatalf("OS detection failure was not retained as a supported check failure: %+v", inventory)
			}
			if inventory.ErrorCode == nil || *inventory.ErrorCode != "os_detection_failed" {
				t.Fatalf("OS detection error code = %v", inventory.ErrorCode)
			}
			if len(runner.commands) != 0 {
				t.Fatal("OS detection failure executed a package command")
			}
		})
	}
}

func TestDebianAndUbuntuDetection(t *testing.T) {
	for _, test := range []struct {
		name    string
		release string
	}{
		{"debian", "ID=debian\nVERSION_ID=12\nPRETTY_NAME=\"Debian GNU/Linux 12\"\n"},
		{"ubuntu", "ID=ubuntu\nID_LIKE=debian\nVERSION_ID=24.04\nPRETTY_NAME=\"Ubuntu 24.04 LTS\"\n"},
		{"debian-like", "ID=raspbian\nID_LIKE=debian\nVERSION_ID=12\nPRETTY_NAME=Raspbian\n"},
	} {
		t.Run(test.name, func(t *testing.T) {
			provider := providerForTest(t, test.release, successfulRunner(""))
			if !provider.Supported() {
				t.Fatal("APT-compatible OS was reported as unsupported")
			}
			inventory := provider.Check(context.Background())
			if inventory.Status != model.UpdateStatusOK || !inventory.Supported {
				t.Fatalf("inventory status = %q supported=%v", inventory.Status, inventory.Supported)
			}
		})
	}
}

func TestUnsupportedOSDoesNotExecuteAPT(t *testing.T) {
	runner := successfulRunner("")
	provider := providerForTest(t, "ID=alpine\nVERSION_ID=3.20\nPRETTY_NAME=Alpine\n", runner)
	inventory := provider.Check(context.Background())
	if inventory.Status != model.UpdateStatusUnsupported || inventory.Supported {
		t.Fatalf("unexpected unsupported inventory: %+v", inventory)
	}
	if len(runner.commands) != 0 {
		t.Fatal("unsupported OS executed a package command")
	}
}

func TestProxmoxDetection(t *testing.T) {
	runner := successfulRunner("")
	runner.available["pveversion"] = true
	runner.run = func(_ context.Context, name string, args ...string) (CommandResult, error) {
		if name == "pveversion" {
			return CommandResult{Stdout: "pve-manager/8.4.1/2a5fa54a8503f96d\n"}, nil
		}
		return CommandResult{}, nil
	}
	provider := providerForTest(t, "ID=debian\nVERSION_ID=12\nPRETTY_NAME=\"Debian GNU/Linux 12\"\n", runner)
	inventory := provider.Check(context.Background())
	if inventory.OS.ID != "proxmox" || inventory.OS.VersionID != "8.4.1" || inventory.OS.PrettyName != "Proxmox VE 8.4.1" {
		t.Fatalf("Proxmox OS was not normalized: %+v", inventory.OS)
	}
}

func TestNormalAndSecurityUpdates(t *testing.T) {
	simulation := strings.Join([]string{
		"NOTE: This is only a simulation!",
		"Inst curl [8.0.0-1] (8.0.0-2 Debian:12/oldstable [amd64])",
		"Inst openssl:amd64 [3.0.0-1] (3.0.0-2 Debian-Security:12/oldstable-security [amd64])",
	}, "\n")
	provider := providerForTest(t, "ID=debian\nVERSION_ID=12\nPRETTY_NAME=Debian\n", successfulRunner(simulation))
	inventory := provider.Check(context.Background())
	if inventory.UpdateCount != 2 || inventory.SecurityUpdateCount != 1 || len(inventory.Packages) != 2 {
		t.Fatalf("update inventory was not counted correctly: %+v", inventory)
	}
	if inventory.Packages[1].Name != "openssl:amd64" || !inventory.Packages[1].Security {
		t.Fatalf("security package was not classified: %+v", inventory.Packages[1])
	}
	if inventory.Packages[1].Source == nil || *inventory.Packages[1].Source != "oldstable-security" {
		t.Fatalf("package source was not reduced to a safe suite label: %+v", inventory.Packages[1].Source)
	}
	if inventory.LastSuccessfulAt == nil || inventory.RebootRequired == nil || *inventory.RebootRequired {
		t.Fatal("successful timestamps or reboot state were not populated")
	}
}

func TestNewDependencyLinesAreSkipped(t *testing.T) {
	simulation := strings.Join([]string{
		"Inst linux-headers-6.8.0 (6.8.0 Ubuntu:24.04/noble-updates [amd64])",
		"Inst openssl [3.0.0-1] (3.0.0-2 Ubuntu:24.04/noble-security [amd64])",
	}, "\n")
	provider := providerForTest(t, "ID=ubuntu\nID_LIKE=debian\nPRETTY_NAME=Ubuntu\n", successfulRunner(simulation))
	inventory := provider.Check(context.Background())
	if inventory.Status != model.UpdateStatusOK || inventory.UpdateCount != 1 || len(inventory.Packages) != 1 {
		t.Fatalf("new dependency line affected the installed update inventory: %+v", inventory)
	}
}

func TestPrivateRepositorySourceIsNotReported(t *testing.T) {
	update, err := parseInstallLine("Inst private-package [1.0] (2.0 https://user:secret@packages.internal/stable [amd64])")
	if err != nil {
		t.Fatal(err)
	}
	if update.Source != nil {
		t.Fatalf("private repository source escaped normalization: %q", *update.Source)
	}
}

func TestPackageSourceIsOneSafeBoundedToken(t *testing.T) {
	source := normalizeSource("Ubuntu:24.04/noble-updates Ubuntu:24.04/noble-security")
	if source != "noble-security" {
		t.Fatalf("source = %q, want the single security suite token", source)
	}
	if strings.ContainsAny(source, " ,") || len(source) > maximumSourceBytes {
		t.Fatalf("source is not one bounded token: %q", source)
	}
	longSource := normalizeSource("Ubuntu:24.04/" + strings.Repeat("a", maximumSourceBytes+20))
	if len(longSource) != maximumSourceBytes {
		t.Fatalf("long source length = %d, want %d", len(longSource), maximumSourceBytes)
	}
	for _, unsafe := range []string{"-leading-punctuation", "déb-security"} {
		if normalized := normalizeSource(unsafe); normalized != "" {
			t.Fatalf("unsafe source %q normalized to %q", unsafe, normalized)
		}
	}
}

func TestRebootRequired(t *testing.T) {
	provider := providerForTest(t, "ID=ubuntu\nID_LIKE=debian\nPRETTY_NAME=Ubuntu\n", successfulRunner(""))
	if err := os.WriteFile(provider.rebootRequiredPath, []byte("reboot required\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	inventory := provider.Check(context.Background())
	if inventory.RebootRequired == nil || !*inventory.RebootRequired {
		t.Fatal("reboot-required marker was not detected")
	}
}

func TestAPTUnavailable(t *testing.T) {
	runner := &fakeCommandRunner{available: map[string]bool{}, run: func(context.Context, string, ...string) (CommandResult, error) {
		return CommandResult{}, nil
	}}
	provider := providerForTest(t, "ID=debian\nPRETTY_NAME=Debian\n", runner)
	inventory := provider.Check(context.Background())
	if inventory.Status != model.UpdateStatusCheckFailed || inventory.ErrorCode == nil || *inventory.ErrorCode != "apt_unavailable" {
		t.Fatalf("APT absence was not reported safely: %+v", inventory)
	}
}

func TestPackageLockPreflightStopsAPTWithoutMutatingLocks(t *testing.T) {
	for _, test := range []struct {
		name   string
		check  PackageLockChecker
		status model.UpdateStatus
		code   string
	}{
		{name: "busy", check: staticPackageLockChecker{busy: true}, status: model.UpdateStatusPackageManagerBusy, code: "package_manager_busy"},
		{name: "inspection failure", check: staticPackageLockChecker{err: errors.New("lock fixture error")}, status: model.UpdateStatusCheckFailed, code: "package_lock_check_failed"},
	} {
		t.Run(test.name, func(t *testing.T) {
			runner := successfulRunner("")
			directory := t.TempDir()
			provider := NewAPTProviderWithOptions(APTProviderOptions{
				Runner: runner, LockChecker: test.check,
				OSReleasePath:      writeOSRelease(t, directory, "ID=debian\nPRETTY_NAME=Debian\n"),
				RebootRequiredPath: filepath.Join(directory, "reboot-required"),
			})
			inventory := provider.Check(context.Background())
			if inventory.Status != test.status || inventory.ErrorCode == nil || *inventory.ErrorCode != test.code {
				t.Fatalf("lock status was not reported safely: %+v", inventory)
			}
			if len(runner.commands) != 0 {
				t.Fatal("APT ran while the package lock preflight blocked it")
			}
		})
	}
}

func TestAPTCommandsUseZeroWaitLocksWithoutDisablingLocking(t *testing.T) {
	arguments := strings.Join(append(metadataArgs(), queryArgs()...), " ")
	if strings.Contains(arguments, "Debug::NoLocking") {
		t.Fatal("APT locking was disabled")
	}
	if strings.Count(arguments, "DPkg::Lock::Timeout=0") != 2 {
		t.Fatalf("zero-wait lock option not applied to both APT commands: %q", arguments)
	}
}

func TestPackageManagerBusyAndMetadataFailure(t *testing.T) {
	for _, test := range []struct {
		name   string
		result CommandResult
		status model.UpdateStatus
	}{
		{"busy", CommandResult{Stderr: "E: Could not get lock /var/lib/apt/lists/lock. It is held by process 123"}, model.UpdateStatusPackageManagerBusy},
		{"permission", CommandResult{Stderr: "E: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)"}, model.UpdateStatusMetadataRefreshFailed},
		{"failed", CommandResult{Stderr: "private repository URL must not leave the host"}, model.UpdateStatusMetadataRefreshFailed},
	} {
		t.Run(test.name, func(t *testing.T) {
			runner := &fakeCommandRunner{available: map[string]bool{"apt-get": true}, run: func(context.Context, string, ...string) (CommandResult, error) {
				return test.result, errors.New("exit status 100")
			}}
			inventory := providerForTest(t, "ID=debian\nPRETTY_NAME=Debian\n", runner).Check(context.Background())
			if inventory.Status != test.status {
				t.Fatalf("status = %q, want %q", inventory.Status, test.status)
			}
			if inventory.ErrorMessage != nil && strings.Contains(*inventory.ErrorMessage, "private repository") {
				t.Fatal("raw APT output was exposed in the payload")
			}
		})
	}
}

func TestMetadataTimeout(t *testing.T) {
	runner := &fakeCommandRunner{available: map[string]bool{"apt-get": true}, run: func(ctx context.Context, _ string, _ ...string) (CommandResult, error) {
		<-ctx.Done()
		return CommandResult{}, ctx.Err()
	}}
	provider := providerForTest(t, "ID=debian\nPRETTY_NAME=Debian\n", runner)
	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancel()
	inventory := provider.Check(ctx)
	if inventory.Status != model.UpdateStatusMetadataRefreshFailed || inventory.ErrorCode == nil || *inventory.ErrorCode != "metadata_refresh_timeout" {
		t.Fatalf("timeout was not reported safely: %+v", inventory)
	}
}

func TestMalformedOutputFailsSafely(t *testing.T) {
	provider := providerForTest(t, "ID=debian\nPRETTY_NAME=Debian\n", successfulRunner("Inst malformed output"))
	inventory := provider.Check(context.Background())
	if inventory.Status != model.UpdateStatusCheckFailed || inventory.ErrorCode == nil || *inventory.ErrorCode != "malformed_apt_output" {
		t.Fatalf("malformed output was accepted: %+v", inventory)
	}
}

func TestPackageTruncationKeepsSummaryCounts(t *testing.T) {
	lines := make([]string, 0, 503)
	for index := 0; index < 503; index++ {
		lines = append(lines, fmt.Sprintf("Inst package-%03d [1.0] (2.0 Debian:12/oldstable [amd64])", index))
	}
	provider := providerForTest(t, "ID=debian\nPRETTY_NAME=Debian\n", successfulRunner(strings.Join(lines, "\n")))
	inventory := provider.Check(context.Background())
	if inventory.UpdateCount != 503 || len(inventory.Packages) != MaximumPackageRows || !inventory.Truncated {
		t.Fatalf("package truncation was incorrect: total=%d details=%d truncated=%v", inventory.UpdateCount, len(inventory.Packages), inventory.Truncated)
	}
}

func TestPayloadSerializationUsesVersionedFields(t *testing.T) {
	inventory := providerForTest(t, "ID=debian\nPRETTY_NAME=Debian\n", successfulRunner("")).Check(context.Background())
	if inventory.SchemaVersion != 1 || inventory.Provider != "apt" || inventory.CheckedAt.IsZero() {
		t.Fatalf("versioned payload fields are missing: %+v", inventory)
	}
}

func TestMaximumInventoryFitsBelowTransportLimit(t *testing.T) {
	packages := make([]model.PackageUpdate, MaximumPackageRows)
	name := strings.Repeat("n", maximumPackageNameBytes)
	installed := strings.Repeat("i", maximumVersionBytes)
	candidate := strings.Repeat("c", maximumVersionBytes)
	sourceValue := strings.Repeat("s", maximumSourceBytes)
	for index := range packages {
		packages[index] = model.PackageUpdate{
			Name: name, InstalledVersion: installed, CandidateVersion: candidate,
			Security: true, Source: &sourceValue,
		}
	}
	inventory := model.UpdateInventory{
		SchemaVersion: SchemaVersion, Provider: "apt", Supported: true, Status: model.UpdateStatusOK,
		CheckedAt: time.Now(), UpdateCount: len(packages), SecurityUpdateCount: len(packages), Packages: packages,
	}
	encoded, err := json.Marshal(inventory)
	if err != nil {
		t.Fatal(err)
	}
	if len(encoded) >= 480*1024 {
		t.Fatalf("maximum update inventory is %d bytes, must remain below transport limit", len(encoded))
	}
}
