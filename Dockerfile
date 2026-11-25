FROM node:26-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json vite.config.mts vite.cli.config.mts vite.sea.config.mts ./
COPY scripts/ /app/scripts
RUN pnpm install --frozen-lockfile

COPY src/ /app/src
COPY cli/ /app/cli
RUN pnpm build

FROM debian:bookworm-slim

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin appuser

COPY --from=builder /app/node-s3 /app/node-s3
RUN chmod +x /app/node-s3 && chown appuser:appuser /app/node-s3
WORKDIR /app

USER 10001

ENTRYPOINT ["/app/node-s3"]
