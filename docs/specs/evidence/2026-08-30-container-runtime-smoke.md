# Evidence 2026-08-30 — Local container runtime smoke

## Command

```text
docker run --detach --rm --name myadmin-local-clean-smoke \
  -e MYADMIN_MASTER_KEY=<synthetic-master-key> \
  -e MYADMIN_PORT=8080 -p 127.0.0.1:18080:8080 \
  myadmin:local-runtime-arm64
curl http://127.0.0.1:18080/health
docker exec myadmin-local-clean-smoke id
docker exec myadmin-local-clean-smoke stat -c '%a %u:%g' /data
```

## Result

```text
Docker Engine 29.7.2 linux/arm64
HTTP 200: {"status":"ok","version":"0.1.0"}
uid=65532(myadmin) gid=65532(myadmin) groups=65532(myadmin)
/data: 750 65532:65532
```

- `SMOKE-0055-AC4`: the locally built ARM64 runtime image started, served health successfully, ran as the declared non-root UID/GID, and exposed the protected `/data` volume with the expected ownership and mode.

The disposable container was removed after the check. This is local-built
image evidence only; it does not prove GHCR publication, release-manifest
integrity, or clean-platform installation from a published artifact.
