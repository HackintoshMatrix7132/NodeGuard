package uninstall

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/identity"
)

const (
	DefaultBinaryPath = "/usr/local/bin/nodeguard-agent"
	DefaultConfigDir  = "/etc/nodeguard-agent"
	DefaultStateDir   = identity.DefaultStateDir
	DefaultUnitPath   = "/etc/systemd/system/nodeguard-agent.service"
	ServiceName       = "nodeguard-agent.service"
)

type Options struct {
	Purge      bool
	AssumeYes  bool
	BinaryPath string
	ConfigDir  string
	StateDir   string
	UnitPath   string
}

type CommandRunner interface {
	Run(name string, args ...string) error
}

type ExecRunner struct{}

func (ExecRunner) Run(name string, args ...string) error {
	command := exec.Command(name, args...)
	command.Stdout = io.Discard
	command.Stderr = io.Discard
	return command.Run()
}

func withDefaults(options Options) Options {
	if options.BinaryPath == "" {
		options.BinaryPath = DefaultBinaryPath
	}
	if options.ConfigDir == "" {
		options.ConfigDir = DefaultConfigDir
	}
	if options.UnitPath == "" {
		options.UnitPath = DefaultUnitPath
	}
	if options.StateDir == "" {
		options.StateDir = DefaultStateDir
	}
	return options
}

func validateManagedPaths(options Options) error {
	paths := []struct {
		value string
		base  string
		label string
	}{
		{options.BinaryPath, "nodeguard-agent", "binary"},
		{options.ConfigDir, "nodeguard-agent", "configuration directory"},
		{options.StateDir, "nodeguard-agent", "state directory"},
		{options.UnitPath, "nodeguard-agent.service", "systemd unit"},
	}
	for _, candidate := range paths {
		cleaned := filepath.Clean(candidate.value)
		if !filepath.IsAbs(cleaned) || cleaned == string(filepath.Separator) || filepath.Base(cleaned) != candidate.base {
			return fmt.Errorf("refusing unsafe %s path %q", candidate.label, candidate.value)
		}
	}
	if filepath.Clean(options.ConfigDir) == filepath.Clean(options.StateDir) {
		return errors.New("configuration and state directories must be separate")
	}
	configDir := filepath.Clean(options.ConfigDir) + string(filepath.Separator)
	stateDir := filepath.Clean(options.StateDir) + string(filepath.Separator)
	if strings.HasPrefix(configDir, stateDir) || strings.HasPrefix(stateDir, configDir) {
		return errors.New("configuration and state directories must not overlap")
	}
	for _, candidate := range []struct {
		value string
		label string
	}{{options.ConfigDir, "configuration directory"}, {options.StateDir, "state directory"}} {
		if info, err := os.Lstat(candidate.value); err == nil {
			if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
				return fmt.Errorf("refusing non-directory or symlink %s %q", candidate.label, candidate.value)
			}
			if info.Mode().Perm()&0o077 != 0 {
				return fmt.Errorf("refusing unsafe %s mode %04o; expected 0700", candidate.label, info.Mode().Perm())
			}
			if stat, ok := info.Sys().(*syscall.Stat_t); ok && os.Geteuid() == 0 && stat.Uid != 0 {
				return fmt.Errorf("refusing %s not owned by root", candidate.label)
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("inspect %s: %w", candidate.label, err)
		}
	}
	return nil
}

func confirmPurge(input io.Reader, output io.Writer) (bool, error) {
	if _, err := fmt.Fprintf(output, "Permanently delete the stable machine identity, credentials, and all NodeGuard Agent state? [y/N] "); err != nil {
		return false, err
	}
	scanner := bufio.NewScanner(input)
	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return false, err
		}
		return false, nil
	}
	answer := strings.TrimSpace(strings.ToLower(scanner.Text()))
	return answer == "y" || answer == "yes", nil
}

func preflightPreservedIdentity(options Options) error {
	if options.Purge {
		return nil
	}
	if _, err := identity.Load(options.StateDir); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("validate stable machine identity before uninstall: %w", err)
	}
	return nil
}

func Execute(options Options, input io.Reader, output io.Writer, runner CommandRunner) error {
	options = withDefaults(options)
	if err := validateManagedPaths(options); err != nil {
		return err
	}
	// A normal uninstall promises to preserve this identity. Validate it before
	// stopping the service or removing any files so corruption cannot leave a
	// partially uninstalled machine.
	if err := preflightPreservedIdentity(options); err != nil {
		return err
	}
	if options.Purge && !options.AssumeYes {
		confirmed, err := confirmPurge(input, output)
		if err != nil {
			return fmt.Errorf("confirm configuration removal: %w", err)
		}
		if !confirmed {
			return errors.New("configuration removal was not confirmed; no files were changed")
		}
	}

	_, unitErr := os.Lstat(options.UnitPath)
	unitExists := unitErr == nil
	if unitErr != nil && !errors.Is(unitErr, os.ErrNotExist) {
		return fmt.Errorf("inspect systemd unit: %w", unitErr)
	}
	if err := runner.Run("systemctl", "disable", "--now", ServiceName); err != nil && unitExists {
		return fmt.Errorf("stop and disable service: %w", err)
	}
	if unitExists {
		if err := os.Remove(options.UnitPath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("remove systemd unit: %w", err)
		}
	}
	if err := runner.Run("systemctl", "daemon-reload"); err != nil {
		return fmt.Errorf("reload systemd: %w", err)
	}

	if err := os.Remove(options.BinaryPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove agent binary: %w", err)
	}
	if err := os.RemoveAll(options.ConfigDir); err != nil {
		return fmt.Errorf("remove protected configuration: %w", err)
	}
	if options.Purge {
		if err := os.RemoveAll(options.StateDir); err != nil {
			return fmt.Errorf("remove Agent state: %w", err)
		}
		fmt.Fprintln(output, "Removed NodeGuard Agent, credentials, stable machine identity, and all local state.")
	} else {
		entries, err := os.ReadDir(options.StateDir)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("inspect Agent state: %w", err)
		}
		for _, entry := range entries {
			if entry.Name() == identity.FileName {
				continue
			}
			if err := os.RemoveAll(filepath.Join(options.StateDir, entry.Name())); err != nil {
				return fmt.Errorf("remove Agent runtime state: %w", err)
			}
		}
		if _, err := identity.Load(options.StateDir); err == nil {
			_ = os.Chmod(options.StateDir, 0o700)
			fmt.Fprintf(output, "Preserved stable machine identity at %s.\n", identity.Path(options.StateDir))
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("preserve stable machine identity: %w", err)
		}
		fmt.Fprintln(output, "Removed NodeGuard Agent, credentials, configuration, and runtime state.")
	}
	fmt.Fprintln(output, "The Agent record remains in NodeGuard and can be revoked from the Agents page.")
	return nil
}
