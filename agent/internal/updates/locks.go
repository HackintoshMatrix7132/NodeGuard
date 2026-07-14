package updates

import (
	"errors"
	"os"
	"syscall"
)

var packageLockPaths = []string{
	"/var/lib/dpkg/lock-frontend",
	"/var/lib/dpkg/lock",
	"/var/lib/apt/lists/lock",
	"/var/cache/apt/archives/lock",
}

// PackageLockChecker reports whether another process holds an APT or dpkg
// advisory lock. It never removes lock files or changes the owning process.
type PackageLockChecker interface {
	Busy() (bool, error)
}

type SystemPackageLockChecker struct {
	paths []string
}

func NewSystemPackageLockChecker() *SystemPackageLockChecker {
	return &SystemPackageLockChecker{paths: append([]string(nil), packageLockPaths...)}
}

func (checker *SystemPackageLockChecker) Busy() (bool, error) {
	for _, path := range checker.paths {
		busy, err := packageLockHeld(path)
		if err != nil {
			return false, err
		}
		if busy {
			return true, nil
		}
	}
	return false, nil
}

func packageLockHeld(path string) (bool, error) {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer file.Close()

	// F_GETLK is a zero-wait query. A read-lock request conflicts with the
	// package manager's exclusive lock, but does not acquire or mutate it.
	lock := syscall.Flock_t{Type: syscall.F_RDLCK, Whence: 0, Start: 0, Len: 0}
	if err := syscall.FcntlFlock(file.Fd(), syscall.F_GETLK, &lock); err != nil {
		return false, err
	}
	return lock.Type != syscall.F_UNLCK, nil
}
