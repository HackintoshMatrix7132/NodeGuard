package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/client"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/collectors"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/identity"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/logging"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/runner"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/uninstall"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/version"
	"golang.org/x/term"
)

const (
	exitSuccess        = 0
	exitGeneral        = 1
	exitInvalid        = 2
	exitPermission     = 3
	exitNotEnrolled    = 4
	exitNetwork        = 5
	exitAuthentication = 6

	documentationURL = "https://github.com/HackintoshMatrix7132/NodeGuard/tree/main/agent"
)

type commandError struct {
	code int
	err  error
}

func (err *commandError) Error() string { return err.err.Error() }
func (err *commandError) Unwrap() error { return err.err }

func fail(code int, message string, args ...any) error {
	return &commandError{code: code, err: fmt.Errorf(message, args...)}
}

type application struct {
	stdout                io.Writer
	stderr                io.Writer
	input                 io.Reader // test-only purge confirmation input
	openTerminal          func() (readWriteCloser, error)
	unitInstalled         func() bool
	serviceActive         func() bool
	systemctl             func(args ...string) error
	onlineTimeout         time.Duration
	onlinePollingInterval time.Duration
}

type readWriteCloser interface {
	io.Reader
	io.Writer
	io.Closer
}

func newFlagSet(name string, output io.Writer) *flag.FlagSet {
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	flags.SetOutput(output)
	return flags
}

func parseFlags(flags *flag.FlagSet, args []string) error {
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return err
		}
		return fail(exitInvalid, "%v", err)
	}
	return nil
}

func rejectPositionals(flags *flag.FlagSet, command string) error {
	if flags.NArg() != 0 {
		return fail(exitInvalid, "%s does not accept positional arguments", command)
	}
	return nil
}

func printHelp(output io.Writer) {
	fmt.Fprintln(output, `NodeGuard Agent

Securely reports Linux host, Docker, and update telemetry to NodeGuard.

Usage:
  nodeguard-agent <command> [options]

Commands:
  run          Run the Agent in the foreground (used by systemd)
  status       Show service, enrollment, and connection status
  doctor       Run safe, read-only local diagnostics
  version      Show version and build information
  config       Show or validate protected configuration
  identity     Create/verify the protected stable machine identity (advanced)
  enroll       Enroll this machine with a one-time token
  re-enroll    Replace stale credentials and enroll this machine again
  uninstall    Remove the Agent locally; stable identity is preserved by default
  help         Show this help or help for a command

Common options:
  --config PATH      Configuration file (default /etc/nodeguard-agent/config.json)
  --state-dir PATH   State directory (default /var/lib/nodeguard-agent)

Examples:
  nodeguard-agent status
  nodeguard-agent doctor
  nodeguard-agent config show
  sudo nodeguard-agent re-enroll --replace-existing
  sudo nodeguard-agent uninstall

Protected paths:
  /etc/nodeguard-agent/config.json       Agent credential and configuration
  /var/lib/nodeguard-agent/machine-id    Stable, non-secret machine identity

Documentation:
  `+documentationURL+`

Exit codes:
  0 success; 1 general failure; 2 invalid arguments/config; 3 root required;
  4 not installed/enrolled; 5 backend/network failure; 6 authentication failure`)
}

func (app *application) execute(args []string) int {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		printHelp(app.stdout)
		return exitSuccess
	}
	if args[0] == "help" {
		if len(args) == 1 {
			printHelp(app.stdout)
			return exitSuccess
		}
		args = []string{args[1], "--help"}
	}

	var err error
	switch args[0] {
	case "run":
		err = app.runAgent(args[1:])
	case "status":
		err = app.status(args[1:])
	case "doctor":
		err = app.doctor(args[1:])
	case "version", "--version":
		err = app.showVersion(args[1:])
	case "config":
		err = app.configCommand(args[1:])
	case "identity":
		err = app.identityCommand(args[1:])
	case "enroll":
		err = app.enroll(args[1:], false)
	case "register": // compatibility for older first-enroll and credential-rotation commands.
		err = app.enroll(args[1:], true)
	case "re-enroll":
		err = app.enroll(args[1:], true)
	case "uninstall":
		err = app.uninstallAgent(args[1:])
	default:
		fmt.Fprintf(app.stderr, "Unknown command %q. Run 'nodeguard-agent --help'.\n", args[0])
		return exitInvalid
	}
	if err == nil {
		return exitSuccess
	}
	if errors.Is(err, flag.ErrHelp) {
		return exitSuccess
	}
	code := exitGeneral
	var typed *commandError
	if errors.As(err, &typed) {
		code = typed.code
	}
	fmt.Fprintf(app.stderr, "nodeguard-agent: %s\n", err)
	return code
}

