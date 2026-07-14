# NodeGuard Agent Security Notes

NodeGuard Agent is outbound-only and discovery-only. It does not expose a listening port, remote shell, generic command runner, package installer, reboot control, or Docker lifecycle action.

## Credentials

- Enrollment tokens are cryptographically random, short-lived, hashed server-side, revocable, and single-use.
- Every Agent receives a unique long-term credential.
- The raw credential is returned only during registration and saved in `/etc/nodeguard-agent/config.json` with root ownership and mode `0600`.
- Agent credentials and authorization headers are never printed by the installer or normal logs.
- Human usernames, passwords, and browser sessions are never stored by the Agent.

## Transport and downloads

- Production registration and reporting require HTTPS.
- The installer uses HTTPS with certificate verification and never adds insecure curl options.
- Release binaries are checked against the separately downloaded SHA-256 manifest before installation.
- Temporary files use a private directory and are deleted on success, error, or interruption.

## Docker socket

Access to `/var/run/docker.sock` is effectively root-equivalent even when the Agent performs only fixed read-only requests. The packaged service therefore is not claimed to be least-privileged isolation. Disable Docker collection if it is not required and limit Agent installation to trusted hosts.

## Local privileges

Installation and the packaged service run as root to protect configuration and read host/Docker metadata. The systemd unit applies several hardening directives, but Docker socket access remains the dominant privilege boundary.

On Debian-family systems, the fixed APT provider may refresh package indexes under `/var/lib/apt` before simulating an upgrade. It never installs, removes, configures, or downloads upgrade packages. Commands and arguments are hard-coded, run without a shell, use time and output limits, and never originate from the NodeGuard API. The systemd unit keeps `ProtectSystem=strict` and grants write access only to the package-index/cache paths needed by APT.
