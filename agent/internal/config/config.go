package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const (
	DefaultPath                  = "/etc/nodeguard-agent/config.json"
	DefaultUpdateIntervalSeconds = 6 * 60 * 60
	MinimumUpdateIntervalSeconds = 15 * 60
)

type Config struct {
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
}

func WithDefaults(cfg Config) Config {
	if cfg.UpdateIntervalSeconds == 0 {
		cfg.UpdateIntervalSeconds = DefaultUpdateIntervalSeconds
	}
	return cfg
}

func ValidateServerURL(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return "", errors.New("server URL must be an absolute URL")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("server URL must not contain credentials, a query, or a fragment")
	}
	host := parsed.Hostname()
	loopback := host == "localhost" || net.ParseIP(host) != nil && net.ParseIP(host).IsLoopback()
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && loopback) {
		return "", errors.New("server URL must use HTTPS (HTTP is allowed only for loopback development)")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	return strings.TrimRight(parsed.String(), "/"), nil
}

func (cfg Config) Validate() error {
	if _, err := ValidateServerURL(cfg.ServerURL); err != nil {
		return err
	}
	if cfg.AgentID == "" || cfg.Credential == "" {
		return errors.New("agent is not registered")
	}
	if cfg.HeartbeatIntervalSeconds < 10 || cfg.MetricsIntervalSeconds < 15 || cfg.DockerIntervalSeconds < 30 ||
		cfg.InventoryIntervalSeconds < 300 || cfg.UpdateIntervalSeconds < MinimumUpdateIntervalSeconds {
		return errors.New("configuration contains unsafe collection intervals")
	}
	return nil
}

func Load(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read configuration: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse configuration: %w", err)
	}
	cfg = WithDefaults(cfg)
	if err := cfg.Validate(); err != nil {
		return Config{}, fmt.Errorf("validate configuration: %w", err)
	}
	return cfg, nil
}

func Save(path string, cfg Config) error {
	cfg = WithDefaults(cfg)
	if err := cfg.Validate(); err != nil {
		return err
	}
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create configuration directory: %w", err)
	}
	if err := os.Chmod(directory, 0o700); err != nil {
		return fmt.Errorf("protect configuration directory: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encode configuration: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".config-*")
	if err != nil {
		return fmt.Errorf("create temporary configuration: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return fmt.Errorf("protect temporary configuration: %w", err)
	}
	if _, err := temporary.Write(append(data, '\n')); err != nil {
		temporary.Close()
		return fmt.Errorf("write configuration: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("sync configuration: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close configuration: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("install configuration: %w", err)
	}
	return os.Chmod(path, 0o600)
}
