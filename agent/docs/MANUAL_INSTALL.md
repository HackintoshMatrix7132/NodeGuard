# Manual NodeGuard Agent Installation

Use the one-command installer from **Agents → Add Agent** whenever possible. This guide is for hosts where the script must be reviewed or the files must be staged manually.

## 1. Select the release

Determine the host architecture:

```bash
uname -m
```

Use `nodeguard-agent-linux-amd64` for `x86_64` and `nodeguard-agent-linux-arm64` for `aarch64`/`arm64`.

Download the matching binary and `checksums.txt` from either the GitHub Agent release or the NodeGuard release mirror:

```text
https://YOUR_NODEGUARD/agent/releases/VERSION/nodeguard-agent-linux-amd64
https://YOUR_NODEGUARD/agent/releases/VERSION/nodeguard-agent-linux-arm64
https://YOUR_NODEGUARD/agent/releases/VERSION/checksums.txt
```

## 2. Verify SHA-256

```bash
sha256sum -c checksums.txt --ignore-missing
```

Stop immediately if verification fails.

## 3. Install the binary and service

```bash
sudo install -d -o root -g root -m 0700 /etc/nodeguard-agent
sudo install -m 0755 nodeguard-agent-linux-amd64 /usr/local/bin/nodeguard-agent
sudo install -m 0644 packaging/nodeguard-agent.service /etc/systemd/system/nodeguard-agent.service
sudo systemctl daemon-reload
```

## 4. Register once

Generate a token in **Agents → Add Agent**, then register without placing the token in shell history:

```bash
read -rsp 'Enrollment token: ' NODEGUARD_ENROLLMENT_TOKEN && printf '\n'
export NODEGUARD_ENROLLMENT_TOKEN
sudo --preserve-env=NODEGUARD_ENROLLMENT_TOKEN \
  nodeguard-agent register --server https://YOUR_NODEGUARD --name docker-main
unset NODEGUARD_ENROLLMENT_TOKEN
```

## 5. Start and verify

```bash
sudo systemctl enable --now nodeguard-agent
sudo nodeguard-agent status
sudo journalctl -u nodeguard-agent -n 50 --no-pager
```

The protected configuration must be owned by root and mode `0600`.
