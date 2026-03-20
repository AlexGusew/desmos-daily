# Server Deployment Preparation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the Express server for Docker-based deployment via Coolify.

**Architecture:** Multi-stage Dockerfile at repo root builds only the server package from the pnpm monorepo. Server code gets a health check, restricted CORS, and graceful shutdown.

**Tech Stack:** Node 22, pnpm, Docker, Express, mysql2

**Spec:** `docs/superpowers/specs/2026-03-20-server-deployment-design.md`

---

### Task 1: Create .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create the file**

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

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for server deployment"
```

---

### Task 2: Create Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Create the file**

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

- [ ] **Step 2: Verify the Docker build succeeds**

Run: `docker build -t desmos-daily-server .`
Expected: Build completes with no errors. Final image exposes port 3000.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage Dockerfile for server deployment"
```

---

### Task 3: Update server — health check, CORS, graceful shutdown

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Add pool import**

Add `import { pool } from "./db.js";` after the existing imports. The final import block should be:

```typescript
import "dotenv/config";
import express from "express";
import cors from "cors";
import challengesRouter from "./routes/challenges.js";
import { pool } from "./db.js";
```

- [ ] **Step 2: Restrict CORS**

Replace:
```typescript
app.use(cors());
```

With:
```typescript
app.use(cors({ origin: /\.desmos\.com$/ }));
```

- [ ] **Step 3: Add health check endpoint**

Add before the challenges router line (`app.use("/api/challenges", ...)`):

```typescript
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
```

- [ ] **Step 4: Add graceful shutdown**

Replace:
```typescript
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
```

With:
```typescript
const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
});
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `pnpm --filter server build`
Expected: Compiles with no errors. Output in `packages/server/dist/`.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat: add health check, restrict CORS, add graceful shutdown"
```

---

### Task 4: Verify Docker image runs correctly

- [ ] **Step 1: Rebuild image with server changes**

Run: `docker build -t desmos-daily-server .`
Expected: Build succeeds.

- [ ] **Step 2: Run container and test health endpoint**

Run:
```bash
docker run --rm -d -p 3000:3000 --name desmos-test desmos-daily-server
curl http://localhost:3000/health
docker stop desmos-test
```
Expected: `{"status":"ok"}` response from curl. Container stops cleanly (graceful shutdown via SIGTERM).

Note: The `/api/challenges/today` endpoint will return a 500 or connection error since there's no DB accessible from the container in this test — that's expected. The point is to verify the image starts and the health check works.
