# Coolify Healthcheck Curl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the server runtime image so Coolify health checks can run successfully using curl against `/health`.

**Architecture:** Keep the existing multi-stage Docker build and Express health endpoint unchanged. Make a single runtime-image change in `Dockerfile` to install `curl`, then verify the image can execute `curl http://localhost:3000/health` after the server starts.

**Tech Stack:** Docker, Node.js 22 slim, pnpm, Express, Coolify

---

## File Structure

- Modify: `Dockerfile`
  - Responsibility: defines the production container build and runtime environment for the server.
- Verify with: built Docker image and running container
  - Responsibility: confirm `curl` exists in the runtime image and can successfully hit the local `/health` endpoint.

### Task 1: Install curl in the runtime image

**Files:**
- Modify: `Dockerfile:13-21`

- [ ] **Step 1: Read the current runtime stage**

Confirm the runtime stage currently starts from:

```dockerfile
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

- [ ] **Step 2: Write the failing verification command**

Build the current image and verify that `curl` is missing before changing the Dockerfile:

```bash
docker build -t desmos-daily-server:test .
docker run --rm desmos-daily-server:test curl --version
```

Expected: FAIL with an error indicating `curl` is not installed in the image.

- [ ] **Step 3: Write the minimal implementation**

Add a single package-install step in the runtime stage before the production pnpm install:

```dockerfile
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
```

Do not change any other stages or add unrelated packages.

- [ ] **Step 4: Rebuild the image and verify `curl` is available**

Run:

```bash
docker build -t desmos-daily-server:test .
docker run --rm desmos-daily-server:test curl --version
```

Expected: PASS with `curl` version output.

### Task 2: Verify the runtime health check path inside the container

**Files:**
- Verify: `Dockerfile`
- Verify: `packages/server/src/index.ts`

- [ ] **Step 1: Confirm the server exposes `/health`**

Re-open `packages/server/src/index.ts` and confirm:

```ts
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
```

- [ ] **Step 2: Start the built container with required environment variables**

Run the image locally with the environment variables your server requires for startup.

Example:

```bash
docker run --rm -d \
  --name desmos-daily-server-test \
  -p 3000:3000 \
  -e DB_HOST=... \
  -e DB_PORT=3306 \
  -e DB_USER=... \
  -e DB_PASSWORD=... \
  -e DB_NAME=... \
  -e PORT=3000 \
  desmos-daily-server:test
```

Expected: container starts successfully and stays running.

- [ ] **Step 3: Verify the health endpoint with curl inside the container**

Run:

```bash
docker exec desmos-daily-server-test curl -fsS http://localhost:3000/health
```

Expected: PASS with output equivalent to:

```json
{"status":"ok"}
```

- [ ] **Step 4: Stop the verification container**

Run:

```bash
docker stop desmos-daily-server-test
```

Expected: container stops cleanly.

## Notes

- Keep the fix scoped to `Dockerfile`; the health route already exists in `packages/server/src/index.ts`.
- Do not disable Coolify health checks.
- Do not add `wget`, `HEALTHCHECK`, or any unrelated runtime utilities.
