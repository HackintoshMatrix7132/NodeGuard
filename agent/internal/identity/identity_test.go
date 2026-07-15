package identity

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) {
	return 0, errors.New("random source failed")
}

func TestEnsureCreatesAndPreservesProtectedIdentity(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "state")
	first, created, err := Ensure(directory)
	if err != nil {
		t.Fatal(err)
	}
	if !created || Validate(first) != nil {
		t.Fatalf("created=%v identity=%q", created, first)
	}
	info, err := os.Stat(Path(directory))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("identity mode=%04o, want 0600", info.Mode().Perm())
	}
	second, created, err := Ensure(directory)
	if err != nil {
		t.Fatal(err)
	}
	if created || second != first {
		t.Fatalf("identity changed: %q -> %q", first, second)
	}
}

func TestLoadRejectsUnsafeOrMalformedIdentity(t *testing.T) {
	directory := t.TempDir()
	path := Path(directory)
	if err := os.WriteFile(path, []byte("not-a-uuid\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(directory); err == nil {
		t.Fatal("malformed identity was accepted")
	}
	if err := os.WriteFile(path, []byte("78c1d45d-ddd3-4b12-9bf7-7da129950502\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(directory); err == nil {
		t.Fatal("unsafe identity permissions were accepted")
	}
}

func TestEnsureProtectsExistingStateDirectory(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "state")
	if err := os.Mkdir(directory, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, _, err := Ensure(directory); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(directory)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o700 {
		t.Fatalf("state directory mode=%04o, want 0700", info.Mode().Perm())
	}
}

func TestEnsureRejectsSymlinkStateDirectory(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	if err := os.Mkdir(target, 0o700); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "state")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	if _, _, err := Ensure(link); err == nil {
		t.Fatal("symlink state directory was accepted")
	}
}

func TestEnsurePublishesOneCompleteConcurrentIdentity(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "state")
	const workers = 24
	values := make(chan string, workers)
	createdValues := make(chan bool, workers)
	errorsFound := make(chan error, workers)
	var waitGroup sync.WaitGroup
	for range workers {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			value, created, err := Ensure(directory)
			values <- value
			createdValues <- created
			errorsFound <- err
		}()
	}
	waitGroup.Wait()
	close(values)
	close(createdValues)
	close(errorsFound)

	for err := range errorsFound {
		if err != nil {
			t.Fatal(err)
		}
	}
	winner := ""
	for value := range values {
		if winner == "" {
			winner = value
		}
		if value != winner {
			t.Fatalf("concurrent identities diverged: %q and %q", winner, value)
		}
	}
	createdCount := 0
	for created := range createdValues {
		if created {
			createdCount++
		}
	}
	if createdCount != 1 {
		t.Fatalf("created count=%d, want 1", createdCount)
	}
	loaded, err := Load(directory)
	if err != nil || loaded != winner {
		t.Fatalf("published identity=%q err=%v, want %q", loaded, err, winner)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != FileName {
		t.Fatalf("unexpected identity staging artifacts: %#v", entries)
	}
}

func TestEnsureRandomFailureLeavesNoFinalIdentity(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "state")
	if _, _, err := ensureWithRandom(directory, failingReader{}); err == nil {
		t.Fatal("random failure was ignored")
	}
	if _, err := os.Lstat(Path(directory)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failed creation published a final identity: %v", err)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("failed creation left staging artifacts: %#v", entries)
	}
}
