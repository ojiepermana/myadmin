# Configuration

Configuration sources have this priority:

1. CLI flags
2. `MYADMIN_*` environment variables
3. `<data-dir>/config/config.toml`
4. built in defaults

The following registry keys are supported. Environment names are the source of
truth for container and service deployments.

| Key                            | Environment                                    | Default          |
| ------------------------------ | ---------------------------------------------- | ---------------- |
| `server.host`                  | `MYADMIN_SERVER_HOST` or legacy `MYADMIN_HOST` | `127.0.0.1`      |
| `server.port`                  | `MYADMIN_SERVER_PORT` or legacy `MYADMIN_PORT` | `8080`           |
| `dataDir`                      | `MYADMIN_DATA_DIR`                             | platform default |
| `session.idleTimeoutMinutes`   | `MYADMIN_SESSION_IDLE_TIMEOUT_MINUTES`         | `720`            |
| `session.absoluteTimeoutHours` | `MYADMIN_SESSION_ABSOLUTE_TIMEOUT_HOURS`       | `168`            |
| `provider.idleTimeoutMinutes`  | `MYADMIN_PROVIDER_IDLE_TIMEOUT_MINUTES`        | `30`             |
| `security.secureCookies`       | `MYADMIN_SECURITY_SECURE_COOKIES`              | `false`          |
| `log.level`                    | `MYADMIN_LOG_LEVEL`                            | `info`           |
| `limits.uploadMaxBytes`        | `MYADMIN_LIMITS_UPLOAD_MAX_BYTES`              | `536870912`      |
| `limits.resultMaxRows`         | `MYADMIN_LIMITS_RESULT_MAX_ROWS`               | `1000`           |
| `history.maxEntriesPerUser`    | `MYADMIN_HISTORY_MAX_ENTRIES_PER_USER`         | `1000`           |
| `tools.pgDumpPath`             | `MYADMIN_TOOLS_PG_DUMP_PATH`                   | PATH lookup      |
| `tools.pgRestorePath`          | `MYADMIN_TOOLS_PG_RESTORE_PATH`                | PATH lookup      |
| `tools.psqlPath`               | `MYADMIN_TOOLS_PSQL_PATH`                      | PATH lookup      |
| `tools.mysqldumpPath`          | `MYADMIN_TOOLS_MYSQLDUMP_PATH`                 | PATH lookup      |
| `tools.mysqlPath`              | `MYADMIN_TOOLS_MYSQL_PATH`                     | PATH lookup      |

Example config file:

```toml
[server]
host = "127.0.0.1"
port = 8080

[security]
secureCookies = true

[log]
level = "info"
```

`MYADMIN_MASTER_KEY` and `MYADMIN_KEY_FILE` are key provider inputs, not
ordinary config registry values. Prefer the generated key file. Use
`MYADMIN_MASTER_KEY` only when an external secret manager supplies a 32 byte
base64 or hexadecimal key. Never place either key in a committed file or a
process argument.

After changing configuration, run `myadmin doctor --json --data-dir PATH` and
inspect the reported source names and redacted values.
