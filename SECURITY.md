# Security Policy

## Supported Versions

Security fixes are applied to the latest release on the `master` branch.

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public GitHub issue.

Instead, report it privately via [GitHub Security Advisories](https://github.com/d0whc3r/node-s3/security/advisories/new) or email `d0whc3r@gmail.com` with:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof of concept.
- Any suggested fix or mitigation.

## Security Best Practices for Users

- Keep `SSL_ENABLED=true` (the default) and use `https://` endpoints in production.
- Never hardcode or commit `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`; prefer IAM roles, short-lived STS tokens, or secret managers.
- Use `--encrypt` (`BACKUP_ENCRYPTION_KEY`) for client-side AES-256-GCM encryption of sensitive backups and database dumps.
- Always preview destructive retention rules (`-d`) with `--dry-run` and protect recent backups with `--keep-last`.
