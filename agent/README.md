# NodeGuard Agent v0.1

NodeGuard Agent is a read-only Linux collector for remote NodeGuard hosts. It connects outbound to a configured NodeGuard HTTPS URL, reports host metrics and optional Docker inventory, and never accepts inbound commands.

## Build

Go 1.23 or newer is required.

```bash
cd agent
make test vet build-linux-amd64
make build-linux-arm64
```

Build metadata can be supplied with `VERSION`, `COMMIT`, and `DATE`. Binaries are written to `agent/bin/`, which is ignored by Git.

## One-command install

Open **Agents → Add Agent** in NodeGuard and copy the generated command:

```bash
curl -fsSL https://nodeguard.muthu.eu/install-agent.sh | sudo bash -s -- \
  --server https://nodeguard.muthu.eu \
  --token ng_join_REDACTED \
  --name docker-main
```

The script is served by the NodeGuard deployment at `/install-agent.sh`. It detects the distribution and `amd64`/`arm64` architecture, downloads the matching release artifact over HTTPS, verifies the SHA-256 value from `checksums.txt`, registers the host once, installs systemd, starts the service, and waits up to 90 seconds for the first heartbeat.

Supported installer flags:

```txt
--server URL
--token TOKEN
--name NAME
--version VERSION
--yes
--verbose
--no-color
--help
```

The installer changes only:

- `/usr/local/bin/nodeguard-agent`
- `/etc/nodeguard-agent/` with mode `0700`
- `/etc/nodeguard-agent/config.json` with mode `0600`
- `/etc/systemd/system/nodeguard-agent.service`

It does not install packages, change the firewall, disable TLS verification, or expose credentials. The downloaded binary is rejected before installation if checksum verification fails. Existing configuration and credentials are always preserved.

For offline or source-based installation, see [`docs/MANUAL_INSTALL.md`](docs/MANUAL_INSTALL.md).

## Register

As a NodeGuard owner, open **Agents**, choose **Add agent**, and generate a short-lived command. Run it once on the host:

```bash
sudo nodeguard-agent register \
  --server https://your-nodeguard.example \
  --token ng_join_REDACTED \
  --name docker-main
```

To avoid putting the one-time token in shell history:

```bash
read -rsp 'Enrollment token: ' NODEGUARD_ENROLLMENT_TOKEN && printf '\n'
export NODEGUARD_ENROLLMENT_TOKEN
sudo --preserve-env=NODEGUARD_ENROLLMENT_TOKEN \
  nodeguard-agent register --server https://your-nodeguard.example --name docker-main
unset NODEGUARD_ENROLLMENT_TOKEN
```

Registration writes `/etc/nodeguard-agent/config.json` as root with mode `0600`. It contains a unique agent credential, not a NodeGuard username or password. The complete credential is never printed.

Credential rotation uses a short-lived `ng_rotate_...` command generated from the agent detail view. Running that command replaces the protected credential in place; the previous credential stops working immediately.

## Run with systemd

```bash
sudo systemctl enable --now nodeguard-agent
sudo systemctl status nodeguard-agent
sudo journalctl -u nodeguard-agent -f
sudo systemctl restart nodeguard-agent
```

The service waits for network availability, restarts after unexpected failures, logs structured events to the journal, and handles `SIGTERM` gracefully.

## Configuration

The protected JSON configuration contains the server URL, agent ID, unique credential, display name, collection intervals, and Docker collection setting. The server URL is never hardcoded. Production URLs must use HTTPS; HTTP is accepted only for loopback development.

Default reporting intervals are:

- heartbeat: 20 seconds
- metrics: 30 seconds
- Docker: 60 seconds
- static inventory: 6 hours

The backend controls the intervals returned during registration. Do not hand-edit credentials.

## Status and troubleshooting

```bash
sudo nodeguard-agent status
sudo nodeguard-agent version
sudo journalctl -u nodeguard-agent --since '30 minutes ago'
```

Common checks:

- Confirm the system clock is synchronized. Agent payload timestamps outside the server tolerance are rejected.
- Confirm outbound HTTPS and DNS access to NodeGuard.
- Confirm `/etc/nodeguard-agent/config.json` is owned by root and mode `0600`.
- If Docker is unavailable, host metrics continue. Check the Docker service and socket permissions.
- A stale/offline agent reconnects automatically with capped exponential backoff and jitter.

Reports waiting during a backend outage are kept only in a bounded in-memory queue: at most 100 reports and at most 15 minutes old. They are lost if the process restarts. This deliberately avoids filling the host disk in v0.1.

## Docker socket security

Reading `/var/run/docker.sock` normally requires root or membership in the Docker group. Access to that socket is effectively highly privileged even when NodeGuard itself sends only fixed read-only Docker API requests. The v0.1 systemd unit runs under root so it can read protected host metrics/configuration and the socket; it does not claim least-privilege isolation. Use a dedicated host, review the agent source, and disable Docker collection with `--docker=false` during registration when Docker inventory is not required.

The agent does not expose shell, exec, restart, stop, kill, delete, pull, package-management, or reboot operations.

## Uninstall

```bash
sudo nodeguard-agent uninstall
```

This stops and disables the service, removes the unit and binary, and preserves `/etc/nodeguard-agent` so the host can be reinstalled without generating a duplicate registration.

To delete local configuration and the unique Agent credential:

```bash
sudo nodeguard-agent uninstall --purge
```

Purging requires an explicit confirmation. For unattended removal, `--purge --yes` is available. Uninstallation never deletes the Agent record from NodeGuard; revoke it from the Agents page separately.

Additional guides:

- [`docs/UPGRADE.md`](docs/UPGRADE.md)
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
