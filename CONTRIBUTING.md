# Contributing to node-s3

Thank you for your interest in contributing to **node-s3**!

## Requirements

- **Node.js** `>= 26.0.0`
- **pnpm** `12.x`

## Local Setup

```bash
git clone https://github.com/d0whc3r/node-s3.git
cd node-s3
pnpm install
```

## Common Commands

```bash
pnpm lint           # Run Oxlint
pnpm lint:fix       # Auto-fix lint issues
pnpm format         # Format files with Oxfmt
pnpm format:check   # Check formatting
pnpm typecheck      # Type-check with TypeScript 7
pnpm test:unit      # Run offline unit tests (Vitest + aws-sdk-client-mock)
pnpm test:coverage  # Run unit tests with coverage report
pnpm build:base     # Build CJS/ESM library, CLI, and .d.ts declarations
pnpm build:sea      # Build native Node.js 26 Single Executable Application
pnpm build          # Full build (library + CLI + SEA binary)
```

## Running Integration Tests

Live integration tests (`tests/s3wrapper.integration.spec.ts`) run against an S3-compatible server such as MinIO when `ENDPOINT` is configured:

```bash
ENDPOINT=http://localhost:9000 ACCESS_KEY=minioadmin SECRET_KEY=minioadmin pnpm test:integration
```

## Commit Guidelines

This repository uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by `commitlint` and `husky`:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `refactor:` code refactoring without behavior changes
- `perf:` performance improvement
- `test:` adding or updating tests
- `chore:` build, tooling, or dependency updates
- `ci:` CI/CD workflow changes

## Pull Request Checklist

1. Create a branch from `master`.
2. Add or update unit tests for your changes.
3. Ensure `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm build:base` all pass.
4. Open a pull request describing the motivation and changes clearly.
