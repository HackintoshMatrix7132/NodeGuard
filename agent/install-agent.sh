#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

readonly INSTALLER_VERSION="0.3.1"
readonly INSTALL_PATH="/usr/local/bin/nodeguard-agent"
readonly CONFIG_DIR="/etc/nodeguard-agent"
readonly CONFIG_PATH="${CONFIG_DIR}/config.json"
readonly STATE_DIR="/var/lib/nodeguard-agent"
readonly MACHINE_ID_PATH="${STATE_DIR}/machine-id"
readonly UNIT_PATH="/etc/systemd/system/nodeguard-agent.service"
readonly SERVICE_NAME="nodeguard-agent.service"

SERVER_URL=""
ENROLLMENT_TOKEN=${NODEGUARD_ENROLLMENT_TOKEN:-}
unset NODEGUARD_ENROLLMENT_TOKEN || true
DISPLAY_NAME=""
REQUESTED_VERSION="latest"
ASSUME_YES=0
VERBOSE=0
NO_COLOR_REQUESTED=0
FORCE_REINSTALL=0
REPLACE_EXISTING=0
TOKEN_FROM_ARGUMENT=0
TEMP_DIR=""
COMMAND_LOG=""
STATUS_OUTPUT=""
USE_COLOR=0
USE_UNICODE=0
BINARY_CHANGED=0
UNIT_CHANGED=0
INSTALL_COMPLETE=0
SERVICE_WAS_ACTIVE=0
HAD_BINARY=0
HAD_UNIT=0
HAD_MACHINE_ID=0
PREVIOUS_SERVICE_STOPPED=0

usage() {
  cat <<'USAGE'
NodeGuard Agent Installer

Usage:
  install-agent.sh --server URL [options]

Required for a new registration:
  --server URL       NodeGuard HTTPS URL

Enrollment token (choose one):
  secure prompt      Used automatically on an interactive terminal
  environment        NODEGUARD_ENROLLMENT_TOKEN (preferred for automation)
  --token TOKEN      Compatibility option; may be visible in process listings

Options:
  --name NAME        Agent display name
  --agent-version V  Agent version to install (default: latest)
  --version [V]      Print installer version, or install V for compatibility
  --yes              Accept safe non-interactive defaults
  --non-interactive  Alias for --yes
  --force-reinstall  Reinstall even when the current binary is verified
  --replace-existing Re-enroll only the record with this stable machine identity
  --verbose          Show additional diagnostics when a step fails
  --no-color         Disable color and animated terminal output
  --help              Show this help text

Normal upgrades preserve the stable identity and valid credentials. If stale
credentials are detected, provide a new token to re-enroll. Replacing a healthy
registration requires --replace-existing and a valid one-time token.
USAGE
}

