# Troubleshooting

Start with safe diagnostics:

```sh
myadmin doctor --json --data-dir PATH
myadmin migrate --status --data-dir PATH
```

The doctor output reports data directory access, required subdirectories,
SQLite health and migration status, key file permissions, configuration source
names, web assets, and native backup tools. It redacts credentials and key
material.

For systemd, inspect recent logs with:

```sh
sudo journalctl --unit myadmin --since today
sudo systemctl status myadmin
```

For launchd, inspect `logs/launchd.out.log` and `logs/launchd.err.log` in the
configured data directory, then run `launchctl print gui/$(id -u)/com.myadmin.server`.
For Docker, inspect `docker logs myadmin` and confirm the `/data` volume is
mounted read and write by uid `65532`.

Common causes are a missing or unwritable data directory, a key file with
loose permissions, a pending migration, a port already in use, or absent native
backup clients. Do not paste logs containing connection details into a public
issue. Redact hostnames, usernames, tokens, and database names first.

For MySQL, `sslmode=disable` is supported as an explicit compatibility mode.
Bun SQL may need public key retrieval for accounts using
`caching_sha2_password`, so this mode should only be used on a trusted local
network. Use `require`, `verify-ca`, or `verify-full` with the intended CA for
remote connections. A TLS failure must not silently downgrade to this mode.

Known V1 limits include no native MSI, PKG, DEB, or RPM installers, no
automatic update service, and no scheduled backup. macOS and Windows release
artifacts can be unsigned when project signing secrets are not configured.
