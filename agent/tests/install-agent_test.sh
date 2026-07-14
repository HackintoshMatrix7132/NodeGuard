#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
INSTALLER="$SCRIPT_DIR/install-agent.sh"
TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/nodeguard-installer-test.XXXXXXXX")
trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM

bash -n "$INSTALLER"
bash "$INSTALLER" --help >"$TEMP_DIR/help.txt"

for option in --server --token --name --version --yes --verbose --no-color --help; do
  grep -q -- "$option" "$TEMP_DIR/help.txt"
done

if bash "$INSTALLER" --definitely-unknown >"$TEMP_DIR/unknown.txt" 2>&1; then
  printf '%s\n' "unknown installer options must fail" >&2
  exit 1
fi
grep -q "unknown option" "$TEMP_DIR/unknown.txt"

if grep -nE 'printf|echo' "$INSTALLER" | grep -q 'ENROLLMENT_TOKEN'; then
  printf '%s\n' "installer must not print the enrollment token" >&2
  exit 1
fi

APT_PATHS='ReadWritePaths=-/var/lib/apt/lists -/var/cache/apt -/var/lib/apt/periodic'
grep -Fq "$APT_PATHS" "$INSTALLER"
grep -Fq "$APT_PATHS" "$SCRIPT_DIR/packaging/nodeguard-agent.service"
grep -Fq 'ProtectSystem=strict' "$INSTALLER"
grep -Fq 'ProtectSystem=strict' "$SCRIPT_DIR/packaging/nodeguard-agent.service"

printf '%s\n' "installer interface tests passed"
