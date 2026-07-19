package updates

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
)

const maxCommandOutputBytes = 2 * 1024 * 1024

var ErrCommandOutputTooLarge = errors.New("command output exceeded the safe limit")

type CommandResult struct {
	Stdout string
	Stderr string
}

type CommandRunner interface {
	Available(name string) bool
	Run(ctx context.Context, name string, args ...string) (CommandResult, error)
}

type boundedBuffer struct {
	buffer    bytes.Buffer
	limit     int
	truncated bool
}

func (buffer *boundedBuffer) Write(value []byte) (int, error) {
	written := len(value)
	remaining := buffer.limit - buffer.buffer.Len()
	if remaining > 0 {
		if len(value) > remaining {
			value = value[:remaining]
			buffer.truncated = true
		}
		_, _ = buffer.buffer.Write(value)
	} else if len(value) > 0 {
		buffer.truncated = true
	}
	return written, nil
}

func (buffer *boundedBuffer) String() string {
	return buffer.buffer.String()
}

type SystemCommandRunner struct{}

var commandPaths = map[string][]string{
	"apt":        {"/usr/bin/apt", "/bin/apt"},
	"apt-get":    {"/usr/bin/apt-get", "/bin/apt-get"},
	"pveversion": {"/usr/bin/pveversion", "/usr/sbin/pveversion"},
}

func commandPath(name string) (string, bool) {
	for _, path := range commandPaths[name] {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
			return path, true
		}
	}
	return "", false
}

func (SystemCommandRunner) Available(name string) bool {
	_, available := commandPath(name)
	return available
}

func commandEnvironment() []string {
	environment := []string{
		"PATH=/usr/sbin:/usr/bin:/sbin:/bin",
		"HOME=/root",
		"LC_ALL=C",
		"LANG=C",
		"DEBIAN_FRONTEND=noninteractive",
	}
	for _, key := range []string{"http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"} {
		if value, found := os.LookupEnv(key); found {
			environment = append(environment, key+"="+value)
		}
	}
	return environment
}

func (SystemCommandRunner) Run(ctx context.Context, name string, args ...string) (CommandResult, error) {
	path, available := commandPath(name)
	if !available {
		return CommandResult{}, exec.ErrNotFound
	}
	command := exec.CommandContext(ctx, path, args...)
	command.Env = commandEnvironment()
	stdout := &boundedBuffer{limit: maxCommandOutputBytes}
	stderr := &boundedBuffer{limit: maxCommandOutputBytes}
	command.Stdout = stdout
	command.Stderr = stderr
	err := command.Run()
	result := CommandResult{Stdout: stdout.String(), Stderr: stderr.String()}
	if stdout.truncated || stderr.truncated {
		return result, ErrCommandOutputTooLarge
	}
	return result, err
}
