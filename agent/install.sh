#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' "Run this installer as root." >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
BINARY=${NODEGUARD_AGENT_BINARY:-"$SCRIPT_DIR/bin/nodeguard-agent"}
SERVICE=${NODEGUARD_AGENT_SERVICE:-"$SCRIPT_DIR/packaging/nodeguard-agent.service"}

if [ ! -f "$BINARY" ] || [ ! -x "$BINARY" ]; then
  printf '%s\n' "Agent binary not found or not executable: $BINARY" >&2
  printf '%s\n' "Run 'make build' first or set NODEGUARD_AGENT_BINARY." >&2
  exit 1
fi

if [ ! -f "$SERVICE" ]; then
  printf '%s\n' "systemd service file not found: $SERVICE" >&2
  exit 1
fi

install -d -m 0700 /etc/nodeguard-agent
install -d -m 0700 /var/lib/nodeguard-agent
install -m 0755 "$BINARY" /usr/local/bin/nodeguard-agent
"/usr/local/bin/nodeguard-agent" identity ensure
install -m 0644 "$SERVICE" /etc/systemd/system/nodeguard-agent.service
systemctl daemon-reload

printf '%s\n' "Installed /usr/local/bin/nodeguard-agent"
printf '%s\n' "Installed /etc/systemd/system/nodeguard-agent.service"
printf '%s\n' "No service was started and no credentials were created."
printf '%s\n' "Created or preserved /var/lib/nodeguard-agent/machine-id."
printf '%s\n' "Generate an enrollment token in NodeGuard, enroll this machine, then run:"
printf '%s\n' "  systemctl enable --now nodeguard-agent"
