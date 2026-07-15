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
	"syscall"
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
	if err := ValidateProtectedPath(path); err != nil {
		return Config{}, fmt.Errorf("protect configuration: %w", err)
	}
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

func ValidateProtectedPath(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("configuration path is not a regular file")
	}
	if info.Mode().Perm()&0o077 != 0 {
		return fmt.Errorf("configuration mode is %04o; expected 0600", info.Mode().Perm())
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && os.Geteuid() == 0 && stat.Uid != 0 {
		return errors.New("configuration file is not owned by root")
	}
	directory := filepath.Dir(path)
	directoryInfo, err := os.Lstat(directory)
	if err != nil {
		return err
	}
	if !directoryInfo.IsDir() || directoryInfo.Mode()&os.ModeSymlink != 0 {
		return errors.New("configuration parent is not a regular directory")
	}
	if directoryInfo.Mode().Perm()&0o077 != 0 {
		return fmt.Errorf("configuration directory mode is %04o; expected 0700", directoryInfo.Mode().Perm())
	}
	if stat, ok := directoryInfo.Sys().(*syscall.Stat_t); ok && os.Geteuid() == 0 && stat.Uid != 0 {
		return errors.New("configuration directory is not owned by root")
	}
	return nil
}

func Save(path string, cfg Config) error {
	cfg = WithDefaults(cfg)
	if err := cfg.Validate(); err != nil {
		return err
	}
	prepared, err := PrepareSave(path)
	if err != nil {
		return err
	}
	defer prepared.Abort()
	return prepared.Commit(cfg)
}

// PreparedSave reserves a protected same-filesystem file before a credential
// rotation request. If committing a newly issued credential fails, the
// protected recovery file is intentionally retained instead of losing the only
// copy of that credential.
type PreparedSave struct {
	targetPath    string
	temporaryPath string
	file          *os.File
	rename        func(string, string) error
	keepRecovery  bool
	committed     bool
}

func PrepareSave(path string) (*PreparedSave, error) {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return nil, fmt.Errorf("create configuration directory: %w", err)
	}
	directoryInfo, err := os.Lstat(directory)
	if err != nil || !directoryInfo.IsDir() || directoryInfo.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("configuration path parent is not a regular directory")
	}
	if err := os.Chmod(directory, 0o700); err != nil {
		return nil, fmt.Errorf("protect configuration directory: %w", err)
	}
	if os.Geteuid() == 0 {
		if err := os.Chown(directory, 0, 0); err != nil {
			return nil, fmt.Errorf("set configuration directory ownership: %w", err)
		}
	}
	if info, err := os.Lstat(path); err == nil && !info.Mode().IsRegular() {
		return nil, errors.New("configuration target is not a regular file")
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("inspect configuration target: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".config-recovery-*")
	if err != nil {
		return nil, fmt.Errorf("create protected configuration recovery file: %w", err)
	}
	temporaryPath := temporary.Name()
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		_ = os.Remove(temporaryPath)
		return nil, fmt.Errorf("protect configuration recovery file: %w", err)
	}
	if os.Geteuid() == 0 {
		if err := temporary.Chown(0, 0); err != nil {
			temporary.Close()
			_ = os.Remove(temporaryPath)
			return nil, fmt.Errorf("set configuration recovery ownership: %w", err)
		}
	}
	return &PreparedSave{targetPath: path, temporaryPath: temporaryPath, file: temporary, rename: os.Rename}, nil
}

func (prepared *PreparedSave) Commit(cfg Config) error {
	if prepared == nil || prepared.file == nil || prepared.committed {
		return errors.New("configuration save was not prepared")
	}
	cfg = WithDefaults(cfg)
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encode configuration: %w", err)
	}
	if _, err := prepared.file.Write(append(data, '\n')); err != nil {
		prepared.file.Close()
		return fmt.Errorf("write configuration recovery file: %w", err)
	}
	prepared.keepRecovery = true
	if err := prepared.file.Sync(); err != nil {
		prepared.file.Close()
		return fmt.Errorf("sync configuration recovery file: %w", err)
	}
	if err := prepared.file.Close(); err != nil {
		return fmt.Errorf("close configuration recovery file: %w", err)
	}
	prepared.file = nil
	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("new configuration is invalid; credential retained in recovery file: %w", err)
	}
	if err := prepared.rename(prepared.temporaryPath, prepared.targetPath); err != nil {
		return fmt.Errorf("install configuration: %w", err)
	}
	prepared.keepRecovery = false
	prepared.committed = true
	if directory, err := os.Open(filepath.Dir(prepared.targetPath)); err == nil {
		_ = directory.Sync()
		_ = directory.Close()
	}
	return nil
}

func (prepared *PreparedSave) RecoveryPath() string {
	if prepared != nil && prepared.keepRecovery && !prepared.committed {
		return prepared.temporaryPath
	}
	return ""
}

func (prepared *PreparedSave) Abort() {
	if prepared == nil || prepared.committed {
		return
	}
	if prepared.file != nil {
		_ = prepared.file.Close()
		prepared.file = nil
	}
	if !prepared.keepRecovery {
		_ = os.Remove(prepared.temporaryPath)
	}
}

// PreflightSave is retained for callers that only need a writability check.
func PreflightSave(path string) error {
	prepared, err := PrepareSave(path)
	if err != nil {
		return err
	}
	prepared.Abort()
	return nil
}
