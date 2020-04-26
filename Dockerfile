FROM node:12 AS builder

ENV NODE_OPTIONS "--max_old_space_size=2048"

COPY package.json yarn.lock tsconfig.json rollup.config.js /app/
WORKDIR /app

RUN yarn install
COPY src/ /app/src
COPY cli/ /app/cli
RUN yarn build

FROM bitnami/minideb

ENV ACCESS_KEY ""
ENV SECRET_KEY ""

COPY --from=builder /app/node-s3 /app/node-s3
RUN chmod +x /app/node-s3

ENTRYPOINT ["/app/node-s3"]
