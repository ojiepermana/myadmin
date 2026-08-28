# Data directory and key protection

MyAdmin stores data in the platform default unless `--data-dir` or
`MYADMIN_DATA_DIR` overrides it:

| Platform | Default                                 |
| -------- | --------------------------------------- |
| Linux    | `~/.local/share/myadmin`                |
| macOS    | `~/Library/Application Support/myadmin` |
| Windows  | `%APPDATA%\myadmin`                     |

The directory contains:

| Path                                  | Contents                                              |
| ------------------------------------- | ----------------------------------------------------- |
| `myadmin.db`                          | Internal SQLite database                              |
| `myadmin.db-wal` and `myadmin.db-shm` | SQLite write ahead log and shared memory while active |
| `config/config.toml`                  | Optional non secret configuration                     |
| `config/master.key`                   | Generated 32 byte credential encryption key           |
| `backups/`                            | Database backup artifacts and manifests               |
| `restore-uploads/`                    | Temporary restore uploads                             |
| `logs/`                               | Service and diagnostic logs                           |
| `temp/`                               | Temporary files                                       |

Protect the whole directory. The key file is created with mode `0600` on Unix
and must be readable only by the service account. A group or world readable key
file makes boot and doctor fail. Losing the key file makes encrypted connection
credentials unrecoverable, even if the SQLite file remains available.

To separate the key from the data directory, set `MYADMIN_KEY_FILE` to a
protected path, or provide `MYADMIN_MASTER_KEY` through a secret manager. Keep
the same key during upgrades and restores. The key value is never accepted as
a CLI argument and is redacted from diagnostics.
