# Proxmox VE integration

NodeGuard's Proxmox VE integration is a read-only inventory and health source. It discovers nodes, QEMU virtual machines, LXC containers, and storage through the Proxmox API, then presents that data in the Proxmox page, Dashboard, and Alerts.

NodeGuard does not start, stop, restart, migrate, back up, update, or otherwise modify Proxmox resources.

## Requirements

- Proxmox VE reachable from the NodeGuard backend over HTTPS
- A dedicated Proxmox API token
- At least the built-in `PVEAuditor` role at `/`
- The Proxmox certificate authority when the endpoint uses a private or self-signed certificate
- A configured `NODEGUARD_INTEGRATION_SECRET` (or dedicated `NODEGUARD_INTEGRATION_ENCRYPTION_KEY`) on the NodeGuard backend

## Create a read-only API token

Create a dedicated Proxmox user and API token. The exact commands may vary with your Proxmox version and access policy; this is a minimal example:

```bash
pveum user add nodeguard@pve --comment "NodeGuard read-only monitoring"
pveum acl modify / --user nodeguard@pve --role PVEAuditor
pveum user token add nodeguard@pve nodeguard --privsep 1
pveum acl modify / --token 'nodeguard@pve!nodeguard' --role PVEAuditor
```

Record the token secret when Proxmox displays it. Proxmox shows the secret only once.
With privilege separation enabled, both the backing user and the token need the read-only ACL. Verify the effective permissions with:

```bash
pveum user permissions nodeguard@pve
pveum user token permissions nodeguard@pve nodeguard
```

Use these values in NodeGuard:

```text
Token user: nodeguard@pve
Token ID: nodeguard
Token secret: the value returned by Proxmox
```

Keep privilege separation enabled. Do not grant NodeGuard administrative roles.

## Add a connection

1. Open **Settings** in NodeGuard.
2. Find **Integrations** and choose **Add Proxmox connection**.
3. Enter a connection name and the Proxmox API URL, for example `https://pve.example.net:8006`.
4. Enter the token user, token ID, and token secret as separate values.
5. If Proxmox uses a private CA, paste its PEM certificate into the custom CA field.
6. Test the connection.
7. Save the connection after the test succeeds.

NodeGuard requires HTTPS and does not offer a TLS verification bypass. A private or self-signed Proxmox certificate must be trusted by supplying the correct CA certificate.

Multiple Proxmox connections are supported. Owners can edit, enable, disable, synchronize, or remove each connection independently.

## Data collected

NodeGuard reads the Proxmox version endpoint and cluster resource inventory. It stores normalized read-only snapshots for:

- Cluster nodes and their online state
- QEMU virtual machines
- LXC containers
- Storage pools, availability, capacity, and usage

Stopped guests are displayed as inventory and do not create health alerts. NodeGuard keeps runtime state separate from infrastructure health.

### Node details and history

Each node row includes a compact **View details** action. The dedicated node page has two tabs:

- **Overview** reads the current node status and groups available system, platform, hardware, memory, root-storage, network/disk-rate, source, and thermal fields.
- **History** reads Proxmox node RRD data and charts utilization, network I/O, and disk I/O. Thermal history is shown only when Proxmox supplies real temperature samples; otherwise the section says **Not available**.

On wide screens, Overview uses a balanced four-card first row and three-card second row. Cards in each row share equal widths and heights, including the compact unavailable Thermals state. The layout becomes two columns on tablets and one natural-height column on phones. Long platform and hardware values remain available through their text title without widening or overflowing the cards.

History supports `1h`, `6h`, `12h`, `24h`, `7d`, `30d`, and `90d`. NodeGuard maps these ranges to Proxmox's native RRD timeframes, then filters the returned UTC samples to the exact requested window:

| NodeGuard range | Proxmox timeframe |
| --- | --- |
| `1h` | `hour` |
| `6h`, `12h`, `24h` | `day` |
| `7d` | `week` |
| `30d` | `month` |
| `90d` | `year` |

Results are briefly cached per connection, node, and range. Concurrent identical requests are deduplicated, and the UI keeps the previous chart visible while another range loads. No Proxmox performance samples are written to NodeGuard's database.

Current node details come from `/nodes/{node}/status`; history comes from `/nodes/{node}/rrddata` with `cf=AVERAGE`; the cluster label, when available, comes from `/cluster/status`. Missing optional fields remain non-fatal and display **Not available** rather than a false zero.

## Synchronization and stale data

Enabled connections synchronize in the background. Synchronizations for the same connection cannot overlap. A successful run atomically replaces that connection's stored inventory.

When a synchronization fails, NodeGuard keeps the last successful snapshot and marks it stale. A connection is treated as unavailable only after the configured consecutive-failure threshold, avoiding alerts for a single transient failure.

