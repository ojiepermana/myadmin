# MyAdmin container images

The release workflow publishes two multi architecture images to GHCR:

```text
ghcr.io/ojiepermana/myadmin:<version>
ghcr.io/ojiepermana/myadmin:<version>-tools
```

Both images run as uid and gid `65532`, expose no port by themselves, and use
`/data` for the internal SQLite database, encrypted credentials, logs, backups,
and temporary files. The operator chooses whether and how to expose the server:

```sh
docker run --detach --name myadmin \
  --publish 127.0.0.1:8080:8080 \
  --volume myadmin-data:/data \
  ghcr.io/ojiepermana/myadmin:<version>
```

The `-tools` image also contains `pg_dump`, `pg_restore`, `psql`, `mysqldump`,
and `mysql`. Use it when the backup and restore features need native clients.
The image still does not contain database credentials. Supply configuration
through environment variables or a mounted config file, and keep `/data` on a
protected volume.
