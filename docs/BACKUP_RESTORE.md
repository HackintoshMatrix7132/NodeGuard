# NodeGuard SQLite backup and restore

NodeGuard stores its persistent state in one SQLite database. The Compose deployment uses
`DATABASE_URL=file:/data/nodeguard.sqlite` on the `nodeguard-data` volume. Backups contain
configuration, password and credential hashes, sessions, encrypted integration credentials,
monitoring history, and Agent inventories. Treat every backup as sensitive data, store the
`NODEGUARD_INTEGRATION_SECRET` separately, and never commit either one.

The maintenance CLI is built into the production image at
`apps/api/dist/cli/databaseMaintenance.js`. It provides three commands:

- `backup` uses SQLite's online backup API, so it can safely capture a running WAL database.
- `verify` runs full SQLite integrity and foreign-key checks and confirms core NodeGuard tables.
- `restore` is offline-only, requires the exact confirmation `RESTORE`, and preserves a verified
  pre-restore copy before replacing anything.

All newly created database files use mode `0600`. The CLI refuses in-memory databases,
symbolic-link targets, invalid NodeGuard databases, and existing backup/recovery output paths.

## Create and verify a Docker Compose backup

Choose a unique, dated filename. The command refuses to overwrite an existing backup.

```bash
mkdir -p backups
chmod 700 backups

docker compose run --rm --no-deps \
  -v "$PWD/backups:/backup" \
  nodeguard npm run db:backup --workspace apps/api -- \
  --database file:/data/nodeguard.sqlite \
  --output /backup/nodeguard-2026-07-22.sqlite
```

This can run while NodeGuard is serving traffic. It writes through a temporary file, verifies the
completed snapshot, syncs it to disk, and only then publishes the requested filename.

Verify the saved copy independently:

```bash
docker compose run --rm --no-deps \
  -v "$PWD/backups:/backup:ro" \
  nodeguard npm run db:verify --workspace apps/api -- \
  --source /backup/nodeguard-2026-07-22.sqlite
```

Copy the backup to storage outside the NodeGuard host or Docker volume. A backup on the same disk
does not protect against disk or host loss. Keep multiple dated generations and periodically test
the restore procedure below on a non-production NodeGuard instance.

## Restore a verified backup

Restore changes the live database and must not run beside the API. `docker compose stop` sends the
API its normal graceful-shutdown signal; the service's 30-second stop grace period allows HTTP
traffic and schedulers to drain before SQLite closes.

1. Verify the source backup using the command above.
2. Stop NodeGuard and confirm it is stopped.

   ```bash
   docker compose stop nodeguard
   docker compose ps
   ```

3. Run the restore with the exact confirmation value. Mount the host backup directory read-only.

   ```bash
   docker compose run --rm --no-deps \
     -v "$PWD/backups:/backup:ro" \
     nodeguard npm run db:restore --workspace apps/api -- \
     --source /backup/nodeguard-2026-07-22.sqlite \
     --database file:/data/nodeguard.sqlite \
     --confirm RESTORE
   ```

   Before replacement, the CLI verifies the source, creates a consistent copy of the current
   database beside it under `/data/nodeguard.sqlite.pre-restore-<timestamp>`, verifies that copy,
   and reports its exact path. It then removes stale `-wal`, `-shm`, and `-journal` sidecars and
   atomically installs the verified source. If the API still has the database open, restore aborts.

4. Verify the restored database while the API remains stopped.

   ```bash
   docker compose run --rm --no-deps \
     nodeguard npm run db:verify --workspace apps/api -- \
     --source /data/nodeguard.sqlite
   ```

5. Start NodeGuard and check startup, migrations, and health before relying on it.

   ```bash
   docker compose start nodeguard
   docker compose logs --tail=100 nodeguard
   curl -fsS http://127.0.0.1:3000/health
   ```

Do not start NodeGuard if restore or verification reports an error. The error identifies whether
the target was untouched or whether a pre-restore recovery copy was already preserved.

### Select the recovery-copy path

Use `--recovery-output` when an explicit unique path is preferable:

```bash
docker compose run --rm --no-deps \
  -v "$PWD/backups:/backup:ro" \
  nodeguard npm run db:restore --workspace apps/api -- \
  --source /backup/nodeguard-2026-07-22.sqlite \
  --database file:/data/nodeguard.sqlite \
  --recovery-output /data/nodeguard-before-restore-2026-07-22.sqlite \
  --confirm RESTORE
```

Copy the reported recovery file off the volume before deleting it:

```bash
docker compose cp \
  nodeguard:/data/nodeguard-before-restore-2026-07-22.sqlite \
  ./backups/
```

To roll back the restore, stop NodeGuard again and run the same verified restore workflow with that
recovery file as `--source`. A new pre-restore copy is created, so the intervening state remains
recoverable.

## Recover onto an empty replacement volume

The restore command normally requires an existing target so it can preserve a pre-restore copy. On
a genuinely empty replacement volume, first recreate a clean NodeGuard database, then stop it and
restore:

1. Preserve and configure the original `NODEGUARD_INTEGRATION_SECRET`; encrypted credentials cannot
   be decrypted with a replacement secret.
2. Build and start NodeGuard once against the empty volume, wait for `/health`, then stop it.
3. Run the verified restore command above. The newly initialized database becomes the automatic
   pre-restore recovery copy.
4. Verify, start, inspect logs, sign in, and check representative dashboard data.

## Local, non-Docker use

Build the API once, then pass the configured database path explicitly:

```bash
npm run build --workspace apps/api
mkdir -p "$PWD/backups"
chmod 700 "$PWD/backups"

npm run db:backup --workspace apps/api -- \
  --database file:data/nodeguard.sqlite \
  --output "$PWD/backups/nodeguard-2026-07-22.sqlite"

npm run db:verify --workspace apps/api -- \
  --source "$PWD/backups/nodeguard-2026-07-22.sqlite"
```

Stop the local API before `db:restore`; the same confirmation, verification, recovery-copy, and
sidecar rules apply. Run restore from the repository root so `$PWD` identifies the ignored root
backup directory:

```bash
npm run db:restore --workspace apps/api -- \
  --source "$PWD/backups/nodeguard-2026-07-22.sqlite" \
  --database file:data/nodeguard.sqlite \
  --confirm RESTORE
```

## Recovery validation checklist

- Backup and verification commands both report `"status": "ok"`.
- The backup is copied off the NodeGuard volume and retains mode `0600` or equivalent protection.
- The integration secret is backed up separately through the deployment's secret-management path.
- Restore runs only after a graceful API stop.
- The reported pre-restore recovery copy exists and independently verifies.
- `/health`, sign-in, dashboard data, Agents, monitors, alerts, updates, and Proxmox settings are
  checked after recovery.
- A periodic non-production restore confirms the backup is operational, not merely present.
