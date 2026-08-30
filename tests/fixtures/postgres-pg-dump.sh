#!/usr/bin/env bash
set -eu
args=("$@")
for index in "${!args[@]}"; do
  [[ "${args[$index]}" == '127.0.0.1' ]] && args[$index]='host.docker.internal'
done
exec docker run --rm -i -e "PGPASSWORD=${PGPASSWORD-}" -e "PGSSLMODE=${PGSSLMODE-}" postgres:18 pg_dump "${args[@]}"
