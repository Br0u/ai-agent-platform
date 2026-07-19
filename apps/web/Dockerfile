FROM node:24-alpine3.24 AS base

ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/corepack
ENV PATH=$PNPM_HOME:$PATH

RUN apk add --no-cache gosu=1.19-r4 \
  && mkdir -p $COREPACK_HOME \
  && corepack enable \
  && corepack prepare pnpm@11.5.2 --activate \
  && chmod -R a+rX $COREPACK_HOME

WORKDIR /app

FROM base AS dependencies

ARG PNPM_REGISTRY=https://registry.npmmirror.com

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,id=ai-agent-platform-pnpm-store,target=/pnpm/store,sharing=locked \
    PNPM_CONFIG_STORE_DIR=/pnpm/store \
    PNPM_CONFIG_REGISTRY="$PNPM_REGISTRY" \
    PNPM_CONFIG_FETCH_RETRIES=5 \
    PNPM_CONFIG_FETCH_TIMEOUT=300000 \
    PNPM_CONFIG_NETWORK_CONCURRENCY=4 \
    pnpm install --frozen-lockfile

FROM dependencies AS migrator

ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

COPY --chown=node:node packages/database ./packages/database
COPY --chown=node:node infra/postgres/02-runtime-grants.sql ./infra/postgres/02-runtime-grants.sql

RUN chown node:node /app /app/packages/database

WORKDIR /app/packages/database

USER node

CMD ["pnpm", "db:prepare"]

FROM base AS builder

COPY --from=dependencies /app/ ./
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @ai-agent-platform/web build

FROM node:24-alpine3.24 AS runner

RUN apk add --no-cache gosu=1.19-r4

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app/apps/web

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone /app
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]
