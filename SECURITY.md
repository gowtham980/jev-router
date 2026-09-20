# Security policy

## Reporting a vulnerability

Please use GitHub's private **Report a vulnerability** flow for this repository.
Do not include credentials, private prompts, session transcripts or production
configuration in a public issue.

## Supported version

Security fixes target the latest tagged release. Jev Router v0.4.3 is tested with
OpenClaw 2026.9.5.

## Security boundaries

Jev Router never broadens OpenClaw model policy or provider authorization. It
sends a bounded, best-effort-redacted prompt excerpt to the configured Jev service
for classification. See [PRIVACY.md](PRIVACY.md) for the complete data-handling
description.
