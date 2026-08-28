# MyAdmin operator guide

This guide covers the supported V1 distribution paths and the data that must
be protected by an operator.

- [Installation and services](installation.md)
- [Configuration](configuration.md)
- [Data directory and key protection](data-directory.md)
- [Backup, restore, and recovery](backup-recovery.md)
- [Upgrades](upgrade.md)
- [Troubleshooting](troubleshooting.md)

The default server bind address is `127.0.0.1`. Exposing MyAdmin beyond the
local machine is an operator decision. Use TLS and an access controlled reverse
proxy when remote access is required. Read [SECURITY.md](../../SECURITY.md)
before operating a shared instance.