func (app *application) identityCommand(args []string) error {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		fmt.Fprintln(app.stdout, "Usage: sudo nodeguard-agent identity ensure [--state-dir PATH]\n\nCreate the protected stable machine identity when absent. The identity value is never printed.")
		return nil
	}
	if args[0] != "ensure" {
		return fail(exitInvalid, "unknown identity command %q; use ensure", args[0])
	}
	flags := newFlagSet("identity ensure", app.stderr)
	stateDir := flags.String("state-dir", identity.DefaultStateDir, "Agent state directory")
	if err := parseFlags(flags, args[1:]); err != nil {
		return err
	}
	if err := rejectPositionals(flags, "identity ensure"); err != nil {
		return err
	}
	if err := requireRoot(); err != nil {
		return err
	}
	_, created, err := identity.Ensure(*stateDir)
	if err != nil {
		return fail(exitGeneral, "prepare stable machine identity: %v", err)
	}
	if created {
		fmt.Fprintf(app.stdout, "Created protected stable machine identity at %s.\n", identity.Path(*stateDir))
	} else {
		fmt.Fprintf(app.stdout, "Stable machine identity is protected at %s.\n", identity.Path(*stateDir))
	}
	return nil
}

func (app *application) showVersion(args []string) error {
	flags := newFlagSet("version", app.stderr)
	flags.Usage = func() {
		fmt.Fprintln(app.stderr, "Usage: nodeguard-agent version\n\nShow version and build information.")
	}
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if err := rejectPositionals(flags, "version"); err != nil {
		return err
	}
	fmt.Fprintf(app.stdout, "NodeGuard Agent\nVersion: %s\nCommit: %s\nBuilt: %s\nGo: %s\nPlatform: %s/%s\n",
		version.Version, fallback(version.Commit), fallback(version.Date), runtime.Version(), runtime.GOOS, runtime.GOARCH)
	return nil
}

func fallback(value string) string {
	if strings.TrimSpace(value) == "" || value == "development" {
		return "unknown"
	}
	return value
}

func requireRoot() error {
	if os.Geteuid() != 0 {
		return fail(exitPermission, "root privileges are required; re-run this command with sudo")
	}
	return nil
}

