# NodeGuard Agent Troubleshooting

Start with the safe local commands:

```bash
sudo nodeguard-agent status
sudo nodeguard-agent doctor
sudo nodeguard-agent config validate
sudo journalctl -u nodeguard-agent -n 100 --no-pager
```

`status --json` is useful for local automation. Neither status nor doctor prints credentials or the raw stable machine identity.

## Agent already installed

Rerun the current installer. It detects the existing binary, service, configuration, credential, and stable identity. A healthy current installation is not destructively reinstalled unless an upgrade is available or `--force-reinstall` is explicit.

If a healthy installation is given another token, the token is left unused unless `--replace-existing` is explicit.

## Stale or rejected credential

Generate a fresh token in **NodeGuard → Agents → Add Agent**, then run:

```bash
sudo nodeguard-agent re-enroll --replace-existing
```

The CLI prompts securely for the token. Re-enrollment preserves `/var/lib/nodeguard-agent/machine-id`, binds an upgraded legacy record through the authenticated old credential when possible, rotates credentials atomically, restarts the service, and waits for NodeGuard to observe an Online heartbeat.

If NodeGuard reports an identity mismatch, verify that the token and command came from the intended Agent record. NodeGuard never replaces another machine by hostname or display name.

## Agent deleted in the UI

Rerun the generated installer command with a fresh token. The local stable identity survives deletion of the backend record and normal local uninstall. If the old record was permanently deleted, NodeGuard creates one fresh record. If a matching record remains revoked, the installer performs exact-identity replacement. Duplicate active records are prevented transactionally.

## Normal uninstall followed by reinstall

Normal uninstall removes the credential/configuration but preserves the machine identity. The installer detects that identity even without `config.json`, uses re-enrollment with the fresh token, and reclaims only the exact matching registration.

## Legacy records created before Agent v0.3

NodeGuard intentionally never merges machines by hostname or display name. A pre-v0.3 record that was revoked before it ever reported a stable identity cannot be proven to represent the reinstalling machine, so it is kept as historical data while the installer creates one new active identity-bound record. After verifying the new Agent is Online, remove an obsolete historical record manually from the Agents page if desired. New v0.3 registrations are protected from duplicate active records by the stable-identity uniqueness constraint.

## Invalid or expired enrollment token

Enrollment tokens are short-lived and single-use. Generate a new token; do not retry an old token after a definitive rejection. A network response lost after NodeGuard consumes a token is retried automatically with the same client-generated credential, so that ambiguous case remains recoverable.

For an interactive shell, prefer the hidden prompt:

```bash
read -rsp 'Enrollment token: ' NODEGUARD_ENROLLMENT_TOKEN && printf '\n'
export NODEGUARD_ENROLLMENT_TOKEN
sudo --preserve-env=NODEGUARD_ENROLLMENT_TOKEN nodeguard-agent re-enroll --replace-existing
unset NODEGUARD_ENROLLMENT_TOKEN
```

For unattended automation, inject `NODEGUARD_ENROLLMENT_TOKEN` through the automation platform's protected secret environment rather than a command-line argument.

Do not place real tokens in support tickets or logs.

## Service does not start

```bash
sudo systemctl status nodeguard-agent
sudo journalctl -u nodeguard-agent -n 100 --no-pager
sudo nodeguard-agent config validate
```

Confirm the service uses:

```text
/usr/local/bin/nodeguard-agent run --config /etc/nodeguard-agent/config.json
```

The configuration and state directories must be root-owned mode `0700`; `config.json` and `machine-id` must be root-owned mode `0600` regular files.

## Backend unreachable or DNS/TLS failure

`doctor` independently checks DNS, TLS certificate/hostname validation, and authenticated status. Confirm:

- outbound TCP 443 is allowed;
- DNS resolves the configured hostname;
- system time is synchronized;
- the configured URL uses HTTPS and the certificate chain is trusted;
- reverse proxy routing reaches NodeGuard.

The Agent buffers a bounded number of reports in memory during temporary outages. It does not write an unbounded disk queue.

## Invalid configuration

```bash
sudo nodeguard-agent config show
sudo nodeguard-agent config validate
```

`show` redacts the credential. Do not hand-edit credential or interval fields. If re-enrollment reports a protected `.config-recovery-*` file, leave the service stopped and inspect the root-only file locally; it contains the issued replacement configuration and must never be copied into chat or logs.

## Permission errors

Run install/enroll/re-enroll/uninstall as root. Do not loosen credential, identity, or directory modes. The installer corrects safe installer-managed ownership/modes but rejects symlinks and unsafe path types.

## Docker socket unavailable

Host monitoring continues. Confirm Docker is running and `/var/run/docker.sock` exists. Docker socket access is highly privileged; do not make the socket world-readable. Disable Docker collection when it is not required.

## Update discovery delayed

- **Package manager busy:** wait for the current APT/dpkg operation; NodeGuard never kills it or bypasses locks.
- **Metadata refresh failed:** check repositories, DNS, proxy, and outbound package-repository access.
- **Unsupported:** APT update discovery currently supports Debian, Ubuntu, Debian derivatives, and Proxmox VE.

The Agent may refresh package indexes but never installs updates or reboots.

## Uninstall cleanup

```bash
sudo nodeguard-agent uninstall
```

This is idempotent and works while NodeGuard is unavailable. It preserves only the stable identity under Agent state and leaves backend history untouched. Use the UI to revoke/delete the record.

To remove all local state:

```bash
sudo nodeguard-agent uninstall --purge
# Non-interactive automation only:
sudo nodeguard-agent uninstall --purge --yes
```

Purge cannot be undone and requires explicit confirmation.