The **Sync now** action requests an immediate refresh. Disabling a connection stops scheduled synchronization without deleting its saved inventory or credentials.

The Dashboard reserves the Proxmox summary tile from its first render. Loading, unconfigured, disabled, unavailable, stale, warning, and healthy states update inside that fixed tile, so a slow or failed Proxmox request does not reorder the summary grid or shift the rest of the Dashboard. Previously loaded inventory remains visible during background refresh.

## Alerts

The integration can create alerts for:

- Proxmox connection unavailable after repeated failures
- Proxmox node offline
- Storage unavailable
- Storage warning threshold reached
- Storage critical threshold reached

Optional updates and stopped guests do not affect the overall infrastructure health status.

## Security and credential storage

- Proxmox tokens are accepted and used only by the NodeGuard backend.
- Token secrets and custom CA material are encrypted at rest with AES-256-GCM.
- Raw token secrets are never returned to the frontend after saving.
- Authentication headers and credentials are excluded from logs and diagnostics.
- Every request uses certificate verification; insecure TLS is not supported.
- Mutating integration routes require an authenticated NodeGuard owner.
- Demo Mode is isolated from real Proxmox connections and uses fictional data only.

Set the stable integration secret in the backend environment before saving integrations. A dedicated Proxmox encryption key may override it when required by your secret-management policy:

```env
NODEGUARD_INTEGRATION_SECRET=replace_with_at_least_32_random_bytes
# Optional override:
# NODEGUARD_INTEGRATION_ENCRYPTION_KEY=replace_with_a_long_random_secret
```

Changing this key after credentials have been stored prevents NodeGuard from decrypting the saved secrets. Back up the key using the same secret-management process as the rest of the NodeGuard deployment.

## Configuration

The following backend environment variables are optional:

```env
NODEGUARD_PROXMOX_SYNC_INTERVAL_SECONDS=30
NODEGUARD_PROXMOX_FAILURE_THRESHOLD=3
NODEGUARD_PROXMOX_STORAGE_WARNING_PERCENT=80
NODEGUARD_PROXMOX_STORAGE_CRITICAL_PERCENT=90
NODEGUARD_PROXMOX_REQUEST_TIMEOUT_MS=10000
```

The sync interval defaults to 30 seconds and values below 30 seconds are clamped to that minimum. The three-failure default marks a continuously unavailable connection after approximately 90 seconds.

Warning and critical percentages must reflect the storage policy for your environment. The request timeout should remain long enough for the Proxmox cluster resource endpoint to respond under load.

## API routes

Authenticated owners use these backend routes through the NodeGuard UI:

```text
GET    /api/proxmox
GET    /api/proxmox/connections/:id/nodes/:node
GET    /api/proxmox/connections/:id/nodes/:node/history?range=1h|6h|12h|24h|7d|30d|90d
GET    /api/proxmox/connections
POST   /api/proxmox/connections/test
POST   /api/proxmox/connections
PUT    /api/proxmox/connections/:id
PATCH  /api/proxmox/connections/:id/enabled
POST   /api/proxmox/connections/:id/sync
POST   /api/proxmox/sync
DELETE /api/proxmox/connections/:id
```

Demo sessions may read fictional Proxmox data but cannot call connection-management or synchronization routes.

## Troubleshooting

### Authentication fails with HTTP 401

- Confirm **Token user** contains the realm (for example `nodeguard@pve`) and **Token ID** contains only the token name (for example `nodeguard`).
- Confirm the token secret was copied exactly.
- Confirm the token has not been removed or expired.
- Confirm the user and token have `PVEAuditor` access at the required path.

### TLS or certificate validation fails

- Use the Proxmox API hostname that appears in its certificate.
- Paste the issuing CA certificate in PEM format into the custom CA field.
- Include intermediate CA certificates when required.
- Do not replace the endpoint with plain HTTP and do not disable verification.

### Connection times out

- Confirm the NodeGuard backend host can route to TCP port 8006 on Proxmox.
- Check firewalls and reverse proxies between NodeGuard and Proxmox.
- Confirm Proxmox's API service is healthy.
- Increase `NODEGUARD_PROXMOX_REQUEST_TIMEOUT_MS` only when the network and API are known to be slow.

### Data is marked stale

NodeGuard is showing the last successful snapshot because recent synchronization attempts failed. Open the connection in Settings, test it, and review the backend logs for the sanitized failure reason.

## V0.1 limitations

- Read-only inventory and health monitoring only
- No VM or container lifecycle actions
- No console, shell, migration, backup, or update controls
- Node performance history is read on demand from Proxmox RRD; NodeGuard does not persist a separate Proxmox time-series database
- Proxmox node RRD normally does not expose thermal samples, so thermals may remain **Not available**
- No VM or LXC detail/history pages and no Proxmox task-history collection
- No automatic certificate enrollment
