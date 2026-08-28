# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability.
Report it privately to the maintainers at `security@ojiepermana.com` with the
subject `MyAdmin security report`. Include the affected version, a concise
description, reproduction steps or a proof of concept, and the impact. Remove
credentials, personal data, and production connection details before sending
the report.

If email is unavailable, use a private GitHub Security Advisory for the
`ojiepermana/myadmin` repository. Please do not publish an exploit before the
maintainers have had a reasonable opportunity to investigate and release a
fix.

## Response expectations

We will acknowledge a report within five business days, investigate it with
the reporter, and provide a remediation or status update when practical. The
timeline can vary with severity and the affected dependency. We credit
responsible reporters in the release notes unless they request anonymity.

## Supported versions

The latest tagged release is the supported version. Security fixes may also be
backported to the preceding release when the change is small and the release
is still in active use.

## Security boundaries

Treat the data directory, `config/master.key`, backup artifacts, CI signing
secrets, and container volumes as sensitive. Verify release checksums before
execution. Release signing is optional in V1 and the release notes explicitly
state when macOS or Windows artifacts are unsigned. Never send key material or
database credentials in issue reports, CLI arguments, logs, or committed files.
