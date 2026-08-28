# MyAdmin

MyAdmin is a database administration application built as one Bun product with an Angular web application, an Elysia server, and a CLI.

## Requirements

Use Bun 1.4 or newer. The repository intentionally has exactly one `package.json` at its root. The `apps/*` and `packages/*` directories are source modules, not package manager workspaces.

## Install

From the repository root:

```sh
bun install
```

## Development

Start the Bun server and Angular development server together:

```sh
bun run dev
```

The server listens on `http://127.0.0.1:8080` and the web application listens on `http://127.0.0.1:4200`. Set `MYADMIN_HOST` and `MYADMIN_PORT` to change the server bind address. Set `MYADMIN_WEB_HOST` and `MYADMIN_WEB_PORT` to change the Angular development server address.

The Angular development server proxies `/api` and `/ws` to the Bun server.

## Smoke checks

Run these commands from the repository root:

```sh
bun run typecheck
bun run build:web
bun run version
bun run apps/cli/src/main.ts version
```

For the health endpoint, start the server in one terminal and query it in another:

```sh
bun run apps/server/src/main.ts
curl --fail http://127.0.0.1:8080/health
```

The response contains only the application status and the root manifest version, for example `{"status":"ok","version":"0.1.0"}`.

To check the one manifest rule without following symlinks, run:

```sh
find . -path './.git' -prune -o -path './node_modules' -prune -o -path './dist' -prune -o -path './.angular' -prune -o -path './coverage' -prune -o -name package.json -print
```

The only result should be `./package.json`.
