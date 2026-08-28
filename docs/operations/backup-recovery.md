# Backup, restore, and recovery

## Internal MyAdmin data

The internal SQLite database contains users, connections, encrypted
credentials, workspace state, audit records, and backup metadata. Stop MyAdmin
before copying it so the WAL is checkpointed, then copy the database and its
adjacent files as one set:

```sh
myadmin migrate --status --data-dir /var/lib/myadmin
sudo systemctl stop myadmin
sudo tar --xattrs --acls -czf myadmin-internal-backup.tgz -C /var/lib myadmin
sudo systemctl start myadmin
```

Restore by stopping the service, preserving the current directory, extracting
the archive to the same parent, checking ownership and permissions, and
running `myadmin doctor --data-dir /var/lib/myadmin` before starting the
service. Do not delete the only copy of the current directory until the
restored instance has started and the administrator can log in.

For a container, stop the container and back up the `/data` volume with a
temporary helper container. Keep the volume private.

## Target database backup and restore

The Backup and Restore pages use native clients, not an internal SQL dump
implementation. PostgreSQL needs `pg_dump`, `pg_restore`, and `psql`. MySQL
needs `mysqldump` and `mysql`. The binary distribution detects clients from
`PATH` or the configured `tools.*Path` values. The Docker `-tools` image
contains these clients.

Run `myadmin doctor --data-dir PATH` before a backup. Missing clients disable
the relevant capability with an explicit reason. Backup files are written to
`backups/`, and restore can target an existing or newly created database only
after the confirmation checks. A cancelled restore can leave a partially
changed target database, so use a disposable target or restore from a known
good backup.

Keep target database backups separate from the internal MyAdmin backup. Test a
restore periodically in a disposable database.
