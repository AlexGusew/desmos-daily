# Extension Backend URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the extension to fetch challenges from `https://api.desmos-daily.alexcoders.com` using a single hardcoded runtime constant in popup code, and align manifest permissions with that host. The manifest remains a separate static duplication because it cannot import runtime constants.

**Architecture:** Keep the change limited to the existing extension entry points that already reference the backend host. Introduce one top-level `API_BASE_URL` constant in the popup code, derive the challenge endpoint from it, and separately replace the static manifest host permission because the manifest cannot import runtime constants.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, Vite, pnpm

---

## File structure

- Modify: `packages/extension/src/popup/main.ts`
  - Add a single `API_BASE_URL` constant near the existing top-level constants.
  - Replace the hardcoded challenge fetch URL in `loadChallenge()` with a template string derived from the constant.
- Modify: `packages/extension/manifest.json`
  - Replace the old `sslip.io` host permission with `https://api.desmos-daily.alexcoders.com/*`.
- Verify: `docs/superpowers/specs/2026-03-20-extension-backend-url-design.md`
  - Use as the implementation reference while executing the plan.

### Task 1: Update popup backend URL usage

**Files:**
- Modify: `packages/extension/src/popup/main.ts:1-7`
- Modify: `packages/extension/src/popup/main.ts:225-230`
- Verify against: `docs/superpowers/specs/2026-03-20-extension-backend-url-design.md`

- [ ] **Step 1: Write the failing test surrogate**

Document the exact before-state that should change:

```ts
const TARGET_ID_PREFIX = "desmos-daily-target-";
const CHECK_INTERVAL_MS = 2000;

const res = await fetch("http://osso8sk8occc00sc8k4scgsc.65.109.235.206.sslip.io/api/challenges/today");
```

Expected after-state:

```ts
const API_BASE_URL = "https://api.desmos-daily.alexcoders.com";
const TARGET_ID_PREFIX = "desmos-daily-target-";
const CHECK_INTERVAL_MS = 2000;

const res = await fetch(`${API_BASE_URL}/api/challenges/today`);
```

- [ ] **Step 2: Verify the old runtime URL exists before editing**

Run: `grep -n "sslip.io/api/challenges/today\|API_BASE_URL" packages/extension/src/popup/main.ts`
Expected: one match for the old `sslip.io` fetch URL and no match yet for `API_BASE_URL`

- [ ] **Step 3: Write the minimal implementation**

Apply this change in `packages/extension/src/popup/main.ts`:

```ts
const API_BASE_URL = "https://api.desmos-daily.alexcoders.com";
const TARGET_ID_PREFIX = "desmos-daily-target-";
const CHECK_INTERVAL_MS = 2000;
```

and update the fetch call to:

```ts
const res = await fetch(`${API_BASE_URL}/api/challenges/today`);
```

- [ ] **Step 4: Verify the popup code now uses the constant**

Run: `grep -n "API_BASE_URL\|api/challenges/today" packages/extension/src/popup/main.ts`
Expected: one `API_BASE_URL` declaration and the fetch call built from `${API_BASE_URL}/api/challenges/today`


### Task 2: Update manifest host permission

**Files:**
- Modify: `packages/extension/manifest.json:13-16`
- Verify against: `docs/superpowers/specs/2026-03-20-extension-backend-url-design.md`

- [ ] **Step 1: Write the failing test surrogate**

Document the exact before-state that should change:

```json
"host_permissions": [
  "https://*.desmos.com/*",
  "http://osso8sk8occc00sc8k4scgsc.65.109.235.206.sslip.io/*"
],
```

Expected after-state:

```json
"host_permissions": [
  "https://*.desmos.com/*",
  "https://api.desmos-daily.alexcoders.com/*"
],
```

- [ ] **Step 2: Verify the old manifest host exists before editing**

Run: `grep -n "sslip.io\|api.desmos-daily.alexcoders.com" packages/extension/manifest.json`
Expected: one match for the old `sslip.io` host permission and no match yet for the new host

- [ ] **Step 3: Write the minimal implementation**

Replace the old host permission entry with:

```json
"https://api.desmos-daily.alexcoders.com/*"
```

- [ ] **Step 4: Verify the manifest host permission now matches the new domain**

Run: `grep -n "api.desmos-daily.alexcoders.com\|sslip.io" packages/extension/manifest.json`
Expected: one match for `https://api.desmos-daily.alexcoders.com/*` and no remaining `sslip.io` matches in the manifest


### Task 3: Build and verify the extension

**Files:**
- Verify: `packages/extension/src/popup/main.ts`
- Verify: `packages/extension/manifest.json`

- [ ] **Step 1: Build the extension**

Run: `pnpm --filter extension build`
Expected: build completes successfully and outputs the extension bundle without errors

- [ ] **Step 2: Verify the popup source uses the constant-based backend URL**

Run: `grep -n "API_BASE_URL\|api/challenges/today" packages/extension/src/popup/main.ts`
Expected: one `API_BASE_URL` declaration and the fetch call built from `${API_BASE_URL}/api/challenges/today`

- [ ] **Step 3: Verify the manifest permission matches the new domain**

Run: `grep -n "api.desmos-daily.alexcoders.com\|sslip.io" packages/extension/manifest.json`
Expected: one match for `https://api.desmos-daily.alexcoders.com/*` and no remaining `sslip.io` matches in the manifest

- [ ] **Step 4: Inspect working tree for only intended changes**

Run: `git diff -- packages/extension/src/popup/main.ts packages/extension/manifest.json`
Expected: diff shows only the new runtime constant, the fetch URL update, and the manifest host permission replacement

- [ ] **Step 5: Record manual verification follow-up**

After loading the rebuilt extension in Chrome, open the popup on a Desmos tab and confirm the challenge loads from the production API without permission errors.