func (app *application) runAgent(args []string) error {
	flags := newFlagSet("run", app.stderr)
	configPath := flags.String("config", config.DefaultPath, "configuration file path")
	stateDir := flags.String("state-dir", identity.DefaultStateDir, "Agent state directory")
	flags.Usage = func() {
		fmt.Fprintln(app.stderr, "Usage: nodeguard-agent run [--config PATH] [--state-dir PATH]\n\nRun the Agent in the foreground. systemd uses this command.")
	}
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if err := rejectPositionals(flags, "run"); err != nil {
		return err
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return fail(exitInvalid, "%v", err)
	}
	machineIdentity, _, err := identity.Ensure(*stateDir)
	if err != nil {
		return fail(exitGeneral, "prepare stable machine identity: %v", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	return runner.New(cfg, version.Version, logging.New("agent")).WithMachineIdentity(machineIdentity).Run(ctx)
}

type enrollmentOptions struct {
	serverURL       string
	token           string
	displayName     string
	configPath      string
	stateDir        string
	dockerEnabled   bool
	replaceExisting bool
	nonInteractive  bool
	tokenFromFlag   bool
}

func enrollmentFlags(output io.Writer, command string, args []string) (enrollmentOptions, error) {
	options := enrollmentOptions{}
	flags := newFlagSet(command, output)
	flags.StringVar(&options.serverURL, "server", "", "NodeGuard HTTPS server URL (optional for re-enrollment)")
	flags.StringVar(&options.token, "token", "", "one-time enrollment token (or NODEGUARD_ENROLLMENT_TOKEN)")
	flags.StringVar(&options.displayName, "name", "", "optional Agent display name")
	flags.StringVar(&options.configPath, "config", config.DefaultPath, "configuration file path")
	flags.StringVar(&options.stateDir, "state-dir", identity.DefaultStateDir, "Agent state directory")
	flags.BoolVar(&options.dockerEnabled, "docker", true, "collect read-only Docker inventory")
	flags.BoolVar(&options.replaceExisting, "replace-existing", false, "replace only the registration with this machine identity")
	flags.BoolVar(&options.nonInteractive, "non-interactive", false, "fail instead of prompting when no token is provided")
	flags.Usage = func() {
		fmt.Fprintf(output, "Usage: sudo nodeguard-agent %s [--server URL] [options]\n\n", command)
		fmt.Fprintln(output, "The token is requested through a secure terminal prompt when omitted. --replace-existing requires a valid token and can only replace the exact same stable machine identity.")
		flags.PrintDefaults()
	}
	if err := parseFlags(flags, args); err != nil {
		return options, err
	}
	if err := rejectPositionals(flags, command); err != nil {
		return options, err
	}
	for _, argument := range args {
		if argument == "--token" || strings.HasPrefix(argument, "--token=") {
			options.tokenFromFlag = true
			break
		}
	}
	if options.token == "" {
		options.token = os.Getenv("NODEGUARD_ENROLLMENT_TOKEN")
	}
	_ = os.Unsetenv("NODEGUARD_ENROLLMENT_TOKEN")
	return options, nil
}

func promptEnrollmentToken(output io.Writer) (string, error) {
	tty, err := os.OpenFile("/dev/tty", os.O_RDWR, 0)
	if err != nil || !term.IsTerminal(int(tty.Fd())) {
		if tty != nil {
			_ = tty.Close()
		}
		return "", errors.New("no interactive terminal is available")
	}
	defer tty.Close()
	if _, err := fmt.Fprint(tty, "Enrollment token: "); err != nil {
		return "", err
	}
	value, err := term.ReadPassword(int(tty.Fd()))
	_, _ = fmt.Fprintln(tty)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(value)), nil
}

func (app *application) enroll(args []string, reEnroll bool) error {
	command := "enroll"
	if reEnroll {
		command = "re-enroll"
	}
	options, err := enrollmentFlags(app.stderr, command, args)
	if err != nil {
		return err
	}
	if err := requireRoot(); err != nil {
		return err
	}
	if !reEnroll && options.replaceExisting {
		return fail(exitInvalid, "--replace-existing is available only with re-enroll so the existing service and credential can be handled safely")
	}
	if options.tokenFromFlag {
		fmt.Fprintln(app.stderr, "Warning: --token may be visible in the process list. Prefer NODEGUARD_ENROLLMENT_TOKEN or the secure interactive prompt.")
	}
	if options.token == "" {
		if options.nonInteractive {
			return fail(exitInvalid, "no enrollment token was provided; set NODEGUARD_ENROLLMENT_TOKEN for non-interactive use")
		}
		options.token, err = promptEnrollmentToken(app.stderr)
		if err != nil || options.token == "" {
			return fail(exitInvalid, "an enrollment token is required; use a secure interactive terminal or set NODEGUARD_ENROLLMENT_TOKEN")
		}
	}

	var previous config.Config
	var hadPrevious bool
	if loaded, loadErr := config.Load(options.configPath); loadErr == nil {
		previous, hadPrevious = loaded, true
		if err := requireProtectedRegularFile(options.configPath); err != nil {
			return fail(exitInvalid, "existing configuration permissions are invalid: %v", err)
		}
		if err := requireProtectedDirectory(filepath.Dir(options.configPath)); err != nil {
			return fail(exitInvalid, "configuration directory permissions are invalid: %v", err)
		}
		if !reEnroll {
			return fail(exitInvalid, "this machine is already enrolled; use re-enroll with a fresh token to replace its credential")
		}
		if options.serverURL == "" {
			options.serverURL = loaded.ServerURL
		}
		if options.displayName == "" {
			options.displayName = loaded.DisplayName
		}
		options.dockerEnabled = loaded.DockerEnabled
	} else if reEnroll && !errors.Is(loadErr, os.ErrNotExist) {
		return fail(exitInvalid, "existing configuration is invalid: %v", loadErr)
	}
	if options.serverURL == "" {
		return fail(exitInvalid, "--server is required when no valid existing configuration is available")
	}
	normalizedURL, err := config.ValidateServerURL(options.serverURL)
	if err != nil {
		return fail(exitInvalid, "%v", err)
	}
	machineIdentity, created, err := identity.Ensure(options.stateDir)
	if err != nil {
		return fail(exitGeneral, "prepare stable machine identity: %v", err)
	}
	preparedSave, err := config.PrepareSave(options.configPath)
	if err != nil {
		return fail(exitGeneral, "configuration cannot be replaced safely: %v", err)
	}
	defer preparedSave.Abort()

	if reEnroll && hadPrevious {
		// Bind upgraded legacy records before rotating credentials. Only a
		// definitive rejected old credential may continue without a successful
		// bind; every ambiguous or conflicting result fails before registration.
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		bindErr := client.New(previous).Post(ctx, "/api/agent/heartbeat", model.Heartbeat{
			AgentID: previous.AgentID, MachineIdentity: machineIdentity, AgentVersion: version.Version, Timestamp: time.Now().UTC(),
		})
		cancel()
		if err := previousRegistrationBindingError(bindErr); err != nil {
			return err
		}
	}

	serviceWasActive := app.isServiceActive()
	restartPreviousService := serviceWasActive
	if reEnroll && serviceWasActive {
		if err := app.runSystemctl("stop", uninstall.ServiceName); err != nil {
			return fail(exitGeneral, "could not stop the existing Agent service: %v", err)
		}
		defer func() {
			if restartPreviousService && app.hasSystemdUnit() && !app.isServiceActive() {
				_ = app.runSystemctl("start", uninstall.ServiceName)
			}
		}()
	}

	inventory, err := collectors.CollectInventory(version.Version)
	if err != nil {
		return fail(exitGeneral, "collect enrollment inventory: %v", err)
	}
	request := model.RegistrationRequest{
		EnrollmentToken: options.token, MachineIdentity: machineIdentity, ReplaceExisting: options.replaceExisting,
		DisplayName: strings.TrimSpace(options.displayName), Hostname: inventory.Hostname,
		AgentVersion: version.Version, OSName: inventory.OSName, OSVersion: inventory.OSVersion,
		Kernel: inventory.Kernel, Architecture: inventory.Architecture,
	}
	requestedCredential, err := client.GenerateCredential()
	if err != nil {
		return fail(exitGeneral, "prepare a protected Agent credential: %v", err)
	}
	request.RequestedCredential = requestedCredential
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	response, err := client.Register(ctx, normalizedURL, request)
	cancel()
	request.EnrollmentToken = ""
	request.RequestedCredential = ""
	requestedCredential = ""
	if err != nil {
		return enrollmentError(err)
	}
	// The backend may have invalidated the old credential now. Never restart the
	// stale service after this point, even if committing the protected new
	// configuration encounters an unexpected filesystem failure.
	restartPreviousService = false
	cfg := config.Config{
		ServerURL: normalizedURL, AgentID: response.AgentID, Credential: response.Credential,
		DisplayName: response.DisplayName, HeartbeatIntervalSeconds: response.HeartbeatIntervalSeconds,
		MetricsIntervalSeconds: response.MetricsIntervalSeconds, DockerIntervalSeconds: response.DockerIntervalSeconds,
		InventoryIntervalSeconds: response.InventoryIntervalSeconds, UpdateIntervalSeconds: response.UpdateIntervalSeconds,
		DockerEnabled: options.dockerEnabled,
	}
	if err := preparedSave.Commit(cfg); err != nil {
		recoveryPath := preparedSave.RecoveryPath()
		if recoveryPath != "" {
			return fail(exitGeneral, "the backend issued a new credential, but the active configuration could not be replaced; the protected recovery configuration is at %s and the stale service was left stopped", recoveryPath)
		}
		return fail(exitGeneral, "the backend issued a new credential, but the active configuration could not be replaced; the stale service was left stopped: %v", err)
	}
	if reEnroll && app.hasSystemdUnit() {
		if err := app.runSystemctl("restart", uninstall.ServiceName); err != nil {
			return fail(exitGeneral, "new credentials were saved, but the service could not restart; run 'sudo systemctl restart nodeguard-agent'")
		}
		ctx, cancel := context.WithTimeout(context.Background(), app.connectionOnlineTimeout())
		err := waitForConnectionOnline(ctx, cfg, app.connectionPollInterval())
		cancel()
		if err != nil {
			var apiError *client.APIError
			if errors.As(err, &apiError) && (apiError.StatusCode == http.StatusUnauthorized || apiError.StatusCode == http.StatusForbidden) {
				return fail(exitAuthentication, "new credentials were saved and the service restarted, but NodeGuard rejected the new credential; keep the current configuration, then run 'sudo nodeguard-agent doctor'")
			}
			return fail(exitNetwork, "new credentials were saved and the service restarted, but NodeGuard did not observe an Online heartbeat within %s; keep the current configuration and run 'sudo nodeguard-agent status' or 'sudo nodeguard-agent doctor'", app.connectionOnlineTimeout())
		}
	}

	verb := "Enrolled"
	if reEnroll {
		verb = "Re-enrolled"
	}
	fmt.Fprintf(app.stdout, "%s this machine as %q.\n", verb, cfg.DisplayName)
	if created {
		fmt.Fprintf(app.stdout, "Created protected stable machine identity at %s.\n", identity.Path(options.stateDir))
	} else {
		fmt.Fprintln(app.stdout, "Preserved the existing stable machine identity.")
	}
	if hadPrevious {
		fmt.Fprintln(app.stdout, "Replaced the stale Agent credential; the previous credential is no longer used locally.")
	}
	fmt.Fprintf(app.stdout, "Protected configuration written to %s. Credentials are intentionally hidden.\n", options.configPath)
	return nil
}

func enrollmentError(err error) error {
	var apiError *client.APIError
	if errors.As(err, &apiError) {
		if apiError.StatusCode == http.StatusTooManyRequests {
			return fail(exitNetwork, "NodeGuard rate-limited enrollment; wait before retrying with the same unexpired token")
		}
		if apiError.StatusCode >= http.StatusInternalServerError {
			return fail(exitNetwork, "NodeGuard is temporarily unavailable during enrollment; retry with the same token after the service recovers")
		}
		switch apiError.Code {
		case "invalid_enrollment_token":
			return fail(exitAuthentication, "enrollment failed: this token is invalid, expired, revoked, or already used; generate a new token in NodeGuard → Agents → Add Agent")
		case "machine_identity_conflict":
			return fail(exitAuthentication, "this machine is already registered; re-run re-enroll with --replace-existing and a new enrollment token")
		case "machine_identity_mismatch":
			return fail(exitAuthentication, "replacement was refused because the token does not match this machine registration")
		case "machine_identity_required":
			return fail(exitAuthentication, "enrollment requires a stable machine identity; install or upgrade the current NodeGuard Agent and retry")
		}
		return fail(exitAuthentication, "NodeGuard refused enrollment (%s)", apiError.Code)
	}
	return fail(exitNetwork, "could not reach NodeGuard for enrollment; verify DNS, HTTPS trust, system time, and outbound connectivity")
}

func previousRegistrationBindingError(err error) error {
	if err == nil {
		return nil
	}
	var apiError *client.APIError
	if errors.As(err, &apiError) {
		if (apiError.StatusCode == http.StatusUnauthorized && apiError.Code == "invalid_agent_credentials") ||
			(apiError.StatusCode == http.StatusForbidden && apiError.Code == "agent_revoked") {
			// The old credential is definitively unusable (deleted, revoked, or
			// rotated), so the one-time enrollment token may safely recover it.
			return nil
		}
		if apiError.StatusCode == http.StatusConflict ||
			apiError.Code == "machine_identity_conflict" ||
			apiError.Code == "machine_identity_mismatch" {
			return fail(exitAuthentication, "re-enrollment stopped because the existing registration does not match this machine's stable identity; no enrollment request was sent and no credentials were changed")
		}
		if apiError.StatusCode == http.StatusTooManyRequests || apiError.StatusCode >= http.StatusInternalServerError {
			return fail(exitNetwork, "re-enrollment could not safely verify the existing registration because NodeGuard is temporarily unavailable; no enrollment request was sent and no credentials were changed")
		}
		return fail(exitAuthentication, "re-enrollment stopped because NodeGuard refused safe stable-identity verification; no enrollment request was sent and no credentials were changed")
	}
	return fail(exitNetwork, "re-enrollment could not safely verify the existing registration; check DNS, HTTPS trust, system time, and NodeGuard availability. No enrollment request was sent and no credentials were changed")
}

func systemdUnitInstalled() bool {
	_, err := os.Stat(uninstall.DefaultUnitPath)
	return err == nil
}

func (app *application) hasSystemdUnit() bool {
	if app.unitInstalled != nil {
		return app.unitInstalled()
	}
	return systemdUnitInstalled()
}

func (app *application) isServiceActive() bool {
	if app.serviceActive != nil {
		return app.serviceActive()
	}
	return systemdActive()
}

func (app *application) runSystemctl(args ...string) error {
	if app.systemctl != nil {
		return app.systemctl(args...)
	}
	return runSystemctl(args...)
}

func (app *application) connectionOnlineTimeout() time.Duration {
	if app.onlineTimeout > 0 {
		return app.onlineTimeout
	}
	return 75 * time.Second
}

func (app *application) connectionPollInterval() time.Duration {
	if app.onlinePollingInterval > 0 {
		return app.onlinePollingInterval
	}
	return 2 * time.Second
}

func waitForConnectionOnline(ctx context.Context, cfg config.Config, interval time.Duration) error {
	if interval <= 0 {
		interval = 2 * time.Second
	}
	statusClient := client.New(cfg)
	for {
		status, err := statusClient.Status(ctx)
		if err == nil && strings.EqualFold(strings.TrimSpace(status.Status), "online") {
			return nil
		}
		if err != nil {
			var apiError *client.APIError
			if errors.As(err, &apiError) && (apiError.StatusCode == http.StatusUnauthorized || apiError.StatusCode == http.StatusForbidden) {
				return err
			}
		}
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func systemdActive() bool {
	return exec.Command("systemctl", "is-active", "--quiet", uninstall.ServiceName).Run() == nil
}

func runSystemctl(args ...string) error {
	command := exec.Command("systemctl", args...)
	if output, err := command.CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl %s failed: %s", strings.Join(args, " "), strings.TrimSpace(string(output)))
	}
	return nil
}

func redactID(value string) string {
	if len(value) <= 8 {
		return "redacted"
	}
	return value[:8] + "…redacted"
}

type statusOutput struct {
	Service       string `json:"service"`
	Enrollment    string `json:"enrollment"`
	Connection    string `json:"connection"`
	Backend       string `json:"backend,omitempty"`
	AgentID       string `json:"agentId,omitempty"`
	Machine       string `json:"machine,omitempty"`
	LastHeartbeat string `json:"lastHeartbeat,omitempty"`
	Version       string `json:"version"`
	Configuration string `json:"configuration"`
}

func (app *application) status(args []string) error {
	flags := newFlagSet("status", app.stderr)
	configPath := flags.String("config", config.DefaultPath, "configuration file path")
	jsonOutput := flags.Bool("json", false, "write machine-readable JSON")
	flags.Usage = func() {
		fmt.Fprintln(app.stderr, "Usage: nodeguard-agent status [--json] [--config PATH]\n\nShow local service, enrollment, and backend connection status. Credentials are never shown.")
	}
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if err := rejectPositionals(flags, "status"); err != nil {
		return err
	}
	result := statusOutput{Service: "Not installed", Enrollment: "Not enrolled", Connection: "Not checked", Version: version.Version, Configuration: "Missing"}
	if systemdUnitInstalled() {
		result.Service = "Stopped"
		if systemdActive() {
			result.Service = "Running"
		}
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		app.writeStatus(result, *jsonOutput)
		if errors.Is(err, os.ErrNotExist) {
			return fail(exitNotEnrolled, "Agent is not enrolled; run 'sudo nodeguard-agent enroll --server URL' and enter the token at the secure prompt")
		}
		return fail(exitInvalid, "configuration is invalid: %v", err)
	}
	result.Backend = cfg.ServerURL
	result.AgentID = redactID(cfg.AgentID)
	result.Machine = cfg.DisplayName
	result.Configuration = "Valid"
	result.Enrollment = "Checking"
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	remoteStatus, remoteErr := client.New(cfg).Status(ctx)
	cancel()
	if remoteErr != nil {
		var apiError *client.APIError
		if errors.As(remoteErr, &apiError) && (apiError.StatusCode == 401 || apiError.StatusCode == 403) {
			result.Enrollment = "Credential rejected"
			result.Connection = "Unknown"
			app.writeStatus(result, *jsonOutput)
			return fail(exitAuthentication, "Agent credential was rejected; generate a new token, run 'sudo nodeguard-agent re-enroll --replace-existing', and enter it at the secure prompt")
		}
		result.Enrollment = "Backend unavailable"
		result.Connection = "Unavailable"
		app.writeStatus(result, *jsonOutput)
		return fail(exitNetwork, "NodeGuard is unavailable; check DNS, TLS, and outbound HTTPS connectivity")
	}
	result.Enrollment = strings.Title(remoteStatus.CredentialStatus)
	if result.Enrollment == "" {
		result.Enrollment = "Active"
	}
	result.Connection = normalizedConnectionStatus(remoteStatus.Status)
	if remoteStatus.DisplayName != "" {
		result.Machine = remoteStatus.DisplayName
	}
	if remoteStatus.LastSeenAt != nil {
		result.LastHeartbeat = relativeTime(*remoteStatus.LastSeenAt)
	}
	app.writeStatus(result, *jsonOutput)
	return nil
}

func (app *application) writeStatus(status statusOutput, asJSON bool) {
	if asJSON {
		_ = json.NewEncoder(app.stdout).Encode(status)
		return
	}
	fmt.Fprintln(app.stdout, "NodeGuard Agent Status")
	fmt.Fprintf(app.stdout, "\nService          %s\nEnrollment       %s\nConnection       %s\n", status.Service, status.Enrollment, status.Connection)
	if status.Backend != "" {
		fmt.Fprintf(app.stdout, "Backend          %s\nAgent ID         %s\nMachine          %s\n", status.Backend, status.AgentID, status.Machine)
	}
	if status.LastHeartbeat != "" {
		fmt.Fprintf(app.stdout, "Last heartbeat   %s\n", status.LastHeartbeat)
	}
	fmt.Fprintf(app.stdout, "Version          %s\nConfiguration    %s\n", status.Version, status.Configuration)
}

func normalizedConnectionStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "online":
		return "Online"
	case "stale":
		return "Stale"
	case "offline":
		return "Offline"
	default:
		return "Unknown"
	}
}

