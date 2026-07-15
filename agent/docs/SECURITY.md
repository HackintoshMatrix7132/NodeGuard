# NodeGuard Agent Security Notes

NodeGuard Agent is outbound-only and discovery-only. It exposes no listening port, remote shell, generic command runner, package installer, reboot control, or Docker lifecycle action.

## Identity and authentication

- `/var/lib/nodeguard-agent/machine-id` is a cryptographically random UUID generated locally on first installation.
- The identity is not a secret and is never used as a credential. It prevents duplicate registration without relying on hostname or display name.
- Normal uninstall/reinstall preserves it; confirmed `uninstall --purge` removes it.
- Enrollment tokens are cryptographically random, short-lived, hashed server-side, revocable, and single-use.
- Every Agent generates its own random `ng_agent_…` credential before enrollment. NodeGuard stores only its hash and returns the exact value so an ambiguous lost response can be retried idempotently.
- Re-enrollment requires a valid token and exact stable-identity match, rotates the credential, and invalidates the old credential.
- Human passwords and browser sessions are never stored by the Agent.

Prefer the secure `/dev/tty` token prompt or `NODEGUARD_ENROLLMENT_TOKEN`. `--token` is compatibility-only because command-line arguments can appear in shell history and process listings. The environment variable is unset immediately after capture.

## Protected local storage

- `/etc/nodeguard-agent` and `/var/lib/nodeguard-agent` are root-owned mode `0700`.
- Configuration/credential and identity files are root-owned mode `0600`.
- Sensitive configuration writes use a protected same-filesystem temporary file, `fsync`, and atomic rename.
- Re-enrollment reserves that file before requesting rotation. If the final rename unexpectedly fails, the issued credential remains only in a protected `.config-recovery-*` file and the stale service remains stopped.
- Installer temporary directories use mode `0700` through `umask 077` and are removed on success, failure, or interruption.
- Tokens, credentials, authorization headers, and raw stable identities are not written to normal output or logs.

## Transport and release verification

- Production registration and reporting require HTTPS with normal certificate and hostname verification.
- Loopback HTTP is allowed only for development.
- The installer restricts downloads to HTTPS/TLS 1.2 or newer.
- Release binaries are verified against the downloaded SHA-256 manifest before installation.
- Installer changes have rollback handling for expected, unexpected, and interrupted failures.

## Runtime boundaries

The packaged service runs as root to read protected host metrics/configuration and, when enabled, the Docker socket. It applies systemd hardening (`NoNewPrivileges`, private temp, protected kernel/control groups/home/system paths, restricted address families, and a protected state directory). Docker socket access remains effectively root-equivalent and is not described as least privilege.

On Debian-family systems, the fixed APT provider may refresh package indexes before simulating an upgrade. Commands/arguments are hard-coded, run without a shell, have time/output bounds, never come from NodeGuard, and never install, remove, configure, or download upgrade packages. APT/dpkg locks are respected and never bypassed.

## Removal

Normal uninstall removes the local service, binary, credentials, configuration, and runtime/cache data while retaining only the stable identity. Purge requires explicit confirmation (or `--purge --yes` for automation) and removes all Agent-managed state. Neither operation silently deletes backend history.
