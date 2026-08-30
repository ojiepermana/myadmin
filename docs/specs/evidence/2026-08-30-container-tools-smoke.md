# Evidence 2026-08-30 — Local tools container smoke

## Command

```text
docker run --rm --entrypoint /bin/sh myadmin:local-tools -c \
  'id; stat -c "%a %u:%g" /data; command -v pg_dump; command -v pg_restore; \
   command -v psql; command -v mysqldump; command -v mysql'
```

## Result

```text
image: linux/amd64 (run locally on the ARM64 Docker host)
uid=65532(myadmin) gid=65532(myadmin) groups=65532(myadmin)
/data: 750 65532:65532
/usr/bin/pg_dump
/usr/bin/pg_restore
/usr/bin/psql
/usr/bin/mysqldump
/usr/bin/mysql
```

- `SMOKE-0055-AC4`: the local tools image retained the non-root runtime
  identity, protected `/data` ownership, and all required PostgreSQL/MySQL
  native client executables.

This is local image evidence only; it does not prove publication or a clean
platform installation from a release artifact.