func relativeTime(value time.Time) string {
	delta := time.Since(value)
	if delta < 0 {
		return value.Local().Format(time.RFC3339)
	}
	if delta < time.Minute {
		return fmt.Sprintf("%d seconds ago", int(delta.Seconds()))
	}
	if delta < time.Hour {
		return fmt.Sprintf("%d minutes ago", int(delta.Minutes()))
	}
	return value.Local().Format(time.RFC3339)
}

func (app *application) configCommand(args []string) error {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		fmt.Fprintln(app.stdout, "Usage: nodeguard-agent config <show|validate> [--config PATH]\n\nshow prints effective configuration with secrets redacted. validate performs local-only syntax and permission checks.")
		return nil
	}
	flags := newFlagSet("config "+args[0], app.stderr)
	configPath := flags.String("config", config.DefaultPath, "configuration file path")
	flags.Usage = func() { fmt.Fprintf(app.stderr, "Usage: nodeguard-agent config %s [--config PATH]\n", args[0]) }
	if err := parseFlags(flags, args[1:]); err != nil {
		return err
	}
	if err := rejectPositionals(flags, "config "+args[0]); err != nil {
		return err
	}
	switch args[0] {
	case "show":
		cfg, err := config.Load(*configPath)
		if err != nil {
			return fail(exitInvalid, "%v", err)
		}
		redacted := struct {
			ServerURL                string `json:"serverUrl"`
			AgentID                  string `json:"agentId"`
			Credential               string `json:"credential"`
			DisplayName              string `json:"displayName"`
			HeartbeatIntervalSeconds int    `json:"heartbeatIntervalSeconds"`
			MetricsIntervalSeconds   int    `json:"metricsIntervalSeconds"`
			DockerIntervalSeconds    int    `json:"dockerIntervalSeconds"`
			InventoryIntervalSeconds int    `json:"inventoryIntervalSeconds"`
			UpdateIntervalSeconds    int    `json:"updateIntervalSeconds"`
			DockerEnabled            bool   `json:"dockerEnabled"`
		}{cfg.ServerURL, redactID(cfg.AgentID), "[REDACTED]", cfg.DisplayName, cfg.HeartbeatIntervalSeconds,
			cfg.MetricsIntervalSeconds, cfg.DockerIntervalSeconds, cfg.InventoryIntervalSeconds,
			cfg.UpdateIntervalSeconds, cfg.DockerEnabled}
		encoder := json.NewEncoder(app.stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(redacted)
	case "validate":
		if _, err := config.Load(*configPath); err != nil {
			return fail(exitInvalid, "%v", err)
		}
		if err := requireProtectedRegularFile(*configPath); err != nil {
			return fail(exitInvalid, "configuration permissions are invalid: %v", err)
		}
		if err := requireProtectedDirectory(filepath.Dir(*configPath)); err != nil {
			return fail(exitInvalid, "configuration directory permissions are invalid: %v", err)
		}
		fmt.Fprintf(app.stdout, "Configuration valid: %s\n", *configPath)
		return nil
	default:
		return fail(exitInvalid, "unknown config command %q; use show or validate", args[0])
	}
}

