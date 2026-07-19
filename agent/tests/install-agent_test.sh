#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
INSTALLER="$SCRIPT_DIR/install-agent.sh"
TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/nodeguard-installer-test.XXXXXXXX")
trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM

bash -n "$INSTALLER"
bash "$INSTALLER" --help >"$TEMP_DIR/help.txt"

for option in --server --token --name --agent-version --version --yes --non-interactive --force-reinstall --replace-existing --verbose --no-color --help; do
  grep -q -- "$option" "$TEMP_DIR/help.txt"
done

bash "$INSTALLER" --version >"$TEMP_DIR/version.txt"
grep -q '^NodeGuard Agent Installer 0.3.1$' "$TEMP_DIR/version.txt"

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
grep -Fq 'StateDirectory=nodeguard-agent' "$INSTALLER"
grep -Fq 'StateDirectory=nodeguard-agent' "$SCRIPT_DIR/packaging/nodeguard-agent.service"
# Match the literal installer source without expanding its variables.
# shellcheck disable=SC2016
grep -Fq 'identity ensure --state-dir "$STATE_DIR"' "$INSTALLER"
# shellcheck disable=SC2016
grep -Fq 're-enroll --server "$SERVER_URL"' "$INSTALLER"
grep -Fq 'SHOULD_REENROLL' "$INSTALLER"
# Match the literal environment capture assignment in the installer.
# shellcheck disable=SC2016
grep -Fq 'ENROLLMENT_TOKEN=${NODEGUARD_ENROLLMENT_TOKEN:-}' "$INSTALLER"
grep -Fq 'unset NODEGUARD_ENROLLMENT_TOKEN' "$INSTALLER"
grep -Fq 'read -r -s ENROLLMENT_TOKEN' "$INSTALLER"
grep -Fq "'^Connection[[:space:]]+Online$'" "$INSTALLER"
grep -Fq 'new credentials were saved, but the service could not restart' "$INSTALLER"
awk '/new credentials were saved, but the service could not restart/{in_restart_failure=1} in_restart_failure && /BINARY_CHANGED=0/{binary_kept=1} in_restart_failure && /PREVIOUS_SERVICE_STOPPED=0/{no_stale_restart=1} in_restart_failure && /systemctl restart nodeguard-agent/{recovery=1; exit} END{exit !(binary_kept && no_stale_restart && recovery)}' "$INSTALLER"
grep -Fq 'new credentials were saved and the service restarted' "$INSTALLER"
awk '/new credentials were saved and the service restarted/{in_online_failure=1} in_online_failure && /BINARY_CHANGED=0/{binary_kept=1} in_online_failure && /PREVIOUS_SERVICE_STOPPED=0/{no_stale_restart=1} in_online_failure && /connectivity is not verified/{recovery=1; exit} END{exit !(binary_kept && no_stale_restart && recovery)}' "$INSTALLER"
awk '/EXISTING_STATUS_CODE == 6/{in_stale=1} in_stale && /REPLACE_EXISTING=1/{found=1; exit} END{exit !found}' "$INSTALLER"
awk '/if \(\(HAD_MACHINE_ID\)\)/{in_preserved=1} in_preserved && /REPLACE_EXISTING=1/{replace=1} in_preserved && /ENROLL_FUNCTION=reenroll_agent/{reenroll=1; exit} END{exit !(replace && reenroll)}' "$INSTALLER"

printf '%s\n' "installer interface tests passed"
