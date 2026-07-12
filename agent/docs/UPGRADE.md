# Upgrading NodeGuard Agent

Run a newly generated installer command or invoke the installer without a new token on a registered host:

```bash
curl -fsSL https://YOUR_NODEGUARD/install-agent.sh | sudo bash -s -- \
  --server https://YOUR_NODEGUARD
```

Use `--version 0.1.0` to pin an available release. The installer:

1. Detects the installed version.
2. Downloads and verifies the requested binary when versions differ.
3. Preserves `/etc/nodeguard-agent/config.json` and its credential.
4. Updates the systemd unit only when it changed.
5. Restarts only when required.
6. Verifies that the Agent reconnects.

The previous binary and systemd unit are restored if installation fails before completion. NodeGuard does not automatically downgrade or alter configuration.
