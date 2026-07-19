# NodeGuard Agent v0.3

NodeGuard Agent is an outbound-only Linux collector. It reports host metrics, optional read-only Docker inventory, and operating-system update availability to a NodeGuard server. It does not listen for inbound connections or accept commands from NodeGuard.

## Requirements

- A systemd-based Linux host
- `amd64` (`x86_64`) or `arm64` (`aarch64`)
- Root access for installation, enrollment, re-enrollment, and removal
- Outbound HTTPS access to NodeGuard
- `curl`, `sha256sum`, `install`, `mktemp`, `awk`, `grep`, `sed`, and `uname`

The installer is validated on Debian, Ubuntu, Linux Mint, Raspberry Pi OS, Fedora, RHEL, Rocky Linux, AlmaLinux, and CentOS families. Host and Docker telemetry can work on other systemd Linux distributions, but those platforms are not validated. APT update discovery is available on Debian, Ubuntu, Debian derivatives, and Proxmox VE.

## One-command installation

Open **Agents → Add Agent** in NodeGuard and copy the generated command:

```bash
curl -fsSL https://YOUR_NODEGUARD/install-agent.sh | sudo bash -s -- \
  --server https://YOUR_NODEGUARD \
  --name docker-main
```

The installer downloads only over verified HTTPS, verifies the release SHA-256 checksum, installs atomically, creates a protected stable machine identity, enrolls the machine, installs the systemd unit, starts the service, and verifies that NodeGuard accepts the credential. Enrollment tokens and Agent credentials are never printed.

The generated installer prompts for the token without echoing it. For automation, set `NODEGUARD_ENROLLMENT_TOKEN`; it is captured and unset immediately. `--token` remains compatible with older commands, but command-line arguments can be visible in process listings and shell history.

### Installer options

```text
--server URL          NodeGuard HTTPS URL
--token TOKEN         Short-lived enrollment token
--name NAME           Agent display name
--agent-version V     Install a specific Agent release
--version [V]         Show installer version; a value pins V for compatibility
--yes                 Accept safe non-interactive defaults
--non-interactive     Alias for --yes
--force-reinstall     Reinstall even when the current binary is verified
--replace-existing    Explicitly replace this exact machine registration
--verbose             Show bounded failure diagnostics
--no-color            Disable color and terminal animation
--help                Show installer help
```

`NO_COLOR` is respected. Animation and color are also disabled automatically on non-interactive terminals.

## Stable machine identity

The Agent creates a random UUID at:

```text
/var/lib/nodeguard-agent/machine-id
```

The state directory is root-owned mode `0700`; the identity file is root-owned mode `0600`. This identifier is not an authentication secret and is kept separate from the credential in `/etc/nodeguard-agent/config.json`. It is sent only to authenticated enrollment/heartbeat endpoints and is not displayed in the dashboard.

NodeGuard uses this identity—not a hostname or display name—to prevent duplicate active registrations. A normal uninstall and reinstall preserve it. Only `uninstall --purge` removes it.

## Reinstall and recovery

Running the installer again inspects the binary, systemd unit, configuration, credential, and stable identity before changing anything.

- A healthy current installation is preserved unless an upgrade or `--force-reinstall` is requested.
- A healthy registration ignores a supplied token unless `--replace-existing` is explicit.
- A rejected/stale credential plus a fresh token is re-enrolled against the same stable identity.
- After a normal uninstall, the preserved identity is detected and the matching backend record is reclaimed with the fresh token.
- If the old record was permanently deleted in NodeGuard, the same identity can register as one fresh record.
- The old credential is invalidated when replacement succeeds.

Typical recovery after deleting or revoking an Agent in NodeGuard:

```bash
# Generate a new token in NodeGuard → Agents → Add Agent, then rerun its command.
curl -fsSL https://YOUR_NODEGUARD/install-agent.sh | sudo bash -s -- \
  --server https://YOUR_NODEGUARD \
  --name docker-main
```

Explicit replacement of a still-active registration:

```bash
sudo nodeguard-agent re-enroll \
  --replace-existing
```

Replacement always requires a valid one-time token and an exact stable-identity match. It never selects another Agent by hostname or display name.

## CLI reference

Run `nodeguard-agent --help` or `nodeguard-agent help COMMAND` for the authoritative local reference.

| Command | Purpose | Privilege |
|---|---|---|
| `nodeguard-agent --help` | Show commands, paths, examples, and exit codes | Any user |
| `nodeguard-agent version` | Show version, commit, build time, Go version, and platform | Any user |
| `nodeguard-agent status [--json]` | Show service, enrollment, backend, redacted Agent ID, heartbeat, version, and config status | Any user able to read config |
| `nodeguard-agent doctor` | Run read-only OS, config, identity, DNS, TLS, auth, systemd, Docker, and APT checks | Root recommended |
| `nodeguard-agent config show` | Print effective configuration with the credential redacted | Root |
| `nodeguard-agent config validate` | Validate configuration syntax, URL, intervals, ownership, and permissions without network access | Root |
| `nodeguard-agent enroll` | First enrollment with a one-time token | Root |
| `nodeguard-agent re-enroll` | Replace stale credentials while preserving identity | Root |
| `nodeguard-agent uninstall` | Remove service, binary, credential, config, and runtime data; preserve identity | Root |
| `nodeguard-agent uninstall --purge` | Also remove the identity and all local Agent state after confirmation | Root |

`nodeguard-agent register` remains a compatibility alias for older generated commands; new instructions use `enroll`.

### Status

