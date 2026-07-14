package updates

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
)

func TestSystemPackageLockCheckerDetectsRealAdvisoryLock(t *testing.T) {
	lockPath := filepath.Join(t.TempDir(), "apt.lock")
	if err := os.WriteFile(lockPath, nil, 0o600); err != nil {
		t.Fatal(err)
	}

	command := exec.Command(os.Args[0], "-test.run=^TestPackageLockHelperProcess$")
	command.Env = append(os.Environ(), "NODEGUARD_LOCK_HELPER=1", "NODEGUARD_LOCK_PATH="+lockPath)
	stdin, err := command.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	waited := false
	t.Cleanup(func() {
		_ = stdin.Close()
		if !waited {
			_ = command.Wait()
		}
	})

	scanner := bufio.NewScanner(stdout)
	if !scanner.Scan() || scanner.Text() != "locked" {
		t.Fatalf("lock helper did not become ready: %q (%v)", scanner.Text(), scanner.Err())
	}

	checker := &SystemPackageLockChecker{paths: []string{lockPath}}
	busy, err := checker.Busy()
	if err != nil {
		t.Fatal(err)
	}
	if !busy {
		t.Fatal("a real advisory package lock was not detected")
	}

	if err := stdin.Close(); err != nil {
		t.Fatal(err)
	}
	if err := command.Wait(); err != nil {
		t.Fatal(err)
	}
	waited = true

	busy, err = checker.Busy()
	if err != nil {
		t.Fatal(err)
	}
	if busy {
		t.Fatal("released package lock was still reported as busy")
	}
}

func TestPackageLockHelperProcess(t *testing.T) {
	if os.Getenv("NODEGUARD_LOCK_HELPER") != "1" {
		return
	}
	file, err := os.OpenFile(os.Getenv("NODEGUARD_LOCK_PATH"), os.O_RDWR, 0)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	defer file.Close()
	lock := syscall.Flock_t{Type: syscall.F_WRLCK, Whence: 0, Start: 0, Len: 0}
	if err := syscall.FcntlFlock(file.Fd(), syscall.F_SETLK, &lock); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if _, err := fmt.Fprintln(os.Stdout, "locked"); err != nil {
		os.Exit(2)
	}
	_ = os.Stdout.Sync()
	_, _ = io.Copy(io.Discard, os.Stdin)
	os.Exit(0)
}
