# Machine update discovery

NodeGuard discovers operating-system package updates through its outbound-only Go Agent. The feature is inventory and reporting only: it does not install, remove, configure, or upgrade packages, and it cannot reboot a machine.

## Data flow

```text
APT on an Agent machine
        |
        | fixed, local discovery operations
        v
NodeGuard Agent
        |
        | authenticated outbound HTTPS
        v
POST /api/agent/updates
        |
        v
latest SQLite inventory
        |
        v
Dashboard / Updates / Agent detail
```

Opening the Updates page reads SQLite only. It never connects to a machine, invokes APT, uses SSH, or asks an Agent to execute a command.

## Supported systems

The first provider supports the Debian APT family:

- Debian;
- Ubuntu;
- Proxmox VE hosts built on Debian.

The Agent uses `/etc/os-release` and conservative Proxmox detection. Other operating systems report `unsupported`; they are not treated as failed checks. Package managers other than APT can be added later through the isolated provider interface.

## What the Agent does

On its scheduled check, the Agent:

1. identifies the operating system and APT support;
2. passively detects an APT/dpkg lock and delays if the package manager is busy;
3. refreshes APT package metadata with fixed arguments;
4. reads the fixed, non-mutating `apt list --upgradable` inventory to identify available packages;
5. records installed and candidate versions;
6. classifies security updates only from recognized security repository/archive metadata;
7. checks the standard `/run/reboot-required` indicator;
8. sends summary counts and up to 500 package details to NodeGuard.

Commands are hard-coded, invoked without a shell, run with `LC_ALL=C` and `LANG=C`, bounded by a context timeout and output limit, and never derived from browser or API input. Raw command output is not sent to the backend or browser.

APT metadata refresh changes local package indexes, which is required for accurate discovery. It does not change installed packages. The hardened systemd service grants write access only to the APT metadata/cache locations needed by that refresh; the rest of the filesystem remains protected by the existing sandbox.

## Scheduling and retry behavior

The default update-check interval is 21,600 seconds (6 hours):

```env
AGENT_UPDATE_INTERVAL_SECONDS=21600
```

The backend clamps the configured interval to a minimum of 900 seconds.

The first check starts independently about 5–30 seconds after Agent startup. That small jitter prevents many Agents from refreshing repositories at the same instant without making a new installation wait for the normal six-hour interval.

A transient busy or failed check retries after approximately 30 seconds, 2 minutes, 5 minutes, and then 15 minutes, capped by the configured normal interval. Only one update check may run per Agent at once.

Update collection runs independently from heartbeat, metrics, inventory, and Docker collection. A slow repository cannot block those reports or graceful Agent shutdown.

The bounded in-memory delivery queue retains at most the newest successful update snapshot and newest non-success state until delivered or replaced. Other telemetry keeps its normal bounded age/capacity behavior, so an outage cannot grow memory without limit or make a recovered backend wait six hours for the next update inventory. The queue is not written to disk and does not survive an Agent process restart.

## Report states

| State | Meaning | Stored-data behavior |
|---|---|---|
| `ok` | The latest APT discovery completed. | Counts and bounded package details replace the previous successful inventory. |
| `unsupported` | The operating system is not supported by the current provider. | The machine remains visible as unsupported. |
| `package_manager_busy` | APT or dpkg is in use. | The previous successful inventory remains visible and the Agent retries later. |
| `metadata_refresh_failed` | Package metadata could not be refreshed. | The previous successful inventory remains visible with a safe failure message. |
| `check_failed` | Discovery could not complete after support was detected. | The previous successful inventory remains visible with a safe failure message. |

`checkedAt` is the latest attempted check. `lastSuccessfulAt` is kept separately so a failure cannot make old data look current. Stale and offline labels come from the existing Agent heartbeat status and do not erase prior update data.

Per-machine freshness is explicit: `waiting` means no successful inventory exists yet; `current` means a recent successful inventory from an online Agent; `retained` means usable prior data remains after a failed check or unavailable Agent; `stale` means the last success is older than the configured freshness window; and `unsupported` means the operating system has no update provider.

