# Manual NodeGuard Agent Installation

Use the reviewed one-command installer from **Agents → Add Agent** whenever possible. This guide is for offline staging or hosts where each installation step must be performed manually.

## Requirements

- A systemd-based Linux host
- Root access
- `amd64`/`x86_64` or `arm64`/`aarch64`
- Outbound HTTPS to NodeGuard
- Go is not required when using a release binary

## 1. Select and verify the release

```bash
uname -m
```

Use `nodeguard-agent-linux-amd64` for `x86_64` and `nodeguard-agent-linux-arm64` for `aarch64`/`arm64`. Download the matching binary and checksum manifest over HTTPS:

```text
https://YOUR_NODEGUARD/agent/releases/VERSION/nodeguard-agent-linux-amd64
https://YOUR_NODEGUARD/agent/releases/VERSION/nodeguard-agent-linux-arm64
https://YOUR_NODEGUARD/agent/releases/VERSION/checksums.txt
```

```bash
sha256sum -c checksums.txt --ignore-missing
```

Stop if verification fails.

## 2. Install protected paths

```bash
sudo install -d -o root -g root -m 0700 /etc/nodeguard-agent
sudo install -d -o root -g root -m 0700 /var/lib/nodeguard-agent
sudo install -m 0755 nodeguard-agent-linux-amd64 /usr/local/bin/nodeguard-agent
sudo nodeguard-agent identity ensure
sudo install -m 0644 packaging/nodeguard-agent.service /etc/systemd/system/nodeguard-agent.service
sudo systemctl daemon-reload
```

`identity ensure` creates a cryptographically random UUID only when `/var/lib/nodeguard-agent/machine-id` is absent. It never prints the value. Existing identity is validated and preserved.

## 3. Enroll

Generate a short-lived token in **Agents → Add Agent**, then run:

```bash
sudo nodeguard-agent enroll \
  --server https://YOUR_NODEGUARD \
  --name docker-main
```

The CLI reads the token without echoing it from `/dev/tty`. For automation:

```bash
read -rsp 'Enrollment token: ' NODEGUARD_ENROLLMENT_TOKEN && printf '\n'
export NODEGUARD_ENROLLMENT_TOKEN
sudo --preserve-env=NODEGUARD_ENROLLMENT_TOKEN \
  nodeguard-agent enroll --server https://YOUR_NODEGUARD --name docker-main
unset NODEGUARD_ENROLLMENT_TOKEN
```

`--token` remains compatible with older commands but may expose the token through shell history or process listings.

## 4. Start and verify

```bash
sudo nodeguard-agent config validate
sudo systemctl enable --now nodeguard-agent
sudo nodeguard-agent status
sudo nodeguard-agent doctor
sudo journalctl -u nodeguard-agent -n 50 --no-pager
```

Required permissions:

```text
/etc/nodeguard-agent                         root:root 0700
/etc/nodeguard-agent/config.json             root:root 0600
/var/lib/nodeguard-agent                     root:root 0700
/var/lib/nodeguard-agent/machine-id           root:root 0600
/etc/systemd/system/nodeguard-agent.service   root:root 0644
```

## Reinstall or reclaim this machine

Do not generate a new identity. Preserve `/var/lib/nodeguard-agent/machine-id`, install the current binary, and use a fresh token:

```bash
sudo nodeguard-agent re-enroll --replace-existing
```

If the old backend record was permanently deleted, re-enrollment creates one fresh record for the preserved identity. If the record still exists, exact-identity replacement rotates its credential and preserves its useful history. No hostname-based replacement occurs.

Older `nodeguard-agent register` commands remain accepted through the safe re-enrollment lifecycle.
