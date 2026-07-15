type AgentCommandOptions = {
  serverUrl: string;
  displayName?: string | null;
  rotation: boolean;
};

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildAgentCommand({ serverUrl, displayName, rotation }: AgentCommandOptions) {
  if (!rotation) {
    return `curl -fsSL ${shellQuote(`${serverUrl}/install-agent.sh`)} | sudo bash -s -- --server ${shellQuote(serverUrl)}${displayName ? ` --name ${shellQuote(displayName)}` : ""}`;
  }

  // v0.2 understands `register`; v0.3 retains it as the safe re-enrollment
  // alias. A root-owned Bash process reads from the controlling terminal so
  // the one-time token never appears in shell history or process arguments.
  const registration = `nodeguard-agent register --server "$1"${displayName ? ` --name "$2"` : ""}`;
  // v0.2 writes the rotated credential but does not restart its long-running
  // process, so restart explicitly after a successful registration. v0.3 may
  // already have restarted itself; the second systemd restart is harmless.
  const prompt = `read -rsp "NodeGuard enrollment token: " NODEGUARD_ENROLLMENT_TOKEN </dev/tty && printf "\\n" >/dev/tty && export NODEGUARD_ENROLLMENT_TOKEN && ${registration} && unset NODEGUARD_ENROLLMENT_TOKEN && systemctl restart nodeguard-agent`;
  return `sudo bash -c ${shellQuote(prompt)} _ ${shellQuote(serverUrl)}${displayName ? ` ${shellQuote(displayName)}` : ""}`;
}
