# Proxmox VE integration

NodeGuard's Proxmox VE integration is a read-only inventory and health source. It discovers nodes, QEMU virtual machines, LXC containers, and storage through the Proxmox API, then presents that data in the Proxmox page, Dashboard, and Alerts.

NodeGuard does not start, stop, restart, migrate, back up, update, or otherwise modify Proxmox resources.

## Requirements

- Proxmox VE reachable from the NodeGuard backend over HTTPS
- A dedicated Proxmox API token
- At least the built-in `PVEAuditor` role at `/`
- The Proxmox certificate authority when the endpoint uses a private or self-signed certificate
- A configured `NODEGUARD_INTEGRATION_ENCRYPTION_KEY` on the NodeGuard backend

## Create a read-only API token

Create a dedicated Proxmox user and API token. The exact commands may vary with your Proxmox version and access policy; this is a minimal example:

```bash
pveum user add nodeguard@pve --comment "NodeGuard read-only monitoring"
pveum acl modify / --users nodeguard@pve --roles PVEAuditor
pveum user token add nodeguard@pve nodeguard --privsep 1
```

Record the token secret when Proxmox displays it. Proxmox shows the secret only once.

Use these values in NodeGuard:

```text
Token ID: nodeguard@pve!nodeguard
Token secret: the value returned by Proxmox
```

Keep privilege separation enabled. Do not grant NodeGuard administrative roles.

## Add a connection

1. Open **Settings** in NodeGuard.
2. Find **Integrations** and choose **Add Proxmox connection**.
3. Enter a display name and the Proxmox endpoint, for example `https://pve.example.net:8006`.
4. Enter the token ID and token secret.
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

## Synchronization and stale data

Enabled connections synchronize in the background. Synchronizations for the same connection cannot overlap. A successful run atomically replaces that connection's stored inventory.

When a synchronization fails, NodeGuard keeps the last successful snapshot and marks it stale. A connection is treated as unavailable only after the configured consecutive-failure threshold, avoiding alerts for a single transient failure.

The **Sync now** action requests an immediate refresh. Disabling a connection stops scheduled synchronization without deleting its saved inventory or credentials.

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

Set a stable encryption key in the backend environment before saving integrations:

```env
NODEGUARD_INTEGRATION_ENCRYPTION_KEY=replace_with_a_long_random_secret
```

Changing this key after credentials have been stored prevents NodeGuard from decrypting the saved secrets. Back up the key using the same secret-management process as the rest of the NodeGuard deployment.

## Configuration

The following backend environment variables are optional:

```env
NODEGUARD_PROXMOX_SYNC_INTERVAL_SECONDS=60
NODEGUARD_PROXMOX_FAILURE_THRESHOLD=3
NODEGUARD_PROXMOX_STORAGE_WARNING_PERCENT=80
NODEGUARD_PROXMOX_STORAGE_CRITICAL_PERCENT=90
NODEGUARD_PROXMOX_REQUEST_TIMEOUT_MS=10000
```

Warning and critical percentages must reflect the storage policy for your environment. The request timeout should remain long enough for the Proxmox cluster resource endpoint to respond under load.

## API routes

Authenticated owners use these backend routes through the NodeGuard UI:

```text
GET    /api/proxmox
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

- Confirm the token ID includes both the realm and token name, such as `nodeguard@pve!nodeguard`.
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
- No task-history or performance-series collection from Proxmox
- No automatic certificate enrollment

