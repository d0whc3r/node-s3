FROM node:12 AS builder

COPY package.json yarn.lock tsconfig.json rollup.config.js /app/
WORKDIR /app

RUN yarn install
COPY src/ /app/src
COPY cli/ /app/cli
RUN yarn build

FROM node:12

ENV ACCESS_KEY=""
ENV SECRET_KEY=""

COPY package.json yarn.lock /app/
COPY --from=builder /app/bin/cli.js /app/bin/cli.js
WORKDIR /app

RUN yarn install --prod --pure-lockfile

ENTRYPOINT ["node", "/app/bin/cli.js"]
