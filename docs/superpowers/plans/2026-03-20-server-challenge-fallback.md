# Server Challenge Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `selectedDate` to challenge responses, return today’s challenge when present, fall back to a built-in challenge when missing, and provide a repeatable script that seeds 50 challenges into MySQL.

**Architecture:** Keep the route structure intact in `packages/server/src/routes/challenges.ts`, extend the shared server challenge contract, and add a small seed entrypoint in the server package. The route will continue to parse database JSON payloads for exact date hits, but return a built-in fallback object when no row exists for today. The extension popup will be updated only where it consumes the response date so the UI uses `selectedDate` as the active day.

**Tech Stack:** TypeScript, Express, mysql2, Chrome extension popup code, pnpm workspaces

---

## File structure

- Modify: `packages/server/src/types.ts` — extend the `Challenge` interface with `selectedDate`.
- Modify: `packages/server/src/routes/challenges.ts` — add UTC-today lookup behavior, built-in fallback response, and `selectedDate` on all returned payloads.
- Modify: `packages/server/package.json` — add a seed script command.
- Create: `packages/server/src/scripts/seedChallenges.ts` — generate and upsert 50 deterministic challenge rows.
- Modify: `packages/extension/src/popup/main.ts` — extend the popup-side `Challenge` interface and display `selectedDate` instead of `date` for the active day label.

### Task 1: Map all challenge-shape consumers before editing

**Files:**
- Modify: none
- Test: `packages/server/src/routes/challenges.ts`, `packages/extension/src/popup/main.ts`

- [ ] **Step 1: Search for challenge response consumers**

Run: `rg -n "targetExpressions|graphData|selectedDate|interface Challenge|api/challenges/today" packages/server packages/extension`
Expected: identify every place the challenge payload shape is declared or consumed.

- [ ] **Step 2: Confirm the current result set is limited**

Verify the only relevant consumers are:
- `packages/server/src/types.ts`
- `packages/server/src/routes/challenges.ts`
- `packages/extension/src/popup/main.ts`

If more consumers exist, add them to this plan before implementation.

### Task 2: Extend the shared challenge contract

**Files:**
- Modify: `packages/server/src/types.ts:1-9`
- Test: `packages/server/src/routes/challenges.ts`

- [ ] **Step 1: Read the current challenge interface**

Read `packages/server/src/types.ts` and confirm the existing `Challenge` fields are `id`, `date`, `targetExpressions`, and `graphData`.

- [ ] **Step 2: Write the minimal type change**

Update the interface to include:

```ts
export interface Challenge {
  id: number;
  date: string;
  selectedDate: string;
  targetExpressions: string[];
  graphData: {
    xRange?: [number, number];
    yRange?: [number, number];
  };
}
```

- [ ] **Step 3: Check for compile fallout**

Run: `pnpm --filter server build`
Expected: TypeScript may fail in route code until the response mapping is updated.

### Task 3: Update `/api/challenges/today` to return today or fallback

**Files:**
- Modify: `packages/server/src/routes/challenges.ts:1-47`
- Modify: `packages/server/src/types.ts:1-10`
- Test: manual API verification via local server

- [ ] **Step 1: Read the current route implementation**

Read `packages/server/src/routes/challenges.ts` and note the current behavior:
- computes `today` with `new Date().toISOString().slice(0, 10)`
- queries `challenges` by `date`
- returns `404` if no row exists
- parses JSON fields and returns a `Challenge`

- [ ] **Step 2: Add the fallback challenge constant**

Insert a built-in fallback challenge near the top of the file:

```ts
const FALLBACK_CHALLENGE = {
  id: 0,
  date: "1970-01-01",
  targetExpressions: ["y=x"],
  graphData: {
    xRange: [-10, 10] as [number, number],
    yRange: [-10, 10] as [number, number],
  },
};
```

- [ ] **Step 3: Replace the `404` branch with fallback behavior**

Update the handler so the missing-row case returns:

```ts
res.json({
  ...FALLBACK_CHALLENGE,
  selectedDate: today,
});
return;
```

- [ ] **Step 4: Add `selectedDate` to the successful response**

Update the mapped challenge object to include:

```ts
const challenge: Challenge = {
  id: rows[0].id,
  date: rows[0].date,
  selectedDate: today,
  targetExpressions: Array.isArray(rawExpressions)
    ? rawExpressions
    : [rawExpressions],
  graphData: rawGraphData,
};
```

- [ ] **Step 5: Preserve malformed-JSON failure behavior**

Do not wrap JSON parsing in a fallback path. Keep parse failures inside the existing `catch` so malformed stored data still returns `500`.

- [ ] **Step 6: Build the server package**

Run: `pnpm --filter server build`
Expected: PASS

### Task 4: Add deterministic challenge seeding

**Files:**
- Create: `packages/server/src/scripts/seedChallenges.ts`
- Modify: `packages/server/package.json:6-10`
- Test: local script run against configured MySQL database

- [ ] **Step 1: Create the seed script file**

Create `packages/server/src/scripts/seedChallenges.ts`.

- [ ] **Step 2: Add the seed script implementation**

Write the script with this structure:

```ts
import "dotenv/config";
import { pool } from "../db.js";

const START_DATE = new Date("2026-03-01T00:00:00.000Z");
const CHALLENGE_COUNT = 50;

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildChallenge(index: number) {
  const slope = index % 5 === 0 ? 1 : (index % 5) + 1;
  const intercept = (index % 11) - 5;

  return {
    targetExpressions: [`y=${slope}x${intercept >= 0 ? `+${intercept}` : intercept}`],
    graphData: {
      xRange: [-10, 10] as [number, number],
      yRange: [-10, 10] as [number, number],
    },
  };
}

async function main() {
  for (let index = 0; index < CHALLENGE_COUNT; index++) {
    const date = new Date(START_DATE);
    date.setUTCDate(START_DATE.getUTCDate() + index);
    const challenge = buildChallenge(index);

    await pool.query(
      `
        INSERT INTO challenges (date, target_expressions, graph_data)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          target_expressions = VALUES(target_expressions),
          graph_data = VALUES(graph_data)
      `,
      [
        formatDate(date),
        JSON.stringify(challenge.targetExpressions),
        JSON.stringify(challenge.graphData),
      ]
    );
  }
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Failed to seed challenges:", error);
    await pool.end();
    process.exit(1);
  });
```

- [ ] **Step 3: Add an npm script**

Update `packages/server/package.json` scripts to include:

```json
"seed:challenges": "tsx src/scripts/seedChallenges.ts"
```

- [ ] **Step 4: Verify the fixed date range includes today**

Confirm that the 50-day range starting at `2026-03-01` includes `2026-03-20`.
Expected: it does, so seeded data will satisfy `/today` for the current rollout date.

- [ ] **Step 5: Inspect the schema for a unique key on `date`**

Run a SQL inspection command against the configured database to confirm whether `challenges.date` already has a unique index.
Expected: either an existing unique key is present or a schema change is clearly required.

- [ ] **Step 6: If no unique key exists, add one before relying on upsert**

Apply the minimal schema change needed so `ON DUPLICATE KEY UPDATE` is defined for `date`.

Example SQL:

```sql
ALTER TABLE challenges
ADD UNIQUE KEY challenges_date_unique (date);
```

Record the exact command used in the implementation notes because this repository does not currently contain a tracked schema migration file.

- [ ] **Step 7: Run the seed script**

Run: `pnpm --filter server seed:challenges`
Expected: completes without errors and upserts 50 rows.

- [ ] **Step 8: Verify row count for the seeded range**

Run a SQL count against the seeded date window.
Expected: exactly 50 rows exist for the seeded dates after the first run.

- [ ] **Step 9: Re-run the seed script**

Run: `pnpm --filter server seed:challenges`
Expected: PASS again.

- [ ] **Step 10: Verify idempotence**

Run the same SQL count again.
Expected: still exactly 50 rows exist for the seeded dates.

### Task 5: Update the extension to consume `selectedDate`

**Files:**
- Modify: `packages/extension/src/popup/main.ts:9-16`
- Modify: `packages/extension/src/popup/main.ts:231-240`
- Test: `packages/extension/src/popup/main.ts`

- [ ] **Step 1: Extend the popup-side challenge interface**

Update the local interface to include:

```ts
interface Challenge {
  targetExpressions: string[];
  graphData: {
    xRange?: [number, number];
    yRange?: [number, number];
  };
  date: string;
  selectedDate: string;
}
```

- [ ] **Step 2: Display the requested date, not the payload date**

Change the label logic from:

```ts
const dateStr = String(challenge.date).slice(0, 10);
```

to:

```ts
const dateStr = String(challenge.selectedDate).slice(0, 10);
```

- [ ] **Step 3: Build the extension package**

Run: `pnpm --filter extension build`
Expected: PASS

### Task 6: Verify seeded and fallback API behavior end-to-end

**Files:**
- Modify: `packages/server/src/routes/challenges.ts` only if defects are found during verification
- Test: local server runtime and configured MySQL database

- [ ] **Step 1: Start the server**

Run: `pnpm --filter server dev`
Expected: server starts successfully and listens on the configured port.

- [ ] **Step 2: Verify the seeded-today response**

Run:

```bash
curl -s http://localhost:3000/api/challenges/today
```

Expected JSON characteristics:
- `selectedDate` is today in UTC
- `date` matches `selectedDate`
- `id` is not `0`
- `targetExpressions` is a non-empty array

- [ ] **Step 3: Remove today’s row in a test database state**

Temporarily delete the row for today’s UTC date from the local/test database.
Expected: the database no longer has a direct match for today.

- [ ] **Step 4: Verify the fallback response**

Run again:

```bash
curl -s http://localhost:3000/api/challenges/today
```

Expected JSON characteristics:
- `selectedDate` is today in UTC
- `date` is `"1970-01-01"`
- `id` is `0`
- `targetExpressions` equals `["y=x"]`

- [ ] **Step 5: Restore seeded data**

Run: `pnpm --filter server seed:challenges`
Expected: today’s row is reinserted.

- [ ] **Step 6: Run final builds**

Run:
- `pnpm --filter server build`
- `pnpm --filter extension build`

Expected: both PASS
