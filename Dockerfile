FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter server
COPY packages/server/ packages/server/
COPY tsconfig.base.json ./
RUN pnpm --filter server build

FROM base AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter server --prod
COPY --from=build /app/packages/server/dist ./packages/server/dist
WORKDIR /app/packages/server
EXPOSE 3000
CMD ["node", "dist/index.js"]
