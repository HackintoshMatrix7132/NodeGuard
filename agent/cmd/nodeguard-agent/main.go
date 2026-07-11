package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/client"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/collectors"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/logging"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/runner"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/version"
)

func usage() {
	fmt.Fprintln(os.Stderr, "Usage: nodeguard-agent <register|run|status|version> [options]")
}

func register(args []string) error {
	flags := flag.NewFlagSet("register", flag.ContinueOnError)
	serverURL := flags.String("server", "", "NodeGuard HTTPS server URL")
	enrollmentToken := flags.String("token", "", "one-time enrollment token")
	displayName := flags.String("name", "", "optional agent display name")
	configPath := flags.String("config", config.DefaultPath, "configuration file path")
	dockerEnabled := flags.Bool("docker", true, "collect read-only Docker inventory")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *enrollmentToken == "" {
		*enrollmentToken = os.Getenv("NODEGUARD_ENROLLMENT_TOKEN")
	}
	if *serverURL == "" || *enrollmentToken == "" {
		return errors.New("--server and --token (or NODEGUARD_ENROLLMENT_TOKEN) are required")
	}
	normalizedURL, err := config.ValidateServerURL(*serverURL)
	if err != nil {
		return err
	}
	inventory, err := collectors.CollectInventory(version.Version)
	if err != nil {
		return err
	}
	request := model.RegistrationRequest{
		EnrollmentToken: *enrollmentToken, DisplayName: strings.TrimSpace(*displayName), Hostname: inventory.Hostname,
		AgentVersion: version.Version, OSName: inventory.OSName, OSVersion: inventory.OSVersion,
		Kernel: inventory.Kernel, Architecture: inventory.Architecture,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	response, err := client.Register(ctx, normalizedURL, request)
	if err != nil {
		return fmt.Errorf("register agent: %w", err)
	}
	cfg := config.Config{
		ServerURL: normalizedURL, AgentID: response.AgentID, Credential: response.Credential,
		DisplayName: response.DisplayName, HeartbeatIntervalSeconds: response.HeartbeatIntervalSeconds,
		MetricsIntervalSeconds: response.MetricsIntervalSeconds, DockerIntervalSeconds: response.DockerIntervalSeconds,
		InventoryIntervalSeconds: response.InventoryIntervalSeconds, DockerEnabled: *dockerEnabled,
	}
	if err := config.Save(*configPath, cfg); err != nil {
		return fmt.Errorf("save registration: %w", err)
	}
	fmt.Printf("NodeGuard Agent registered successfully as %q (ID %s...).\n", cfg.DisplayName, cfg.AgentID[:min(8, len(cfg.AgentID))])
	fmt.Printf("Protected configuration written to %s. The credential is intentionally hidden.\n", *configPath)
	return nil
}

func run(args []string) error {
	flags := flag.NewFlagSet("run", flag.ContinueOnError)
	configPath := flags.String("config", config.DefaultPath, "configuration file path")
	if err := flags.Parse(args); err != nil {
		return err
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	return runner.New(cfg, version.Version, logging.New("agent")).Run(ctx)
}

func status(args []string) error {
	flags := flag.NewFlagSet("status", flag.ContinueOnError)
	configPath := flags.String("config", config.DefaultPath, "configuration file path")
	if err := flags.Parse(args); err != nil {
		return err
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	remoteStatus, err := client.New(cfg).Status(ctx)
	if err != nil {
		return fmt.Errorf("query NodeGuard: %w", err)
	}
	fmt.Printf("Agent: %s\n", remoteStatus.DisplayName)
	fmt.Printf("ID: %s...\n", remoteStatus.ID[:min(8, len(remoteStatus.ID))])
	fmt.Printf("Host: %s\n", remoteStatus.Hostname)
	fmt.Printf("Status: %s\n", remoteStatus.Status)
	fmt.Printf("Credential: %s\n", remoteStatus.CredentialStatus)
	if remoteStatus.LastSeenAt != nil {
		fmt.Printf("Last seen: %s\n", remoteStatus.LastSeenAt.Local().Format(time.RFC3339))
	}
	return nil
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "register":
		err = register(os.Args[2:])
	case "run":
		err = run(os.Args[2:])
	case "status":
		err = status(os.Args[2:])
	case "version":
		fmt.Printf("nodeguard-agent %s (%s, %s)\n", version.Version, version.Commit, version.Date)
		return
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "nodeguard-agent:", err)
		os.Exit(1)
	}
}
