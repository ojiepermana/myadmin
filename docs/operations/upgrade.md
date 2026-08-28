# Upgrades

1. Download the new platform archive from GitHub Releases.
2. Verify it with `checksums.txt`.
3. Stop the service or container.
4. Replace the binary, preserving its owner and executable permission.
5. Start MyAdmin again. Startup applies pending internal SQLite migrations.
6. Run `myadmin migrate --status --data-dir PATH` and then
   `myadmin doctor --data-dir PATH`.

For a service deployment, `systemctl restart myadmin` or unload and bootstrap
the launchd agent after replacing the binary. For Docker, pull the exact
version tag and recreate the container with the existing volume.

Do not remove `myadmin.db`, `config/master.key`, or the `backups/` directory
during an upgrade. Take an internal data backup first. If the new binary does
not start, preserve its logs and restore the prior binary while keeping the
data directory unchanged. A migration that has already completed may require
the matching newer binary; restore the complete internal backup when a rollback
must also reverse data changes.
