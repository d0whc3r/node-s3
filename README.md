# node-s3

CLI and Node.js library to back up, restore, encrypt, and prune **files and databases (PostgreSQL, MySQL/MariaDB, MongoDB, SQLite)** on **AWS S3**, **Cloudflare R2**, **Backblaze B2**, **MinIO**, and any S3-compatible storage—works via **Docker**, **npx/npm**, or as a **standalone binary** (Linux, macOS, Windows).

[![CI](https://img.shields.io/github/actions/workflow/status/d0whc3r/node-s3/nodejs.yml?branch=master&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/d0whc3r/node-s3/actions/workflows/nodejs.yml)
[![npm](https://img.shields.io/npm/v/@d0whc3r/node-s3?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@d0whc3r/node-s3)
[![Docker Hub](https://img.shields.io/docker/v/d0whc3r/s3?style=flat-square&logo=docker&logoColor=white&label=docker)](https://hub.docker.com/r/d0whc3r/s3)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D26-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)

---

## Ways to Run

### 1. Docker (No Node.js required)

```bash
docker run --rm d0whc3r/s3 --help

# Back up a local directory into S3
docker run --rm \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_REGION -e BUCKET \
  -v "$PWD/data:/data:ro" \
  d0whc3r/s3 -b /data -z backup.zip -f daily -c -r

# Back up PostgreSQL / MySQL / MariaDB / MongoDB using the :db image variant
# (includes pg_dump, mariadb-dump, and mongodump; SQLite works in both images)
docker run --rm \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_REGION -e BUCKET \
  -e DATABASE_URL="postgresql://user:pass@host:5432/mydb" \
  d0whc3r/s3:db --db postgres -f postgres --encrypt
```

### 2. npx / npm (Node.js >= 26)

```bash
# Run on demand
npx @d0whc3r/node-s3 --help

# Or install globally
npm install -g @d0whc3r/node-s3
node-s3 --help
```

### 3. Standalone Binary (No Node.js required)

Install the prebuilt binary on **Linux (`x64`)** or **macOS (`arm64`)** with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/d0whc3r/node-s3/master/install.sh | sh
```

Optional installer overrides:

```bash
# Pin a specific version or custom install directory
VERSION=v1.5.0 INSTALL_DIR="$HOME/.local/bin" \
  curl -fsSL https://raw.githubusercontent.com/d0whc3r/node-s3/master/install.sh | sh
```

Update an installed standalone binary in place at any time (no S3 credentials required):

```bash
node-s3 --update            # Check GitHub Releases and replace binary atomically
node-s3 --update --dry-run  # Check if a newer release is available without modifying the binary
node-s3 --update --json     # Output machine-readable update status
```

_(If installed via `npm`/`npx`, `--update` detects the Node.js runtime safely and prints the `npm install -g @d0whc3r/node-s3@latest` command instead of touching the binary. On Windows `x64`, download `node-s3-win-x64.exe` from [GitHub Releases](https://github.com/d0whc3r/node-s3/releases); `--update` works on Windows too.)_

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

## Database Backups

`node-s3` supports native backups for **PostgreSQL**, **MySQL / MariaDB**, **MongoDB**, and **SQLite** without piping through `--stdin`.

| Engine              | CLI Flag / Aliases                   | Underlying Method                                                           | Mode                                        | Docker Image                                |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| **PostgreSQL**      | `--db postgres` (`pg`, `postgresql`) | `pg_dump` (`plain`, `custom`, `tar`)                                        | Direct stream (`O(1)` RAM, zero temp disk)  | `d0whc3r/s3:db`                             |
| **MySQL / MariaDB** | `--db mysql` (`mariadb`, `-m`)       | `mysqldump` / `mariadb-dump` (auto-fallback to pure-JS `mysqldump`)         | Direct stream (or temp file on JS fallback) | `d0whc3r/s3:db` _(or slim via JS fallback)_ |
| **MongoDB**         | `--db mongodb` (`mongo`)             | `mongodump --archive`                                                       | Direct stream (`O(1)` RAM, zero temp disk)  | `d0whc3r/s3:db`                             |
| **SQLite**          | `--db sqlite` (`sqlite3`)            | Node.js built-in `node:sqlite` online backup (WAL-safe, zero external deps) | Temp file (`0600`, auto-cleaned)            | `d0whc3r/s3:latest` & `:db`                 |

> **Streaming & Compression:** Without `-z`/`--zip`, PostgreSQL, MySQL/MariaDB, and MongoDB stream directly into S3 (and optional `--encrypt` AES-256-GCM) with zero temp disk space. Adding `-z` compresses the dump into a ZIP archive in a `0700` temp directory before uploading.
>
> **Credential Safety:** Passwords are never passed as CLI arguments (`ps`-safe). They are injected via `PGPASSWORD`, `MYSQL_PWD`, or a temporary `0600` `mongodump --config` file that is removed immediately after the dump finishes.

### Engine Examples

```bash
# PostgreSQL using standard PG* environment variables
PGHOST=db.internal PGUSER=postgres PGPASSWORD=secret PGDATABASE=app \
  node-s3 --bucket my-bucket --db postgres -f backups/pg --encrypt

# PostgreSQL custom binary format (.dump) via connection URI (auto-detects engine)
node-s3 --bucket my-bucket --db-url "postgresql://postgres:secret@db.internal:5432/app?sslmode=require" \
  --db-format custom -f backups/pg --encrypt

# MySQL / MariaDB (via --db mysql, --db mariadb, -m, or URI)
node-s3 --bucket my-bucket --db-url "mariadb://root:secret@127.0.0.1:3306/shop" -f backups/mysql

# MongoDB single-file archive via MONGODB_URI or --db-url
MONGODB_URI="mongodb+srv://user:secret@cluster.example.com/orders" \
  node-s3 --bucket my-bucket --db mongodb -f backups/mongo --encrypt

# SQLite online backup (safe while the database is in active WAL use)
node-s3 --bucket my-bucket --db sqlite --db-url "sqlite:///var/data/app.sqlite" -z -f backups/sqlite

# Docker (:db variant bundles pg_dump, mariadb-dump, and mongodump)
docker run --rm \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_REGION -e BUCKET \
  -e DATABASE_URL="postgresql://postgres:secret@host.docker.internal:5432/app" \
  -e BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  d0whc3r/s3:db --db postgres -f backups/pg --encrypt
```

---

## Common Usage Examples

```bash
# List objects (optionally scoped to a folder prefix, or as JSON for scripts)
node-s3 --bucket my-bucket -l -f daily --json

# Back up a folder with exclusions, ZIP, and client-side AES-256-GCM encryption
BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  node-s3 --bucket my-bucket -b "src/*" --exclude "*.spec.ts" -z src.zip -f backups --encrypt -c -r

# Download and decrypt a backup
BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  node-s3 --bucket my-bucket --download backups/src.zip -o ./restored.zip --encrypt

# Native database backups (PostgreSQL, MySQL/MariaDB, MongoDB, SQLite)
node-s3 --bucket my-bucket --db postgres -f postgres --encrypt
node-s3 --bucket my-bucket --db-url "postgresql://user:pass@host:5432/mydb" --db-format custom -f postgres
node-s3 --bucket my-bucket --db-url "mongodb+srv://user:pass@cluster/mydb" -f mongo --encrypt
node-s3 --bucket my-bucket --db sqlite --db-url "sqlite:///var/data/app.sqlite" -z -f sqlite

# Preview retention cleanup safely before deleting anything
node-s3 --bucket my-bucket -d daily=30d --keep-last 5 --dry-run

# Nightly cron job: PostgreSQL dump + encrypt + prune older than 14 days (keep at least 5)
node-s3 --bucket my-bucket --db postgres -f postgres --encrypt && \
  node-s3 --bucket my-bucket -d postgres=14d --keep-last 5
```

---

## Environment Variables

Precedence: **CLI flags / constructor options > `AWS_*` variables > legacy variables > defaults**.

| Variable                                                                                                     | Legacy Alias | Description                                               | Default           |
| ------------------------------------------------------------------------------------------------------------ | ------------ | --------------------------------------------------------- | ----------------- |
| `AWS_ENDPOINT_URL`                                                                                           | `ENDPOINT`   | Custom S3-compatible endpoint URL                         | AWS S3 default    |
| `AWS_ACCESS_KEY_ID`                                                                                          | `ACCESS_KEY` | Access key ID                                             | —                 |
| `AWS_SECRET_ACCESS_KEY`                                                                                      | `SECRET_KEY` | Secret access key                                         | —                 |
| `AWS_SESSION_TOKEN`                                                                                          | —            | Temporary STS session token                               | —                 |
| `AWS_REGION`                                                                                                 | —            | S3 region (`auto` for Cloudflare R2)                      | `us-east-1`       |
| `BUCKET`                                                                                                     | —            | Default target bucket name                                | —                 |
| `MAX_RETRIES`                                                                                                | —            | Retry attempts on transient S3 errors                     | `3`               |
| `FORCE_PATH_STYLE`                                                                                           | —            | Path-style URLs (`true`/`false`)                          | `true`            |
| `SSL_ENABLED`                                                                                                | —            | Enforce TLS (`true`/`false`)                              | `true`            |
| `BACKUP_ENCRYPTION_KEY`                                                                                      | —            | Passphrase for `--encrypt` (AES-256-GCM)                  | —                 |
| `DATABASE_URL`                                                                                               | —            | Connection URI (auto-detects Postgres/MySQL/Mongo/SQLite) | —                 |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`                                        | —            | PostgreSQL connection for `--db postgres`                 | `localhost:5432`  |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`                                 | —            | MySQL / MariaDB connection for `--db mysql` / `--mysql`   | `localhost:3306`  |
| `MONGODB_URI`, `MONGO_HOST`, `MONGO_PORT`, `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DATABASE`, `MONGO_AUTH_DB` | —            | MongoDB connection for `--db mongodb`                     | `localhost:27017` |
| `SQLITE_PATH`                                                                                                | —            | SQLite database file path for `--db sqlite`               | —                 |

See [example.env](./example.env) for a ready-to-copy template.

---

## CLI Options

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
| `--name <filename>`     | —     | Destination filename when using `--stdin` or custom dump name for `--db`   |
| `--db <engine>`         | —     | Native DB backup: `postgres`, `mysql` (`mariadb`), `mongodb`, `sqlite`     |
| `--db-url <uri>`        | —     | Database connection URI (auto-detects engine from scheme)                  |
| `--db-format <fmt>`     | —     | PostgreSQL dump format: `plain` (`.sql`), `custom` (`.dump`), `tar`        |
| `--mysql`               | `-m`  | Alias for `--db mysql`                                                     |
| `--storage-class <cls>` | —     | S3 storage class (e.g. `STANDARD_IA`, `GLACIER_IR`, `INTELLIGENT_TIERING`) |
| `--sse <algo>`          | —     | Server-side encryption (`AES256` or `aws:kms`)                             |
| `--kms-key-id <id>`     | —     | KMS Key ID when using `--sse aws:kms`                                      |
| `--acl <acl>`           | —     | Canned ACL (e.g. `private`, `public-read`)                                 |
| `--expire <duration>`   | —     | Set object `Expires` header relative to now (e.g. `30d`, `12h`)            |
| `--json`                | —     | Output machine-readable JSON (ideal for CI/scripts)                        |
| `--quiet`               | `-q`  | Suppress informational logs                                                |
| `--update`              | `-u`  | Update standalone binary to latest GitHub release (supports `--dry-run`)   |
| `--version`             | `-v`  | Print CLI version                                                          |
| `--help`                | `-h`  | Print usage guide                                                          |

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

> Unrecognized units are rejected immediately to prevent accidental deletions.

### Exit Codes

- `0`: Success (or `--help` / `--version` / `--update`).
- `1`: Runtime or S3 API error.
- `2`: Invalid CLI arguments or missing required options.

---

## Using as a Node.js Library

```bash
npm install @d0whc3r/node-s3
```

### ESM / TypeScript

```ts
import { dumpDatabase, S3Wrapper } from '@d0whc3r/node-s3';

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

  // Download and decrypt
  await s3.downloadFile('daily/dump.sql', './restored.sql', {
    decryptKey: process.env.BACKUP_ENCRYPTION_KEY
  });

  // Stream a PostgreSQL dump directly to S3 with client-side encryption
  const dump = await dumpDatabase({
    url: process.env.DATABASE_URL,
    format: 'custom'
  });
  try {
    if (dump.kind === 'stream') {
      await s3.uploadStream(dump.stream, dump.filename, 'postgres', {
        encryptKey: process.env.BACKUP_ENCRYPTION_KEY
      });
      await dump.wait();
    } else {
      await s3.uploadFile(dump.filePath, 'postgres', {
        encryptKey: process.env.BACKUP_ENCRYPTION_KEY
      });
    }
  } finally {
    await dump.cleanup();
  }

  // Delete files older than 30 days while keeping at least the 5 newest
  await s3.cleanOlder('30d', 'daily', undefined, { keepLast: 5 });
} finally {
  s3.destroy();
}
```

### CommonJS

```js
const { S3Wrapper } = require('@d0whc3r/node-s3');

const s3 = new S3Wrapper({ bucket: 'my-backups' });
s3.getFiles(undefined, 'daily')
  .then((files) => console.log(files))
  .finally(() => s3.destroy());
```

---

## Alternatives

Go implementation with a similar interface: [go-s3](https://github.com/d0whc3r/go-s3).

## Contributing, Security & License

- Want to contribute or build from source? See [CONTRIBUTING.md](./CONTRIBUTING.md).
- Found a security issue? See [SECURITY.md](./SECURITY.md).
- Released under the [MIT License](./LICENSE).
