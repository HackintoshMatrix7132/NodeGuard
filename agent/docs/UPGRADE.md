# Upgrading and Reinstalling NodeGuard Agent

The v0.3 installer distinguishes a binary/service upgrade from credential replacement.

## Normal upgrade

Run the current command from **Agents → Add Agent** or:

```bash
curl -fsSL https://YOUR_NODEGUARD/install-agent.sh | sudo bash -s -- \
  --server https://YOUR_NODEGUARD
```

No token is required while the existing credential remains active. The installer:

1. Inspects the existing binary, service, config, credential, and state.
2. Creates a stable identity for legacy installations, or validates/preserves the existing identity.
3. Resolves and verifies the release checksum.
4. Stops the old service only when replacement is required.
5. Installs the binary and service atomically.
6. Preserves valid credentials.
7. Starts/restarts only when needed and verifies the backend connection.
8. Restores the previous binary/unit after a failed or interrupted installation.

Pin a release with `--agent-version 0.3.1`. The old `--version 0.3.1` spelling remains accepted; `--version` without a value prints the installer version.

Use `--force-reinstall` only to reinstall a checksum-verified current binary. It does not silently rotate a healthy credential.

## Re-enrollment after deletion, revocation, or stale credentials

Generate a fresh token in NodeGuard, then rerun the installer. It securely prompts for the token when needed. Alternatively:

```bash
sudo nodeguard-agent re-enroll --replace-existing
```

Re-enrollment preserves `/var/lib/nodeguard-agent/machine-id`, pre-creates a protected configuration recovery file, optionally binds a legacy backend row through the old authenticated heartbeat, stops the service, requests exact-identity replacement, atomically installs the new credential, and restarts the service.

The backend transaction retains the matching Agent record/history where appropriate and invalidates the old credential. It never matches by hostname or replaces an unrelated machine.

## Upgrade after normal uninstall

Normal uninstall intentionally removes `config.json` but preserves `machine-id`. A later installer run detects this uninstall-shaped state and automatically sends exact-identity re-enrollment with the fresh token. This avoids a duplicate Agent record.

## Recovery from an interrupted credential commit

An ambiguous network response is retried with the exact same client-generated credential. If NodeGuard issued a new credential but the final local atomic rename fails, the stale service remains stopped and the protected configuration remains at:

```text
/etc/nodeguard-agent/.config-recovery-*
```

The file is root-owned mode `0600`. Do not print or transmit it. Correct the filesystem problem, then install it locally as `/etc/nodeguard-agent/config.json` with root ownership/mode `0600`, validate, and start the service. The installer reports this state explicitly.
