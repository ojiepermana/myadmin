# MyAdmin service files

These files are service templates, not native installers. The V1 native
installer formats are deferred to V2.

## Linux systemd

Create a dedicated service account and install the binary first:

```sh
sudo useradd --system --home-dir /var/lib/myadmin --shell /usr/sbin/nologin myadmin
sudo install --owner=root --group=root --mode=0755 myadmin /usr/local/bin/myadmin
sudo install --owner=root --group=root --mode=0644 \
  distribution/service/myadmin.service /etc/systemd/system/myadmin.service
sudo systemctl daemon-reload
sudo systemctl enable --now myadmin.service
sudo systemctl status myadmin.service
```

`StateDirectory`, `LogsDirectory`, `ProtectSystem`, `ProtectHome`, a private
temporary directory, a restrictive umask, and `NoNewPrivileges` limit the
service. The default bind address is `127.0.0.1`; place a trusted reverse proxy
in front of it when remote access is needed.

Install `postgresql-client` and `default-mysql-client` separately, or use the
Docker `-tools` image, when backup and restore requires native clients.

## macOS launchd

Copy the binary to `/usr/local/bin/myadmin`, create the data directory, replace
every `__MYADMIN_DATA_DIR__` placeholder with the absolute path, then load the
per user agent:

```sh
mkdir --parents "$HOME/Library/Application Support/myadmin/logs"
sed "s#__MYADMIN_DATA_DIR__#$HOME/Library/Application Support/myadmin#g" \
  distribution/service/com.myadmin.server.plist > "$HOME/Library/LaunchAgents/com.myadmin.server.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.myadmin.server.plist"
launchctl print "gui/$(id -u)/com.myadmin.server"
```

The agent runs as the logged in user, uses a private data path and umask, keeps
the process alive, and lowers its I/O priority. launchd does not provide the
same filesystem sandbox controls as systemd, so keep the data directory and
plist user private and bind the server to localhost unless a trusted proxy is
in use.