```bash
sudo nodeguard-agent status
sudo nodeguard-agent status --json
```

Status distinguishes running/stopped/not-installed service state, active/not-enrolled/rejected/unavailable enrollment state, Online/Stale/Offline backend connection state, configuration validity, and the most recent backend heartbeat. Credentials and the raw stable identity are never shown.

### Doctor

```bash
sudo nodeguard-agent doctor
```

Doctor is read-only. Required check failures return non-zero; Docker/APT availability may be warnings when those collectors are optional on the host.

### Configuration

```bash
sudo nodeguard-agent config show
sudo nodeguard-agent config validate
```

Production URLs require HTTPS. Loopback HTTP is accepted only for development. Collection intervals are bounded, configuration must be a protected regular file, and secrets are redacted from output.

### Enrollment and re-enrollment

```bash
sudo nodeguard-agent enroll \
  --server https://YOUR_NODEGUARD \
  --name docker-main

sudo nodeguard-agent re-enroll \
  --replace-existing
```

Use `NODEGUARD_ENROLLMENT_TOKEN` instead of `--token` to avoid shell history:

```bash
read -rsp 'Enrollment token: ' NODEGUARD_ENROLLMENT_TOKEN && printf '\n'
export NODEGUARD_ENROLLMENT_TOKEN
sudo --preserve-env=NODEGUARD_ENROLLMENT_TOKEN \
  nodeguard-agent re-enroll --replace-existing
unset NODEGUARD_ENROLLMENT_TOKEN
```

Re-enrollment prepares a protected same-filesystem configuration file before contacting NodeGuard, safely binds upgraded legacy records through the authenticated old credential, stops the service when necessary, rotates the backend credential, installs the new credential atomically, restarts the service, and waits for NodeGuard to observe an Online heartbeat. If the final atomic commit unexpectedly fails, the new configuration remains in a root-only `.config-recovery-*` file and the stale service remains stopped.

### Uninstall

```bash
sudo nodeguard-agent uninstall
```

Normal uninstall is local and idempotent. It stops/disables systemd, removes the unit and binary, reloads systemd, removes credentials/config/runtime data, and preserves `/var/lib/nodeguard-agent/machine-id`. It succeeds without NodeGuard connectivity and does not silently remove backend history. Delete or revoke the record separately in the NodeGuard Agents page if desired.

Full purge:

```bash
sudo nodeguard-agent uninstall --purge
```

Purge explicitly confirms removal of the stable identity and all state. Automation must use:

```bash
sudo nodeguard-agent uninstall --purge --yes
```

## Agent CLI exit codes

```text
0  Success
1  General or diagnostic failure
2  Invalid arguments or configuration
3  Root permission required
4  Not installed or not enrolled
5  Backend/network/TLS unavailable
6  Authentication or enrollment rejected
```

## Installer exit codes

The one-command installer uses more specific lifecycle codes so automation can distinguish download, verification, enrollment, and service failures:

```text
0    Success or help/version output
2    Invalid option, URL, version, or missing enrollment token
3    Root privileges required
4    Unsupported operating system
5    systemd unavailable
6    Required local tool unavailable
7    Unsupported CPU architecture
10   HTTPS download or release lookup failed
11   Checksum manifest or SHA-256 verification failed
12   Existing configuration or enrollment/re-enrollment failed
13   Identity, binary, configuration, or systemd lifecycle failed
14   Service started but no Online heartbeat was observed
130  Interrupted by a signal
```

## Service and update discovery

```bash
sudo systemctl status nodeguard-agent
sudo journalctl -u nodeguard-agent -n 100 --no-pager
sudo systemctl restart nodeguard-agent
```

Default intervals are heartbeat 20 seconds, metrics 30 seconds, Docker 60 seconds, inventory six hours, and APT update discovery six hours. NodeGuard controls the reporting intervals returned during enrollment. The minimum update interval is 15 minutes.

The first update check starts independently about 5–30 seconds after the Agent starts. Package-manager busy and other transient checks retry with a bounded 30-second, 2-minute, 5-minute, then 15-minute cadence before returning to the configured interval. During a temporary NodeGuard outage, the queue retains at most the newest complete update inventory plus the newest non-success state so recovery stores the usable snapshot before its current freshness/error metadata.

On supported APT systems, the Agent refreshes package metadata with strict partial-failure detection, then uses `apt list --upgradable` through fixed, shell-free arguments. It never invokes an upgrade/install/remove action, downloads upgrade packages, configures packages, or reboots. APT/dpkg lock contention is never bypassed.

## Security summary

- Outbound HTTPS only; no inbound listener
- No remote shell, generic command execution, package installation, reboot, or Docker lifecycle controls
- Short-lived, hashed, single-use enrollment tokens
- Unique per-Agent credential, hashed by NodeGuard and rotated on re-enrollment
- Stable machine identity is non-secret and separate from credentials
- Root-owned `0700` directories and `0600` credential/identity files
- Atomic binary and sensitive configuration writes
- Protected temporary/recovery files with no secret logging
- Fixed local collectors; NodeGuard cannot supply commands or arguments

See:

- [`docs/MANUAL_INSTALL.md`](docs/MANUAL_INSTALL.md)
- [`docs/UPGRADE.md`](docs/UPGRADE.md)
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)

## Build

Go 1.23 or newer is required:

```bash
cd agent
make fmt-check vet test build-linux-amd64 build-linux-arm64
make installer-test
```

Build metadata can be supplied with `VERSION`, `COMMIT`, and `DATE`. Release binaries are written to the ignored `agent/bin/` directory.