func requireProtectedRegularFile(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("path is not a regular file")
	}
	if info.Mode().Perm()&0o077 != 0 {
		return fmt.Errorf("mode is %04o; expected 0600", info.Mode().Perm())
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && os.Geteuid() == 0 && stat.Uid != 0 {
		return errors.New("file is not owned by root")
	}
	return nil
}

func requireProtectedDirectory(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("path is not a regular directory")
	}
	if info.Mode().Perm()&0o077 != 0 {
		return fmt.Errorf("mode is %04o; expected 0700", info.Mode().Perm())
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && os.Geteuid() == 0 && stat.Uid != 0 {
		return errors.New("directory is not owned by root")
	}
	return nil
}

type diagnostic struct {
	level   string
	message string
}

func (app *application) doctor(args []string) error {
	flags := newFlagSet("doctor", app.stderr)
	configPath := flags.String("config", config.DefaultPath, "configuration file path")
	stateDir := flags.String("state-dir", identity.DefaultStateDir, "Agent state directory")
	flags.Usage = func() {
		fmt.Fprintln(app.stderr, "Usage: nodeguard-agent doctor [--config PATH] [--state-dir PATH]\n\nRun safe, read-only local, DNS, TLS, authentication, systemd, Docker, and update-provider diagnostics.")
	}
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if err := rejectPositionals(flags, "doctor"); err != nil {
		return err
	}
	checks := []diagnostic{}
	criticalFailure := false
	add := func(level, message string) {
		checks = append(checks, diagnostic{level: level, message: message})
		if level == "fail" {
			criticalFailure = true
		}
	}

	cfg, configErr := config.Load(*configPath)
	if configErr != nil {
		add("fail", "Configuration invalid or unavailable: "+safeError(configErr))
	} else if err := requireProtectedRegularFile(*configPath); err != nil {
		add("fail", "Configuration permissions unsafe: "+safeError(err))
	} else if err := requireProtectedDirectory(filepath.Dir(*configPath)); err != nil {
		add("fail", "Configuration directory permissions unsafe: "+safeError(err))
	} else {
		add("ok", "Configuration valid and protected")
	}
	if _, err := identity.Load(*stateDir); err != nil {
		add("fail", "Stable machine identity unavailable: "+safeError(err))
	} else {
		add("ok", "Stable machine identity available and protected")
	}
	if err := requireProtectedDirectory(*stateDir); err != nil {
		add("fail", "Agent state directory permissions are unsafe")
	} else {
		add("ok", "Agent state directory protected")
	}
	if supportedOS() {
		add("ok", "Operating system supported")
	} else {
		add("warn", "Operating system is outside the validated Linux list")
	}
	if runtime.GOOS == "linux" && (runtime.GOARCH == "amd64" || runtime.GOARCH == "arm64") {
		add("ok", "Architecture supported: "+runtime.GOARCH)
	} else {
		add("fail", "Unsupported platform: "+runtime.GOOS+"/"+runtime.GOARCH)
	}
	if systemdUnitInstalled() {
		add("ok", "systemd unit installed")
		if systemdActive() {
			add("ok", "systemd service active")
		} else {
			add("fail", "systemd service is not active")
		}
	} else {
		add("fail", "systemd unit is not installed")
	}
	if configErr == nil {
		parsed, _ := url.Parse(cfg.ServerURL)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if _, err := net.DefaultResolver.LookupHost(ctx, parsed.Hostname()); err != nil {
			add("fail", "Backend DNS resolution failed")
		} else {
			add("ok", "Backend DNS resolved")
		}
		cancel()
		if err := verifyTLS(cfg.ServerURL); err != nil {
			add("fail", "Backend TLS validation failed: "+safeError(err))
		} else {
			add("ok", "Backend TLS validation succeeded")
		}
		ctx, cancel = context.WithTimeout(context.Background(), 15*time.Second)
		_, err := client.New(cfg).Status(ctx)
		cancel()
		if err != nil {
			var apiError *client.APIError
			if errors.As(err, &apiError) && (apiError.StatusCode == 401 || apiError.StatusCode == 403) {
				add("fail", "Agent authentication was rejected; re-enrollment is required")
			} else {
				add("fail", "Authenticated backend status check failed")
			}
		} else {
			add("ok", "Agent authentication succeeded")
		}
		if cfg.DockerEnabled {
			connection, err := net.DialTimeout("unix", "/var/run/docker.sock", 2*time.Second)
			if err != nil {
				add("warn", "Docker socket unavailable; host monitoring will continue")
			} else {
				_ = connection.Close()
				add("ok", "Docker socket accessible")
			}
		}
	}
	if _, err := exec.LookPath("apt-get"); err != nil {
		add("warn", "APT update provider unavailable on this host")
	} else {
		add("ok", "APT update provider available")
	}

	fmt.Fprintln(app.stdout, "NodeGuard Agent Doctor")
	for _, check := range checks {
		symbol := "✓"
		if check.level == "warn" {
			symbol = "!"
		} else if check.level == "fail" {
			symbol = "✗"
		}
		fmt.Fprintf(app.stdout, "%s %s\n", symbol, check.message)
	}
	if criticalFailure {
		return fail(exitGeneral, "one or more required checks failed; correct the items above and run doctor again")
	}
	return nil
}

