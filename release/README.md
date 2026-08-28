# MyAdmin release binaries

Each release contains one standalone Bun executable for the platform named by
the artifact. No Bun, Node.js, or Angular installation is required.

| Platform    | Executable    |
| ----------- | ------------- |
| Linux x64   | `myadmin`     |
| Linux arm64 | `myadmin`     |
| macOS x64   | `myadmin`     |
| macOS arm64 | `myadmin`     |
| Windows x64 | `myadmin.exe` |

Run `myadmin serve` to start the local server. Use `--data-dir PATH` to choose
where MyAdmin stores its internal database, encrypted credentials, logs, and
temporary files. Open the URL printed by the command, then create the initial
administrator in the setup screen.

Use `myadmin doctor --data-dir PATH` to check an installation. Use
`myadmin version` to print the release version, commit, and platform.

The accompanying `checksums.txt` file contains a SHA-256 checksum for every
downloadable release archive. Signing status is stated in the release notes.
Native installers remain deferred to V2. Service templates and container image
instructions are available in the repository operator documentation.
