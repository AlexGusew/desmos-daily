# Server Deployment Preparation — Design Spec

## Context

The Desmos Daily server is a minimal Express + MySQL API (`packages/server/`) with one route (`GET /api/challenges/today`). It has zero deployment infrastructure — no Dockerfile, no CI/CD, no health checks, no graceful shutdown. The goal is to prepare it for deployment via Coolify using Docker.

The MySQL database is already running separately and does not need to be provisioned.

## Changes

### 1. Dockerfile (repo root)

Multi-stage build targeting the server package in the pnpm monorepo.

**Stage 1 — base:** Node 22 slim with corepack-enabled pnpm 10.12.4 (matches `packageManager` in root `package.json`).

**Stage 2 — build:** Copies workspace config, lockfile, and server `package.json` first (for Docker layer caching). Runs `pnpm install --frozen-lockfile --filter server`, then copies source and runs `pnpm --filter server build`.

**Stage 3 — runtime:** Fresh pnpm production install (avoids broken symlinks from pnpm's content-addressable store). Copies `dist/` from the build stage. Exposes port 3000. Runs `node dist/index.js`.

Note: We cannot simply copy `node_modules` from the build stage because pnpm uses symlinks pointing to the workspace-root virtual store. Those symlinks would break in the runtime stage. Instead, we do a clean production-only install.

```dockerfile
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
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter server --prod
COPY --from=build /app/packages/server/dist ./packages/server/dist
WORKDIR /app/packages/server
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 2. .dockerignore (repo root)

```
node_modules
**/node_modules
**/dist
.git
.github
packages/extension
*.md
.env
.env.*
```

Excludes the extension package, git history, pre-existing node_modules/dist, env files (secrets are configured in Coolify, not baked into the image), and markdown files.

### 3. Health check endpoint

Add `GET /health` in `packages/server/src/index.ts`, mounted before the challenges router:

```typescript
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
```

Returns `{ "status": "ok" }` with HTTP 200. Coolify polls this to determine container health.

### 4. CORS restriction

Replace `app.use(cors())` with:

```typescript
app.use(cors({ origin: /\.desmos\.com$/ }));
```

Allows any subdomain of `desmos.com`. Rejects all other browser-based origins. Note: the Chrome extension popup (`chrome-extension://` origin) bypasses CORS via Manifest V3 `host_permissions` — it will need the production server URL added to `host_permissions` in `manifest.json`, but that is an extension-side change outside this spec's scope.

### 5. Graceful shutdown

Capture the return value of `app.listen()` and add a SIGTERM handler. Requires adding `import { pool } from "./db.js"` to `index.ts`:

```typescript
import { pool } from "./db.js";

// ... existing code ...

const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
});
```

On SIGTERM (sent by Docker/Coolify during stop/redeploy): stops accepting new connections, drains in-flight requests, closes the MySQL connection pool, then exits cleanly.

### 6. Note on dotenv

The `import "dotenv/config"` in `index.ts` is intentionally kept. In Docker, env vars are injected by Coolify directly — there is no `.env` file in the image. `dotenv` silently no-ops when no `.env` file is found, so this is harmless and preserves local development convenience.

## File summary

| File | Action |
|---|---|
| `Dockerfile` (repo root) | Create |
| `.dockerignore` (repo root) | Create |
| `packages/server/src/index.ts` | Edit — health check, CORS, graceful shutdown |

## What is NOT in scope

- MySQL provisioning (already running separately)
- CI/CD pipeline (Coolify handles build-on-push or manual deploy)
- Database migrations or seed scripts
- SSL/TLS (handled by Coolify's reverse proxy)
- Rate limiting or authentication (read-only public API, low risk)
- New dependencies (all changes use existing packages)

## Coolify configuration

After deploying, configure in Coolify:
- **Source:** Git repository
- **Build context:** `/`
- **Dockerfile path:** `Dockerfile`
- **Port:** 3000
- **Health check path:** `/health`
- **Environment variables:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`
