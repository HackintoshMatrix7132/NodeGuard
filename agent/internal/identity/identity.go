package identity

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
)

const (
	DefaultStateDir = "/var/lib/nodeguard-agent"
	FileName        = "machine-id"
)

var canonicalUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func Path(stateDir string) string {
	if stateDir == "" {
		stateDir = DefaultStateDir
	}
	return filepath.Join(stateDir, FileName)
}

func Validate(value string) error {
	if !canonicalUUID.MatchString(value) {
		return errors.New("machine identity is not a canonical UUID")
	}
	return nil
}

func newUUID(random io.Reader) (string, error) {
	var value [16]byte
	if _, err := io.ReadFull(random, value[:]); err != nil {
		return "", fmt.Errorf("generate random machine identity: %w", err)
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		value[0:4], value[4:6], value[6:8], value[8:10], value[10:16]), nil
}

func Load(stateDir string) (string, error) {
	path := Path(stateDir)
	info, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("read machine identity: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("machine identity path is not a regular file")
	}
	if info.Mode().Perm()&0o077 != 0 {
		return "", fmt.Errorf("machine identity permissions are %04o; expected 0600", info.Mode().Perm())
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && os.Geteuid() == 0 && stat.Uid != 0 {
		return "", errors.New("machine identity is not owned by root")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read machine identity: %w", err)
	}
	value := strings.TrimSpace(string(data))
	if err := Validate(value); err != nil {
		return "", err
	}
	return value, nil
}

func Ensure(stateDir string) (value string, created bool, err error) {
	return ensureWithRandom(stateDir, rand.Reader)
}

func ensureWithRandom(stateDir string, random io.Reader) (value string, created bool, err error) {
	if stateDir == "" {
		stateDir = DefaultStateDir
	}
	if err := protectStateDirectory(stateDir); err != nil {
		return "", false, err
	}
	if value, err := Load(stateDir); err == nil {
		return value, false, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", false, err
	}
	value, err = newUUID(random)
	if err != nil {
		return "", false, err
	}
	if err := Validate(value); err != nil {
		return "", false, fmt.Errorf("validate generated machine identity: %w", err)
	}
	path := Path(stateDir)
	file, err := os.CreateTemp(stateDir, "."+FileName+".tmp-*")
	if err != nil {
		return "", false, fmt.Errorf("create machine identity staging file: %w", err)
	}
	temporaryPath := file.Name()
	removeTemporary := true
	defer func() {
		_ = file.Close()
		if removeTemporary {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := file.Chmod(0o600); err != nil {
		return "", false, fmt.Errorf("protect machine identity staging file: %w", err)
	}
	if os.Geteuid() == 0 {
		if err := file.Chown(0, 0); err != nil {
			return "", false, fmt.Errorf("set machine identity staging ownership: %w", err)
		}
	}
	if _, err := fmt.Fprintln(file, value); err != nil {
		return "", false, fmt.Errorf("write machine identity: %w", err)
	}
	if err := file.Sync(); err != nil {
		return "", false, fmt.Errorf("sync machine identity: %w", err)
	}
	if err := file.Close(); err != nil {
		return "", false, fmt.Errorf("close machine identity: %w", err)
	}
	staged, err := os.ReadFile(temporaryPath)
	if err != nil {
		return "", false, fmt.Errorf("verify staged machine identity: %w", err)
	}
	if err := Validate(strings.TrimSpace(string(staged))); err != nil {
		return "", false, fmt.Errorf("verify staged machine identity: %w", err)
	}
	// Hard-link publication is atomic and refuses to replace an existing final
	// identity. A concurrent installer that loses this race loads the winner.
	if err := os.Link(temporaryPath, path); err != nil {
		if errors.Is(err, os.ErrExist) {
			winner, loadErr := Load(stateDir)
			return winner, false, loadErr
		}
		return "", false, fmt.Errorf("publish machine identity: %w", err)
	}
	// Keep both hard links until the final name is durably recorded. If this
	// sync fails, retaining the staging link avoids losing the identity after a
	// crash and the caller will not proceed to enrollment.
	removeTemporary = false
	if err := syncDirectory(stateDir); err != nil {
		return "", false, fmt.Errorf("sync published machine identity: %w", err)
	}
	if err := os.Remove(temporaryPath); err != nil {
		return "", false, fmt.Errorf("remove machine identity staging file: %w", err)
	}
	removeTemporary = true
	// Persist removal of the staging name separately. The final name was made
	// durable by the preceding directory sync and is never overwritten.
	if err := syncDirectory(stateDir); err != nil {
		return "", false, fmt.Errorf("sync machine identity staging cleanup: %w", err)
	}
	return value, true, nil
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func protectStateDirectory(stateDir string) error {
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		return fmt.Errorf("create Agent state directory: %w", err)
	}
	directoryInfo, err := os.Lstat(stateDir)
	if err != nil || !directoryInfo.IsDir() || directoryInfo.Mode()&os.ModeSymlink != 0 {
		return errors.New("Agent state path is not a regular directory")
	}
	if err := os.Chmod(stateDir, 0o700); err != nil {
		return fmt.Errorf("protect Agent state directory: %w", err)
	}
	if os.Geteuid() == 0 {
		if err := os.Chown(stateDir, 0, 0); err != nil {
			return fmt.Errorf("set Agent state directory ownership: %w", err)
		}
	}
	return nil
}
