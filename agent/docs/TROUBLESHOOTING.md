# NodeGuard Agent Troubleshooting

## Installer errors

- **Invalid or expired enrollment token:** Generate a new token in **Agents → Add Agent**. Tokens are short-lived and single-use.
- **Checksum mismatch:** Do not run the downloaded binary. Retry from a trusted network and confirm the NodeGuard deployment exposes the expected release.
- **Unsupported architecture:** v0.1 supports Linux `amd64` and `arm64` only.
- **systemd missing:** Use the manual guide and an equivalent supervised service only if you understand the host's init system.
- **Connection timeout:** Check DNS, HTTPS certificate trust, system time, and outbound TCP 443 access.

Add `--verbose` to show bounded diagnostic output. The installer never prints the enrollment token or Agent credential.

## Runtime checks

```bash
sudo systemctl status nodeguard-agent
sudo journalctl -u nodeguard-agent -n 100 --no-pager
sudo nodeguard-agent status
sudo nodeguard-agent version
```

The service should be enabled and active. A valid configuration exists at `/etc/nodeguard-agent/config.json`, owned by root with mode `0600`.

## Docker unavailable

Host monitoring continues when Docker is unavailable. Confirm Docker is running and `/var/run/docker.sock` exists. Docker socket access is highly privileged; do not loosen socket permissions merely to silence the warning.

## Reinstall

Running the installer again is idempotent and preserves existing credentials. Use `sudo nodeguard-agent uninstall` first only when you intentionally want to remove the service and binary.
