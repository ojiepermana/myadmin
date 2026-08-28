# Installation and services

## Binary archives

Download the archive matching the host from the [latest GitHub
Release](https://github.com/ojiepermana/myadmin/releases/latest). Verify the
archive or binary with the published `checksums.txt` before installing it.
Extract `myadmin` or `myadmin.exe` into a directory on `PATH`.

The V1 release formats are tar archives and a Windows executable. Native MSI,
PKG, DEB, and RPM installers are intentionally deferred to V2.

Run the first instance in a terminal:

```sh
myadmin serve --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080`, complete initial setup, and create the first
administrator. Use `--data-dir PATH` when the data directory should be outside
the platform default.

## Docker

The runtime and `-tools` images are multi architecture images for Linux amd64
and arm64. The `-tools` image includes PostgreSQL and MySQL native clients for
backup and restore.

```sh
docker run --detach --name myadmin \
  --publish 127.0.0.1:8080:8080 \
  --volume myadmin-data:/data \
  ghcr.io/ojiepermana/myadmin:<version>
```

Use `ghcr.io/ojiepermana/myadmin:<version>-tools` when native backup clients
are needed. Port publication is optional and is entirely controlled by the
operator. Do not mount credentials into the image command line.

## systemd on Linux

Follow [the service file guide](../../distribution/service/README.md#linux-systemd).
The unit creates a dedicated service account, stores data under
`/var/lib/myadmin`, and binds to localhost by default.

## launchd on macOS

Follow [the launchd service file guide](../../distribution/service/README.md#macos-launchd).
The plist is a per user agent. Replace its data directory placeholder before
loading it with `launchctl bootstrap`.
