# node-s3

Modern S3 backup, restore, retention, and management CLI & TypeScript library built on **Node.js 26** and **AWS SDK v3**. Works out of the box with **AWS S3**, **Cloudflare R2**, **Backblaze B2**, **MinIO**, and any S3-compatible object storage.

[![CI](https://img.shields.io/github/actions/workflow/status/d0whc3r/node-s3/nodejs.yml?branch=master&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/d0whc3r/node-s3/actions/workflows/nodejs.yml)
[![npm version](https://img.shields.io/npm/v/@d0whc3r/node-s3?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@d0whc3r/node-s3)
[![npm downloads](https://img.shields.io/npm/dm/@d0whc3r/node-s3?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@d0whc3r/node-s3)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D26-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)

---

## Quick Start

1. **Set your credentials** (standard AWS env vars or a `.env` file):

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="eu-central-1"
export BUCKET="my-backups"
```

2. **Run your first backup** (compresses `./data`, uploads to `daily/`, creates the bucket if missing, and replaces any existing file):

```bash
npx @d0whc3r/node-s3 -b ./data -z data-backup.zip -f daily -c -r
```

3. **Preview retention cleanup safely** before deleting anything (`--dry-run` + `--keep-last`):

```bash
npx @d0whc3r/node-s3 -d daily=30d --keep-last 5 --dry-run
```

---

## Features

- **Flexible Backups**: Upload single files, directories, globs, or piped `--stdin` streams with optional ZIP compression, `--exclude` filters, bounded parallel uploads, and progress reporting.
- **Download & Restore**: Stream remote objects directly to disk (`--download <key> -o <path>`) with optional transparent decryption.
- **Client-Side Encryption (`--encrypt`)**: Streaming **AES-256-GCM** encryption using Node.js built-in `node:crypto` (`scrypt` key derivation, random salt & IV, authentication tag). Your storage provider never sees plaintext data.
- **Safe Retention Cleanup (`-d`)**: Delete objects older than a duration (`s`, `m`, `h`, `d`, `w`, `M`, `y`) with `--keep-last <N>` protection (always keeps the newest N backups) and `--dry-run` preview.
- **Cloud-Native S3 Support**: Full support for `--storage-class`, `--sse` / `--kms-key-id`, `--acl`, `--expire`, `--region`, `--endpoint`, and standard `AWS_*` variables.
- **MySQL Backups (`-m`)**: Dump a MySQL database, optionally zip/encrypt it, upload to S3, and automatically delete temporary files (`0600` permissions in a private `0700` temp directory).
- **Standalone Binaries**: Native Node.js 26 Single Executable Applications (SEA) for Linux, macOS, and Windows—no Node.js installation needed on target servers.

---

## Installation

### Option 1: Run on demand or install globally (requires Node.js >= 26)

```bash
# Run without installing
npx @d0whc3r/node-s3 --help

# Install globally
npm install -g @d0whc3r/node-s3

# Add to a Node.js / TypeScript project
pnpm add @d0whc3r/node-s3
```

### Option 2: Standalone Binary (Node.js 26 SEA)

Build a self-contained binary for your OS (or download prebuilt artifacts from GitHub Actions):

```bash
pnpm install
pnpm build:sea
./node-s3 --version
./node-s3 --help
```

### Option 3: Docker

```bash
docker build -t node-s3 .
docker run --rm \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e BUCKET \
  -v "$(pwd)/data:/data:ro" \
  node-s3 -b /data -z backup.zip -f daily
```

---

## Configuration & Environment Variables

Configuration follows a clear precedence order: **CLI flags / constructor options > `AWS_*` env vars > legacy env vars > defaults**.

| Variable                                                                     | Legacy Alias | Description                              | Default          |
| ---------------------------------------------------------------------------- | ------------ | ---------------------------------------- | ---------------- |
| `AWS_ENDPOINT_URL`                                                           | `ENDPOINT`   | Custom S3-compatible endpoint URL        | AWS S3 default   |
| `AWS_ACCESS_KEY_ID`                                                          | `ACCESS_KEY` | Access key ID                            | —                |
| `AWS_SECRET_ACCESS_KEY`                                                      | `SECRET_KEY` | Secret access key                        | —                |
| `AWS_SESSION_TOKEN`                                                          | —            | Temporary STS session token              | —                |
| `AWS_REGION`                                                                 | —            | S3 region (`auto` for Cloudflare R2)     | `us-east-1`      |
| `BUCKET`                                                                     | —            | Default target bucket name               | —                |
| `MAX_RETRIES`                                                                | —            | Retry attempts on transient S3 errors    | `3`              |
| `FORCE_PATH_STYLE`                                                           | —            | Path-style URLs (`true`/`false`)         | `true`           |
| `SSL_ENABLED`                                                                | —            | Enforce TLS (`true`/`false`)             | `true`           |
| `BACKUP_ENCRYPTION_KEY`                                                      | —            | Passphrase for `--encrypt` (AES-256-GCM) | —                |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | —            | MySQL connection for `--mysql`           | `localhost:3306` |

See [example.env](./example.env) for a ready-to-copy template.

---

## Provider Setup Examples

### AWS S3

```bash
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="eu-central-1"

node-s3 --bucket my-backups -b ./data -z backup.zip --storage-class STANDARD_IA --sse AES256
```

### Cloudflare R2

```bash
export AWS_ENDPOINT_URL="https://<account-id>.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="auto"

node-s3 --bucket my-r2-bucket -l
```

### Backblaze B2

```bash
export AWS_ENDPOINT_URL="https://s3.us-west-004.backblazeb2.com"
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-west-004"

node-s3 --bucket my-b2-bucket -b ./archive.tar.gz -f daily
```

### MinIO (Local / Self-Hosted)

```bash
export ENDPOINT="http://localhost:9000"
export ACCESS_KEY="minioadmin"
export SECRET_KEY="minioadmin"
export SSL_ENABLED="false"

node-s3 --bucket local-backups -c -b "./files/*"
```

---

## CLI Reference

### Options

| Flag                    | Alias | Description                                                                |
| ----------------------- | ----- | -------------------------------------------------------------------------- |
| `--bucket <name>`       | —     | Target S3 bucket (overrides `$BUCKET`)                                     |
| `--endpoint <url>`      | `-e`  | Custom S3 endpoint URL                                                     |
| `--region <region>`     | —     | S3 region (overrides `$AWS_REGION`)                                        |
| `--list`                | `-l`  | List objects in bucket (filterable with `-f`)                              |
| `--backup <file*>`      | `-b`  | Upload files, directories, or globs (repeatable)                           |
| `--download <key>`      | —     | Download a remote object key                                               |
| `--output <path>`       | `-o`  | Local destination path for `--download`                                    |
| `--folder <prefix>`     | `-f`  | Remote folder prefix for upload, list, or delete                           |
| `--zip [filename.zip]`  | `-z`  | Compress backup files into a ZIP archive                                   |
| `--exclude <glob>`      | —     | Exclude files matching glob pattern (repeatable)                           |
| `--replace`             | `-r`  | Overwrite remote object if it already exists                               |
| `--create`              | `-c`  | Create destination bucket if it does not exist                             |
| `--delete <rule>`       | `-d`  | Delete files older than duration (`folder=7d` or `7d`, repeatable)         |
| `--keep-last <N>`       | —     | Always preserve the N newest matching files when deleting                  |
| `--dry-run`             | —     | Preview uploads/deletions without modifying S3                             |
| `--encrypt`             | —     | Encrypt on upload / decrypt on download using `$BACKUP_ENCRYPTION_KEY`     |
| `--stdin`               | —     | Read upload payload from standard input (requires `--name`)                |
| `--name <filename>`     | —     | Object filename when using `--stdin`                                       |
| `--mysql`               | `-m`  | Create and upload a MySQL dump using `$MYSQL_*` env vars                   |
| `--storage-class <cls>` | —     | S3 storage class (e.g. `STANDARD_IA`, `GLACIER_IR`, `INTELLIGENT_TIERING`) |
| `--sse <algo>`          | —     | Server-side encryption (`AES256` or `aws:kms`)                             |
| `--kms-key-id <id>`     | —     | KMS Key ID when using `--sse aws:kms`                                      |
| `--acl <acl>`           | —     | Canned ACL (e.g. `private`, `public-read`)                                 |
| `--expire <duration>`   | —     | Set object `Expires` header relative to now (e.g. `30d`, `12h`)            |
| `--json`                | —     | Output machine-readable JSON (ideal for CI/scripts)                        |
| `--quiet`               | `-q`  | Suppress informational logs                                                |
| `--version`             | `-v`  | Print CLI version                                                          |
| `--help`                | `-h`  | Print usage guide                                                          |

### Common Recipes

```bash
# 1. List files inside a folder as JSON
node-s3 --bucket my-bucket -l -f daily --json

# 2. Backup a folder with exclusions, ZIP, and client-side AES-256-GCM encryption
BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  node-s3 --bucket my-bucket -b "src/*" --exclude "*.spec.ts" -z src.zip -f backups --encrypt -c -r

# 3. Restore and decrypt a backup
BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  node-s3 --bucket my-bucket --download backups/src.zip -o ./restored.zip --encrypt

# 4. Stream a PostgreSQL dump directly to S3 without touching disk
pg_dump mydb | node-s3 --bucket my-bucket --stdin --name mydb.sql -f postgres --encrypt

# 5. Nightly cron job: backup + prune older than 14 days while keeping at least 5 backups
node-s3 --bucket my-bucket -m -z -f mysql --encrypt && \
  node-s3 --bucket my-bucket -d mysql=14d --keep-last 5
```

### Valid Duration Units (`-d` / `--expire`)

| Unit | Meaning | Example |
| ---- | ------- | ------- |
| `s`  | Seconds | `30s`   |
| `m`  | Minutes | `15m`   |
| `h`  | Hours   | `24h`   |
| `d`  | Days    | `7d`    |
| `w`  | Weeks   | `2w`    |
| `M`  | Months  | `1M`    |
| `y`  | Years   | `1y`    |

> Invalid units are rejected immediately with a non-zero exit code to prevent accidental deletions.

### Exit Codes

- `0`: Command succeeded (or `--help` / `--version`).
- `1`: Runtime or S3 error (authentication, network, missing file, etc.).
- `2`: Invalid CLI arguments or missing required flags.

---

## Library API (TypeScript / ESM & CJS)

### ESM / TypeScript

```ts
import { S3Wrapper } from '@d0whc3r/node-s3';

const s3 = new S3Wrapper({
  endpoint: 'https://s3.eu-central-1.amazonaws.com',
  region: 'eu-central-1',
  bucket: 'my-backups',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

try {
  // Upload with progress callback, client-side encryption, and S3 storage class
  await s3.uploadFile('./dump.sql', 'daily', {
    replace: true,
    storageClass: 'STANDARD_IA',
    serverSideEncryption: 'AES256',
    encryptKey: process.env.BACKUP_ENCRYPTION_KEY,
    onProgress: ({ loaded, total, key }) => {
      console.log(`${key}: ${loaded}/${total ?? '?'} bytes`);
    }
  });

  // Download & decrypt
  await s3.downloadFile('daily/dump.sql', './restored.sql', {
    decryptKey: process.env.BACKUP_ENCRYPTION_KEY
  });

  // Retention cleanup keeping at least the 5 newest backups
  await s3.cleanOlder('30d', 'daily', undefined, { keepLast: 5, dryRun: false });
} finally {
  // Release underlying HTTP keep-alive sockets
  s3.destroy();
}
```

### CommonJS

```js
const { S3Wrapper } = require('@d0whc3r/node-s3');

const s3 = new S3Wrapper({ bucket: 'my-backups' });
const files = await s3.getFiles(undefined, 'daily');
console.log(files);
s3.destroy();
```

---

## Development

```bash
pnpm install
pnpm lint           # Oxlint
pnpm format:check   # Oxfmt
pnpm typecheck      # TypeScript 7
pnpm test:unit      # Fast offline unit tests (Vitest + aws-sdk-client-mock)
pnpm test:coverage  # Coverage report
pnpm build          # Library (CJS/ESM/.d.ts) + CLI + Node 26 SEA binary
```

## Alternatives

Go implementation with a similar interface: [go-s3](https://github.com/d0whc3r/go-s3).
