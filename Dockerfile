FROM node:26-trixie-slim AS builder

RUN npm install -g pnpm@12.16.1

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json vite.config.mts vite.cli.config.mts vite.sea.config.mts ./
COPY scripts/ /app/scripts
RUN pnpm install --frozen-lockfile

COPY src/ /app/src
COPY cli/ /app/cli
RUN pnpm build

FROM debian:trixie-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --uid 10001 --create-home --shell /usr/sbin/nologin appuser

COPY --from=builder --chown=appuser:appuser /app/node-s3 /app/node-s3
RUN chmod 0755 /app/node-s3
WORKDIR /app

USER 10001

ENTRYPOINT ["/app/node-s3"]