while (($# > 0)); do
  case "$1" in
    --server)
      (($# >= 2)) || { printf '%s\n' "Error: --server requires a value." >&2; exit 2; }
      SERVER_URL=$2
      shift 2
      ;;
    --token)
      (($# >= 2)) || { printf '%s\n' "Error: --token requires a value." >&2; exit 2; }
      ENROLLMENT_TOKEN=$2
      TOKEN_FROM_ARGUMENT=1
      shift 2
      ;;
    --name)
      (($# >= 2)) || { printf '%s\n' "Error: --name requires a value." >&2; exit 2; }
      DISPLAY_NAME=$2
      shift 2
      ;;
    --version)
      if (($# >= 2)) && [[ $2 != --* ]]; then
        REQUESTED_VERSION=${2#v}
        shift 2
      else
        printf 'NodeGuard Agent Installer %s\n' "$INSTALLER_VERSION"
        exit 0
      fi
      ;;
    --agent-version)
      (($# >= 2)) || { printf '%s\n' "Error: --agent-version requires a value." >&2; exit 2; }
      REQUESTED_VERSION=${2#v}
      shift 2
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --non-interactive)
      ASSUME_YES=1
      shift
      ;;
    --force-reinstall)
      FORCE_REINSTALL=1
      shift
      ;;
    --replace-existing)
      REPLACE_EXISTING=1
      shift
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    --no-color)
      NO_COLOR_REQUESTED=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Error: unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# Drop parsed shell positional references. This cannot conceal an argument from
# the kernel process list, so the environment or secure prompt is preferred.
set --

if [[ -t 1 && $NO_COLOR_REQUESTED -eq 0 && -z ${NO_COLOR:-} && ${TERM:-} != "dumb" ]]; then
  USE_COLOR=1
fi
if [[ -t 1 && $NO_COLOR_REQUESTED -eq 0 && -z ${NO_COLOR:-} && ${TERM:-} != "dumb" ]] && command -v locale >/dev/null 2>&1 && [[ $(locale charmap 2>/dev/null || true) == "UTF-8" ]]; then
  USE_UNICODE=1
fi

if ((USE_COLOR)); then
  BLUE=$'\033[38;5;39m'
  CYAN=$'\033[38;5;45m'
  GREEN=$'\033[38;5;82m'
  AMBER=$'\033[38;5;214m'
  RED=$'\033[38;5;203m'
  MUTED=$'\033[38;5;246m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
else
  BLUE="" CYAN="" GREEN="" AMBER="" RED="" MUTED="" BOLD="" RESET=""
fi

if ((USE_UNICODE)); then
  OK_SYMBOL="✓"
  INFO_SYMBOL="•"
  WARN_SYMBOL="!"
  ERROR_SYMBOL="✕"
  SEPARATOR="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  OK_SYMBOL="[OK]"
  INFO_SYMBOL="[--]"
  WARN_SYMBOL="[WARN]"
  ERROR_SYMBOL="[ERROR]"
  SEPARATOR="----------------------------------------"
fi

ok() { printf '%s%s%s %s\n' "$GREEN" "$OK_SYMBOL" "$RESET" "$1"; }
info() { printf '%s%s%s %s\n' "$CYAN" "$INFO_SYMBOL" "$RESET" "$1"; }
warn() { printf '%s%s%s %s\n' "$AMBER" "$WARN_SYMBOL" "$RESET" "$1"; }
detail() { printf '  %s%s%s\n' "$MUTED" "$1" "$RESET"; }
section() { printf '\n%s%s%s\n\n' "$BOLD" "$1" "$RESET"; }

require_enrollment_token() {
  if [[ -n $ENROLLMENT_TOKEN ]]; then
    return 0
  fi
  if ((ASSUME_YES)) || [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
    fatal "No enrollment token was provided. Set NODEGUARD_ENROLLMENT_TOKEN for non-interactive installation." 2
  fi
  printf '%sEnrollment token:%s ' "$BOLD" "$RESET" >/dev/tty
  IFS= read -r -s ENROLLMENT_TOKEN </dev/tty || fatal "Could not read the enrollment token from the terminal." 2
  printf '\n' >/dev/tty
  [[ -n $ENROLLMENT_TOKEN ]] || fatal "The enrollment token cannot be empty." 2
}

cleanup() {
  rm -f -- "${INSTALL_PATH}.new.$$" 2>/dev/null || true
  if [[ -n $TEMP_DIR && -d $TEMP_DIR ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
}

rollback() {
  ((INSTALL_COMPLETE == 0)) || return 0
  if ((BINARY_CHANGED)); then
    if ((HAD_BINARY)) && [[ -f $TEMP_DIR/original-binary ]]; then
      install -m 0755 "$TEMP_DIR/original-binary" "$INSTALL_PATH" || true
    else
      rm -f -- "$INSTALL_PATH"
    fi
  fi
  if ((UNIT_CHANGED)); then
    if ((HAD_UNIT)) && [[ -f $TEMP_DIR/original-unit ]]; then
      install -m 0644 "$TEMP_DIR/original-unit" "$UNIT_PATH" || true
    else
      rm -f -- "$UNIT_PATH"
    fi
    systemctl daemon-reload >/dev/null 2>&1 || true
  fi
  if ((PREVIOUS_SERVICE_STOPPED)); then
    systemctl restart "$SERVICE_NAME" >/dev/null 2>&1 || true
    PREVIOUS_SERVICE_STOPPED=0
  fi
}

show_failure_log() {
  if ((VERBOSE)) && [[ -s $COMMAND_LOG ]]; then
    printf '\n%sDiagnostic output:%s\n' "$MUTED" "$RESET" >&2
    sed -n '1,80p' "$COMMAND_LOG" >&2
  fi
}

fatal() {
  show_failure_log
  printf '%s%s%s %s\n' "$RED" "$ERROR_SYMBOL" "$RESET" "$1" >&2
  exit "${2:-1}"
}

handle_signal() {
  printf '\n%s%s%s Installation interrupted.\n' "$RED" "$ERROR_SYMBOL" "$RESET" >&2
  exit 130
}

handle_error() {
  local status=$1
  local line=$2
  printf '%s%s%s Unexpected installer failure near line %s (exit %s). Rolling back safely.\n' "$RED" "$ERROR_SYMBOL" "$RESET" "$line" "$status" >&2
}

finish() {
  local status=$?
  if ((status != 0 && INSTALL_COMPLETE == 0)); then
    rollback
  fi
  cleanup
  return "$status"
}

trap finish EXIT
trap 'handle_error "$?" "$LINENO"' ERR
trap handle_signal INT TERM HUP

run_step() {
  local label=$1
  shift
  : >"$COMMAND_LOG"
  local status=0

  if ((USE_UNICODE)); then
    "$@" >"$COMMAND_LOG" 2>&1 &
    local command_pid=$!
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    local index=0
    while kill -0 "$command_pid" 2>/dev/null; do
      printf '\r%s%s%s %s' "$CYAN" "${frames[$index]}" "$RESET" "$label"
      index=$(((index + 1) % ${#frames[@]}))
      sleep 0.1
    done
    if wait "$command_pid"; then status=0; else status=$?; fi
    printf '\r%*s\r' "$(( ${#label} + 4 ))" ""
  else
    if "$@" >"$COMMAND_LOG" 2>&1; then status=0; else status=$?; fi
  fi

  if ((status != 0)); then
    return "$status"
  fi
  ok "$label"
}

fetch_file() {
  local url=$1
  local destination=$2
  curl --fail --silent --show-error --location \
    --proto '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 180 \
    --output "$destination" "$url"
}

write_service_unit() {
  cat >"$TEMP_DIR/nodeguard-agent.service" <<'UNIT'
[Unit]
Description=NodeGuard read-only Linux monitoring agent
Documentation=https://github.com/HackintoshMatrix7132/NodeGuard
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/nodeguard-agent run --config /etc/nodeguard-agent/config.json
StateDirectory=nodeguard-agent
StateDirectoryMode=0700
Restart=on-failure
RestartSec=10s
TimeoutStopSec=30s
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=-/var/lib/apt/lists -/var/cache/apt -/var/lib/apt/periodic
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
RestrictSUIDSGID=true
RestrictRealtime=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
SystemCallArchitectures=native
LockPersonality=true

[Install]
WantedBy=multi-user.target
UNIT
}

enroll_agent() {
  local args=(enroll --server "$SERVER_URL" --config "$CONFIG_PATH" --state-dir "$STATE_DIR")
  if [[ -n $DISPLAY_NAME ]]; then
    args+=(--name "$DISPLAY_NAME")
  fi
  NODEGUARD_ENROLLMENT_TOKEN="$ENROLLMENT_TOKEN" "$INSTALL_PATH" "${args[@]}"
}

reenroll_agent() {
  local args=(re-enroll --server "$SERVER_URL" --config "$CONFIG_PATH" --state-dir "$STATE_DIR")
  if [[ -n $DISPLAY_NAME ]]; then
    args+=(--name "$DISPLAY_NAME")
  fi
  if ((REPLACE_EXISTING)); then
    args+=(--replace-existing)
  fi
  NODEGUARD_ENROLLMENT_TOKEN="$ENROLLMENT_TOKEN" "$INSTALL_PATH" "${args[@]}"
}

wait_for_online() {
  local deadline=$((SECONDS + 90))
  while ((SECONDS < deadline)); do
    if "$INSTALL_PATH" status --config "$CONFIG_PATH" >"$STATUS_OUTPUT" 2>/dev/null; then
      if grep -Eqi '^Enrollment[[:space:]]+Active$' "$STATUS_OUTPUT" &&
        grep -Eqi '^Connection[[:space:]]+Online$' "$STATUS_OUTPUT" &&
        systemctl is-active --quiet "$SERVICE_NAME"; then
        return 0
      fi
    fi
    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
      return 2
    fi
    sleep 2
  done
  return 1
}

if ((USE_UNICODE)); then
  printf '%s%s╭────────────────────────────────────────╮%s\n' "$BLUE" "$BOLD" "$RESET"
  printf '%s%s│       NodeGuard Agent Installer        │%s\n' "$BLUE" "$BOLD" "$RESET"
  printf '%s│   Secure monitoring for your host      │%s\n' "$CYAN" "$RESET"
  printf '%s╰────────────────────────────────────────╯%s\n' "$BLUE" "$RESET"
else
  printf '%sNodeGuard Agent Installer%s\n' "$BOLD" "$RESET"
  printf '%sSecure monitoring for your host%s\n' "$MUTED" "$RESET"
fi

if [[ $(id -u) -ne 0 ]]; then
  fatal "Root privileges are required. Re-run the command through sudo." 3
fi
if [[ $(uname -s) != "Linux" ]]; then
  fatal "NodeGuard Agent supports Linux hosts only." 4
fi
if [[ -z $SERVER_URL ]]; then
  fatal "Missing --server. Provide the HTTPS URL of your NodeGuard instance." 2
fi
if ((TOKEN_FROM_ARGUMENT)); then
  warn "--token may be visible in the process list. Prefer the secure prompt or NODEGUARD_ENROLLMENT_TOKEN."
fi
SERVER_URL=${SERVER_URL%/}
if [[ ! $SERVER_URL =~ ^https://[^/?#]+([/][^?#]*)?$ ]] || [[ $SERVER_URL == *"@"* ]]; then
  fatal "The NodeGuard server must be an HTTPS URL without credentials, a query, or a fragment." 2
fi
if [[ ! -d /run/systemd/system ]] || ! command -v systemctl >/dev/null 2>&1; then
  fatal "systemd is required. Install the Agent manually on a supported systemd-based distribution." 5
fi
for command in curl sha256sum install mktemp awk grep sed uname cat cp mv cmp tr chmod chown rm sleep id; do
  command -v "$command" >/dev/null 2>&1 || fatal "Required command '$command' is not installed. Install it and run the installer again." 6
done

umask 077
TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/nodeguard-agent.XXXXXXXX")
COMMAND_LOG="$TEMP_DIR/command.log"
STATUS_OUTPUT="$TEMP_DIR/status.txt"

section "System"
ok "Linux detected"

OS_NAME="Linux"
OS_ID="linux"
OS_LIKE=""
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_NAME=${PRETTY_NAME:-${NAME:-Linux}}
  OS_ID=${ID:-linux}
  OS_LIKE=${ID_LIKE:-}
fi
case " $OS_ID $OS_LIKE " in
  *" ubuntu "*|*" debian "*|*" linuxmint "*|*" raspbian "*|*" fedora "*|*" rhel "*|*" rocky "*|*" almalinux "*|*" centos "*) ;;
  *) warn "This systemd Linux distribution is not in the validated list; installation will continue." ;;
esac
detail "$OS_NAME"

case $(uname -m) in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) fatal "Unsupported architecture '$(uname -m)'. Supported architectures are amd64 and arm64." 7 ;;
esac
ok "Architecture detected"
detail "$ARCH"

if systemctl is-active --quiet "$SERVICE_NAME"; then
  SERVICE_WAS_ACTIVE=1
fi
if [[ -e $INSTALL_PATH ]]; then
  HAD_BINARY=1
  cp -p "$INSTALL_PATH" "$TEMP_DIR/original-binary"
fi
if [[ -e $UNIT_PATH ]]; then
  HAD_UNIT=1
  cp -p "$UNIT_PATH" "$TEMP_DIR/original-unit"
fi

section "Agent"
if [[ $REQUESTED_VERSION == "latest" ]]; then
  if ! run_step "Resolved latest Agent release" fetch_file "$SERVER_URL/agent/releases/latest/version" "$TEMP_DIR/version"; then
    fatal "Could not resolve the latest Agent version from $SERVER_URL. Check DNS, TLS, and NodeGuard availability." 10
  fi
  REQUESTED_VERSION=$(tr -d '[:space:]' <"$TEMP_DIR/version")
fi
if [[ ! $REQUESTED_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  fatal "The requested Agent version is invalid." 2
fi

INSTALLED_VERSION=""
if [[ -x $INSTALL_PATH ]]; then
  INSTALLED_VERSION=$($INSTALL_PATH version 2>/dev/null | awk '/^Version:/ { print $2; exit }' || true)
fi

ASSET="nodeguard-agent-linux-$ARCH"
RELEASE_BASE="$SERVER_URL/agent/releases/$REQUESTED_VERSION"
if ! run_step "Downloaded checksum manifest" fetch_file "$RELEASE_BASE/checksums.txt" "$TEMP_DIR/checksums.txt"; then
  fatal "Could not download the checksum manifest; the Agent was not installed." 10
fi
EXPECTED_SHA=$(awk -v asset="$ASSET" '$2 == asset { print $1; exit }' "$TEMP_DIR/checksums.txt")
if [[ ! $EXPECTED_SHA =~ ^[0-9a-fA-F]{64}$ ]]; then
  fatal "The checksum manifest does not contain a valid SHA-256 value for $ASSET." 11
fi

INSTALLED_SHA=""
if [[ -x $INSTALL_PATH ]]; then
  INSTALLED_SHA=$(sha256sum "$INSTALL_PATH" | awk '{ print $1 }')
fi
if [[ $INSTALLED_VERSION == "$REQUESTED_VERSION" && $INSTALLED_SHA == "$EXPECTED_SHA" && $FORCE_REINSTALL -eq 0 ]]; then
  ok "Agent v$REQUESTED_VERSION is already installed"
  ok "Installed Agent checksum verified"
else
  if ! run_step "Downloaded Agent v$REQUESTED_VERSION" fetch_file "$RELEASE_BASE/$ASSET" "$TEMP_DIR/$ASSET"; then
    fatal "Agent download failed. Confirm that release v$REQUESTED_VERSION includes a Linux $ARCH binary." 10
  fi
  ACTUAL_SHA=$(sha256sum "$TEMP_DIR/$ASSET" | awk '{ print $1 }')
  if [[ $ACTUAL_SHA != "$EXPECTED_SHA" ]]; then
    fatal "SHA-256 checksum mismatch. The downloaded binary was rejected and no changes were made." 11
  fi
  ok "SHA-256 checksum verified"

  if ((SERVICE_WAS_ACTIVE)); then
    if ! systemctl stop "$SERVICE_NAME" >"$COMMAND_LOG" 2>&1; then
      fatal "Could not stop the existing NodeGuard Agent safely; no binary was replaced." 13
    fi
    PREVIOUS_SERVICE_STOPPED=1
    ok "Stopped previous Agent service"
  fi
  install -m 0755 "$TEMP_DIR/$ASSET" "${INSTALL_PATH}.new.$$"
  BINARY_CHANGED=1
  mv -f "${INSTALL_PATH}.new.$$" "$INSTALL_PATH"
  ok "Installed Agent v$REQUESTED_VERSION"
  detail "$INSTALL_PATH"
fi

section "Installation"
install -d -o root -g root -m 0700 "$CONFIG_DIR"
if [[ -f $MACHINE_ID_PATH ]]; then
  HAD_MACHINE_ID=1
fi
install -d -o root -g root -m 0700 "$STATE_DIR"
if ! run_step "Prepared stable machine identity" "$INSTALL_PATH" identity ensure --state-dir "$STATE_DIR"; then
  fatal "Could not create or validate $MACHINE_ID_PATH. Check ownership, permissions, and available disk space." 13
fi
if [[ -f $CONFIG_PATH ]]; then
  chown root:root "$CONFIG_PATH"
  chmod 0600 "$CONFIG_PATH"
  ok "Existing NodeGuard Agent detected"
  ok "Preserved machine identity"

  EXISTING_STATUS_CODE=0
  if "$INSTALL_PATH" status --config "$CONFIG_PATH" >"$STATUS_OUTPUT" 2>"$COMMAND_LOG"; then
    EXISTING_STATUS_CODE=0
  else
    EXISTING_STATUS_CODE=$?
  fi

  SHOULD_REENROLL=0
  if ((REPLACE_EXISTING)); then
    require_enrollment_token
    SHOULD_REENROLL=1
  elif ((EXISTING_STATUS_CODE == 6)); then
    require_enrollment_token
    SHOULD_REENROLL=1
    REPLACE_EXISTING=1
    warn "Stored Agent credential is stale and will be replaced."
  elif ((EXISTING_STATUS_CODE == 0)); then
    ok "Existing Agent registration is active"
    if [[ -n $ENROLLMENT_TOKEN ]]; then
      warn "The supplied token was not used because this registration is healthy. Use --replace-existing to rotate it explicitly."
    fi
  elif ((EXISTING_STATUS_CODE == 5)); then
    warn "NodeGuard is temporarily unreachable; the existing credential was preserved."
  else
    fatal "Existing Agent configuration is invalid. Run 'nodeguard-agent config validate' before reinstalling." 12
  fi

  if ((SHOULD_REENROLL)); then
    if ! run_step "Re-enrolled this machine" reenroll_agent; then
      if grep -qi 'new credentials were saved and the service restarted' "$COMMAND_LOG"; then
        BINARY_CHANGED=0
        PREVIOUS_SERVICE_STOPPED=0
        fatal "Re-enrollment succeeded and the new binary, configuration, and running service were kept, but connectivity is not verified. Run 'sudo nodeguard-agent status' and 'sudo nodeguard-agent doctor'; inspect 'sudo journalctl -u nodeguard-agent -n 100 --no-pager' if it remains offline." 14
      fi
      if grep -qi 'new credentials were saved, but the service could not restart' "$COMMAND_LOG"; then
        # Credential rotation is already committed. Do not roll the binary back
        # or automatically restart a service with assumptions from the old
        # installation state.
        BINARY_CHANGED=0
        PREVIOUS_SERVICE_STOPPED=0
        fatal "Re-enrollment succeeded and new credentials were saved, but systemd could not restart the Agent. The new binary and configuration were kept and the service remains stopped. Run 'sudo systemctl restart nodeguard-agent'; if it still fails, inspect 'sudo journalctl -u nodeguard-agent -n 100 --no-pager'." 13
      fi
      if grep -qiE 'protected recovery configuration|stale service was left stopped' "$COMMAND_LOG"; then
        BINARY_CHANGED=0
        PREVIOUS_SERVICE_STOPPED=0
        fatal "NodeGuard issued a new credential, but it could not become active. Inspect ${CONFIG_DIR}/.config-recovery-* (mode 0600); the stale service was left stopped." 13
      fi
      if grep -qiE 'already registered|machine identity conflict' "$COMMAND_LOG"; then
        fatal "This stable machine identity is already registered. Generate a new token and retry with --replace-existing." 12
      fi
      if grep -qiE 'does not match this machine|identity mismatch' "$COMMAND_LOG"; then
        fatal "Replacement was refused because the token does not match this machine registration. No unrelated Agent was changed." 12
      fi
      if grep -qiE 'token is invalid|invalid.*token|expired|revoked|already used' "$COMMAND_LOG"; then
        fatal "Re-enrollment failed because the token is invalid, expired, revoked, or already used. Generate a new token and retry." 12
      fi
      fatal "Re-enrollment failed. The previous local configuration was preserved; verify the token, URL, clock, and connectivity." 12
    fi
    ENROLLMENT_TOKEN=""
    ok "Rotated Agent credentials"
  fi
else
  require_enrollment_token
  ENROLL_FUNCTION=enroll_agent
  ENROLL_LABEL="Enrolled this machine"
  if ((HAD_MACHINE_ID)); then
    REPLACE_EXISTING=1
    ENROLL_FUNCTION=reenroll_agent
    ENROLL_LABEL="Re-enrolled this machine"
    ok "Existing machine identity detected after an earlier installation"
  elif ((REPLACE_EXISTING)); then
    fatal "--replace-existing requires a preserved stable machine identity from an earlier installation." 2
  fi
  if ! run_step "$ENROLL_LABEL" "$ENROLL_FUNCTION"; then
    if grep -qi 'new credentials were saved and the service restarted' "$COMMAND_LOG"; then
      BINARY_CHANGED=0
      PREVIOUS_SERVICE_STOPPED=0
      fatal "Re-enrollment succeeded and the new binary, configuration, and running service were kept, but connectivity is not verified. Run 'sudo nodeguard-agent status' and 'sudo nodeguard-agent doctor'; inspect 'sudo journalctl -u nodeguard-agent -n 100 --no-pager' if it remains offline." 14
    fi
    if grep -qi 'new credentials were saved, but the service could not restart' "$COMMAND_LOG"; then
      BINARY_CHANGED=0
      PREVIOUS_SERVICE_STOPPED=0
      fatal "Re-enrollment succeeded and new credentials were saved, but systemd could not restart the Agent. The new binary and configuration were kept and the service remains stopped. Run 'sudo systemctl restart nodeguard-agent'; if it still fails, inspect 'sudo journalctl -u nodeguard-agent -n 100 --no-pager'." 13
    fi
    if grep -qiE 'protected recovery configuration|stale service was left stopped' "$COMMAND_LOG"; then
      BINARY_CHANGED=0
      PREVIOUS_SERVICE_STOPPED=0
      fatal "NodeGuard issued a new credential, but it could not become active. Inspect ${CONFIG_DIR}/.config-recovery-* (mode 0600); the stale service was left stopped." 13
    fi
    if grep -qi 'already registered' "$COMMAND_LOG"; then
      fatal "This stable machine identity is already registered. Generate a new token and retry with --replace-existing." 12
    fi
    if grep -qiE 'does not match this machine|identity mismatch' "$COMMAND_LOG"; then
      fatal "Replacement was refused because the token does not match this machine registration. No unrelated Agent was changed." 12
    fi
    if grep -qiE 'token is invalid|invalid.*token|expired|revoked|already used' "$COMMAND_LOG"; then
      fatal "The enrollment token is invalid, expired, revoked, or already used. Generate a new token and try again." 12
    fi
    fatal "Agent enrollment failed. Verify the NodeGuard URL, system clock, and enrollment token." 12
  fi
  ENROLLMENT_TOKEN=""
  chmod 0600 "$CONFIG_PATH"
  chown root:root "$CONFIG_PATH"
  detail "A unique Agent credential was saved with root ownership and mode 0600."
fi

write_service_unit
if [[ ! -f $UNIT_PATH ]] || ! cmp -s "$TEMP_DIR/nodeguard-agent.service" "$UNIT_PATH"; then
  install -m 0644 "$TEMP_DIR/nodeguard-agent.service" "$UNIT_PATH"
  UNIT_CHANGED=1
  systemctl daemon-reload
  ok "Installed systemd service"
else
  ok "systemd service is already current"
fi

if ! systemctl enable "$SERVICE_NAME" >"$COMMAND_LOG" 2>&1; then
  fatal "Could not enable NodeGuard Agent at startup." 13
fi
ok "Enabled automatic startup"

if ((BINARY_CHANGED || UNIT_CHANGED || SERVICE_WAS_ACTIVE == 0)); then
  if ! systemctl restart "$SERVICE_NAME" >"$COMMAND_LOG" 2>&1; then
    fatal "NodeGuard Agent could not start. Run 'journalctl -u nodeguard-agent -n 50' for details." 13
  fi
  ok "Started NodeGuard Agent"
else
  ok "NodeGuard Agent is already running"
fi

section "Connection"
if ! run_step "Connected to NodeGuard" wait_for_online; then
  if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    fatal "The service stopped before connecting. Run 'journalctl -u nodeguard-agent -n 50' for details." 13
  fi
  fatal "NodeGuard did not report the Agent online within 90 seconds. Check outbound HTTPS, DNS, system time, and the service journal." 14
fi

HOST_NAME=$(hostname 2>/dev/null || true)
AGENT_NAME=$DISPLAY_NAME

INSTALL_COMPLETE=1
printf '\n%s%s%s\n\n' "$BLUE" "$SEPARATOR" "$RESET"
ok "NodeGuard Agent is ready"
printf '\n%sHost%s\n%s\n' "$BOLD" "$RESET" "${HOST_NAME:-${AGENT_NAME:-Registered host}}"
printf '\n%sStatus%s\nOnline\n' "$BOLD" "$RESET"
printf '\n%sThe host is now being monitored.%s\n' "$MUTED" "$RESET"

if ((VERBOSE)); then
  detail "Installer v$INSTALLER_VERSION completed with version v$REQUESTED_VERSION."
fi
if ((ASSUME_YES)); then
  : # Accepted for stable unattended automation; the installer has no destructive prompts.
fi
