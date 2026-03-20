# Extension Server URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Chrome extension to fetch today’s challenge from the deployed server URL instead of localhost.

**Architecture:** Keep the current extension flow unchanged and make the smallest possible production config change. Replace the hardcoded popup fetch URL in `packages/extension/src/popup/main.ts` and add the deployed host to `packages/extension/manifest.json` so the extension can request the remote API.

**Tech Stack:** TypeScript, Chrome Extensions Manifest V3, Vite, pnpm

---

## File Structure

- Modify: `packages/extension/src/popup/main.ts`
  - Responsibility: popup startup flow, including fetching today’s challenge from the backend API.
- Modify: `packages/extension/manifest.json`
  - Responsibility: extension permissions and allowed remote hosts.

### Task 1: Update popup API URL

**Files:**
- Modify: `packages/extension/src/popup/main.ts:220-223`

- [ ] **Step 1: Read the existing fetch call**

Confirm that `loadChallenge()` currently fetches:

```ts
const res = await fetch("http://localhost:3000/api/challenges/today");
```

- [ ] **Step 2: Write the minimal implementation**

Replace the localhost URL with the exact deployed server URL provided by the user:

```ts
const res = await fetch(
  "http://osso8sk8occc00sc8k4scgsc.65.109.235.206.sslip.io/api/challenges/today"
);
```

If the deployed server is later moved behind HTTPS, update this exact hardcoded origin to match the new deployed origin.

Do not change any other popup behavior.

- [ ] **Step 3: Verify the source edit**

Re-open `packages/extension/src/popup/main.ts` and confirm the fetch call points at the deployed URL and still targets `/api/challenges/today`.


### Task 2: Allow the deployed host in the extension manifest

**Files:**
- Modify: `packages/extension/manifest.json:12-13`

- [ ] **Step 1: Read the existing host permissions**

Confirm that `host_permissions` currently includes only the Desmos host pattern:

```json
"host_permissions": ["https://*.desmos.com/*"]
```

- [ ] **Step 2: Write the minimal implementation**

Add the deployed server origin pattern to `host_permissions` while keeping the existing Desmos entry:

```json
"host_permissions": [
  "https://*.desmos.com/*",
  "http://osso8sk8occc00sc8k4scgsc.65.109.235.206.sslip.io/*"
]
```

Do not add unrelated permissions.

- [ ] **Step 3: Verify the manifest edit**

Re-open `packages/extension/manifest.json` and confirm both host permission entries are present and valid JSON formatting is preserved.


### Task 3: Validate the minimal source change

**Files:**
- Verify: `packages/extension/src/popup/main.ts`
- Verify: `packages/extension/manifest.json`

- [ ] **Step 1: Build the extension**

Run:

```bash
pnpm --filter extension build
```

Expected: Vite completes successfully.

- [ ] **Step 2: Verify the built output contains the deployed origin**

Search under `packages/extension/dist/` for:

```text
osso8sk8occc00sc8k4scgsc.65.109.235.206.sslip.io
```

Expected: the built extension output contains the deployed origin from the source change.

- [ ] **Step 3: Optionally smoke-check in Chrome**

If you want a manual validation pass, load the built extension in Chrome on a Desmos page and confirm the popup loads the current challenge instead of falling back to the how-it-works state.

Expected: the popup shows the challenge state when the deployed API is reachable.

## Notes

- Keep the server URL hardcoded because the user explicitly requested that approach.
- Do not introduce env vars, shared config files, or extra abstractions.
- If the live endpoint fails during manual smoke testing, verify the server returns a valid payload from `/api/challenges/today` before changing extension code further.
