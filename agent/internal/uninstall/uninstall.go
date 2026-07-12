package uninstall

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

const (
	DefaultBinaryPath = "/usr/local/bin/nodeguard-agent"
	DefaultConfigDir  = "/etc/nodeguard-agent"
	DefaultUnitPath   = "/etc/systemd/system/nodeguard-agent.service"
	ServiceName       = "nodeguard-agent.service"
)

type Options struct {
	Purge      bool
	AssumeYes  bool
	BinaryPath string
	ConfigDir  string
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
	return options
}

func confirmPurge(input io.Reader, output io.Writer) (bool, error) {
	if _, err := fmt.Fprintf(output, "Delete protected NodeGuard Agent configuration and credentials? [y/N] "); err != nil {
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

func Execute(options Options, input io.Reader, output io.Writer, runner CommandRunner) error {
	options = withDefaults(options)
	if options.Purge && !options.AssumeYes {
		confirmed, err := confirmPurge(input, output)
		if err != nil {
			return fmt.Errorf("confirm configuration removal: %w", err)
		}
		if !confirmed {
			return errors.New("configuration removal was not confirmed; no files were changed")
		}
	}

	if _, err := os.Stat(options.UnitPath); err == nil {
		if err := runner.Run("systemctl", "disable", "--now", ServiceName); err != nil {
			return fmt.Errorf("stop and disable service: %w", err)
		}
		if err := os.Remove(options.UnitPath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("remove systemd unit: %w", err)
		}
		if err := runner.Run("systemctl", "daemon-reload"); err != nil {
			return fmt.Errorf("reload systemd: %w", err)
		}
	}

	if err := os.Remove(options.BinaryPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove agent binary: %w", err)
	}
	if options.Purge {
		if err := os.RemoveAll(options.ConfigDir); err != nil {
			return fmt.Errorf("remove protected configuration: %w", err)
		}
		fmt.Fprintf(output, "Removed NodeGuard Agent and local configuration.\n")
	} else {
		fmt.Fprintf(output, "Removed NodeGuard Agent. Preserved %s.\n", options.ConfigDir)
	}
	fmt.Fprintln(output, "The Agent record remains in NodeGuard and can be revoked from the Agents page.")
	return nil
}
