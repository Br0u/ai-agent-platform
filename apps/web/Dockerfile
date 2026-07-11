FROM node:24-alpine3.24 AS base

ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/corepack
ENV PATH=$PNPM_HOME:$PATH

RUN mkdir -p $COREPACK_HOME \
  && corepack enable \
  && corepack prepare pnpm@11.5.2 --activate \
  && chmod -R a+rX $COREPACK_HOME

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS migrator

COPY --chown=node:node packages/database ./packages/database

WORKDIR /app/packages/database

USER node

CMD ["pnpm", "db:prepare"]

FROM base AS builder

COPY --from=dependencies /app/ ./
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @ai-agent-platform/web build

FROM node:24-alpine3.24 AS runner

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