Headline totals are `unknown` until at least one successful inventory exists. With retained data, totals are clearly labeled as last-known/partial and current coverage is shown separately, so a failed or missing report never becomes a false zero.

If more than 500 packages are available, summary counts still represent the full result, the first 500 normalized entries are stored, and the UI shows that the package list is truncated.

## Storage and APIs

NodeGuard stores one current inventory per Agent and one bounded current package set. It does not retain unbounded update history. Package replacement is transactional, duplicate package names are rejected, and permanent Agent deletion removes its update inventory through foreign-key cascading.

Agent reports use the existing per-Agent bearer credential and timestamp validation:

```text
POST /api/agent/updates
```

Signed-in owner views read:

```text
GET /api/updates
GET /api/updates/machines/:agentId
```

The API validates schema version, state, timestamps, counts, field lengths, package count, and request size. It rejects a delayed report that would overwrite a newer inventory. No credentials, environment variables, repository URLs containing secrets, raw stderr, or stack traces are returned.

## Update the Agent

Machine update discovery requires Agent v0.2.0 or newer; the prompt startup check, read-only listing path, strict metadata failure handling, and outage-safe delivery require Agent v0.3.1. Rebuilding the NodeGuard server makes the versioned installer assets available but does not silently replace Agents on monitored machines.

For each selected machine, generate or reuse the normal checksum-verified installer workflow. A healthy upgrade preserves `/etc/nodeguard-agent/config.json` and its credential. If the stored credential was revoked/deleted or rejected, Agent v0.3's recovery flow preserves the stable machine identity and rotates the credential with a fresh one-time token instead of creating a duplicate machine. Then confirm:

```bash
sudo nodeguard-agent version
sudo nodeguard-agent config validate
sudo nodeguard-agent doctor
sudo systemctl status nodeguard-agent
sudo journalctl -u nodeguard-agent --since '30 minutes ago'
```

Older configuration files do not contain the update interval. Current Agents supply the safe six-hour default when loading them.

## Troubleshooting

### Waiting for update inventory

- Confirm the machine is running Agent v0.3.1 for the current startup, retry, and delivery behavior.
- Confirm the Agent is online in NodeGuard.
- Allow approximately 5–30 seconds for the first check to start; repository refresh time is additional.
- Review `journalctl` for the structured update-check event.
- Confirm the machine can reach its configured APT repositories.

### Package manager busy

Another local package operation owns an APT/dpkg lock. NodeGuard does not kill it or remove lock files. Let the local operation finish; the Agent retries automatically.

### Metadata refresh failed

Check repository reachability, DNS, certificate trust, repository signatures, and the machine's APT configuration. NodeGuard deliberately exposes only a user-safe category in the browser; use local APT diagnostics on the machine for details.

### Service sandbox denies writes

Upgrade with the current installer so the packaged systemd unit and embedded installer unit include the narrow APT metadata/cache `ReadWritePaths`. Do not weaken `ProtectSystem=strict` globally.

### Old data after a failure

This is intentional. NodeGuard preserves the last successful package inventory and labels the latest failed attempt. Compare `checkedAt` with `lastSuccessfulAt` in the machine detail.

## Security boundaries

- no inbound Agent listener;
- no arbitrary command, argument, script, or shell payload;
- no package installation, removal, configuration, or upgrade;
- no reboot endpoint;
- no SSH dependency;
- no browser-triggered package check;
- no package-manager process termination or lock-file deletion;
- no credentials or raw command output in reports;
- owner-authenticated Live reads and isolated fictional Demo data;
- bounded command output, JSON body, package list, retry queue, and database state.

Proxmox is optional context only. An Agent inside a VM or LXC reports under its own Agent identity. NodeGuard does not infer a Proxmox relationship from a hostname, execute package commands through Proxmox, or duplicate the inventory on the Proxmox page.