func verifyTLS(serverURL string) error {
	parsed, err := url.Parse(serverURL)
	if err != nil {
		return err
	}
	if parsed.Scheme == "http" {
		return nil
	}
	address := parsed.Host
	if parsed.Port() == "" {
		address = net.JoinHostPort(parsed.Hostname(), "443")
	}
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	connection, err := tls.DialWithDialer(dialer, "tcp", address, &tls.Config{
		MinVersion: tls.VersionTLS12, ServerName: parsed.Hostname(),
	})
	if err != nil {
		return err
	}
	return connection.Close()
}

func supportedOS() bool {
	data, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return false
	}
	value := strings.ToLower(string(data))
	for _, name := range []string{"debian", "ubuntu", "raspbian", "linuxmint", "proxmox", "fedora", "rhel", "rocky", "almalinux", "centos"} {
		if strings.Contains(value, name) {
			return true
		}
	}
	return false
}

func safeError(err error) string {
	message := err.Error()
	if len(message) > 180 {
		message = message[:180] + "…"
	}
	return message
}

func (app *application) uninstallAgent(args []string) error {
	flags := newFlagSet("uninstall", app.stderr)
	purge := flags.Bool("purge", false, "also remove the stable machine identity and all Agent state")
	yes := flags.Bool("yes", false, "confirm purge without prompting (required for automation)")
	flags.Usage = func() {
		fmt.Fprintln(app.stderr, "Usage: sudo nodeguard-agent uninstall [--purge [--yes]]")
		fmt.Fprintln(app.stderr, "\nNormal uninstall removes the service, binary, credentials, configuration, and runtime data but preserves the stable machine identity. --purge removes all local Agent state and requires confirmation.")
	}
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if err := rejectPositionals(flags, "uninstall"); err != nil {
		return err
	}
	if err := requireRoot(); err != nil {
		return err
	}
	fmt.Fprintln(app.stdout, "NodeGuard Agent Uninstall")
	if *purge {
		fmt.Fprintln(app.stdout, "This will remove the service, binary, credentials, stable machine identity, and all local Agent state.")
	} else {
		fmt.Fprintln(app.stdout, "This will remove the service, binary, credentials, configuration, and runtime data. The stable machine identity will be preserved.")
	}
	input := app.input
	var terminal readWriteCloser
	confirmationOutput := app.stdout
	if *purge && !*yes && input == nil {
		opener := app.openTerminal
		if opener == nil {
			opener = openControllingTerminal
		}
		var err error
		terminal, err = opener()
		if err != nil {
			return fail(exitInvalid, "--purge requires confirmation from an interactive terminal; re-run from a terminal or use --purge --yes for automation")
		}
		defer terminal.Close()
		input = terminal
		confirmationOutput = terminal
	}
	if input == nil {
		input = os.Stdin
	}
	return uninstall.Execute(uninstall.Options{Purge: *purge, AssumeYes: *yes}, input, confirmationOutput, uninstall.ExecRunner{})
}

func openControllingTerminal() (readWriteCloser, error) {
	tty, err := os.OpenFile("/dev/tty", os.O_RDWR, 0)
	if err != nil {
		return nil, err
	}
	if !term.IsTerminal(int(tty.Fd())) {
		_ = tty.Close()
		return nil, errors.New("controlling terminal is not interactive")
	}
	return tty, nil
}

func main() {
	app := &application{stdout: os.Stdout, stderr: os.Stderr}
	os.Exit(app.execute(os.Args[1:]))
}
