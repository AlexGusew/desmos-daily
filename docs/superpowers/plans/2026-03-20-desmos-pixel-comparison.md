# Desmos Pixel Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace expr-eval point-sampling with Desmos-native pixel comparison so the extension can recognise any expression type Desmos can graph.

**Architecture:** The popup injects async functions into the Desmos page via `chrome.scripting.executeScript({ world: "MAIN" })`. These functions create a hidden offscreen Desmos calculator, render target/user expressions with identical settings, take screenshots via `asyncScreenshot`, and compare pixel output using Jaccard similarity on canvas `ImageData`.

**Tech Stack:** TypeScript, Vite, Chrome Extensions MV3, Desmos JS API (on-page), Canvas API

**Spec:** `docs/superpowers/specs/2026-03-20-desmos-pixel-comparison-design.md`

---

### Task 1: Update server types

**Files:**
- Modify: `packages/server/src/types.ts`

- [ ] **Step 1: Update the Challenge interface**

Replace the entire file contents with:

```typescript
export interface Challenge {
  id: number;
  date: string;
  targetExpressions: string[];
  graphData: {
    xRange?: [number, number];
    yRange?: [number, number];
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/types.ts
git commit -m "feat: update Challenge interface to targetExpressions array"
```

---

### Task 2: Update server route

**Files:**
- Modify: `packages/server/src/routes/challenges.ts`

- [ ] **Step 1: Update the SQL query and response mapping**

Replace the entire file contents with:

```typescript
import { Router } from "express";
import { pool } from "../db.js";
import type { Challenge } from "../types.js";
import type { RowDataPacket } from "mysql2";

const router = Router();

router.get("/today", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, date, target_expressions AS targetExpressions, graph_data AS graphData FROM challenges WHERE date = ?",
      [today]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "No challenge for today" });
      return;
    }

    const rawGraphData =
      typeof rows[0].graphData === "string"
        ? JSON.parse(rows[0].graphData)
        : rows[0].graphData ?? {};

    const rawExpressions =
      typeof rows[0].targetExpressions === "string"
        ? JSON.parse(rows[0].targetExpressions)
        : rows[0].targetExpressions;

    const challenge: Challenge = {
      id: rows[0].id,
      date: rows[0].date,
      targetExpressions: Array.isArray(rawExpressions)
        ? rawExpressions
        : [rawExpressions],
      graphData: rawGraphData,
    };

    res.json(challenge);
  } catch (err) {
    console.error("Failed to fetch today's challenge:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
```

- [ ] **Step 2: Build the server to verify no type errors**

Run: `pnpm --filter server build`
Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/types.ts packages/server/src/routes/challenges.ts
git commit -m "feat: server returns targetExpressions array from DB"
```

---

### Task 3: Remove old extension dependencies

**Files:**
- Modify: `packages/extension/package.json`

- [ ] **Step 1: Remove expr-eval and function-plot**

Run:
```bash
cd packages/extension && pnpm remove expr-eval function-plot && cd ../..
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/package.json pnpm-lock.yaml
git commit -m "chore: remove expr-eval and function-plot dependencies"
```

---

### Task 4: Update popup HTML

**Files:**
- Modify: `packages/extension/src/popup/index.html`

- [ ] **Step 1: Replace the graph div with an img element**

Change line 25 from:
```html
          <div id="graph"></div>
```
to:
```html
          <img id="graph-img" alt="Target graph" />
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/popup/index.html
git commit -m "feat: replace function-plot div with img for Desmos screenshots"
```

---

### Task 5: Update popup CSS

**Files:**
- Modify: `packages/extension/src/popup/style.css`

- [ ] **Step 1: Replace function-plot CSS rules with img styling**

Remove lines 104-137 (the `#graph` and function-plot SVG rules) and replace with:

```css
#graph-img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 0 0 12px 12px;
}
```

Keep everything else in the file unchanged.

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/popup/style.css
git commit -m "feat: replace function-plot CSS with graph-img styling"
```

---

### Task 6: Rewrite popup main.ts — target preview

**Files:**
- Modify: `packages/extension/src/popup/main.ts`

This is the largest change. We rewrite the popup logic in two steps: first the target preview rendering, then the check-match flow.

- [ ] **Step 1: Write the new main.ts with target preview**

Replace the entire file contents with:

```typescript
const statusEl = document.getElementById("status")!;
const challengeEl = document.getElementById("challenge")!;
const checkBtn = document.getElementById("check-btn")!;
const resultEl = document.getElementById("result")!;
const graphImg = document.getElementById("graph-img") as HTMLImageElement;

interface Challenge {
  targetExpressions: string[];
  graphData: {
    xRange?: [number, number];
    yRange?: [number, number];
  };
  date: string;
}

let currentChallenge: Challenge | null = null;

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function renderTargetPreview(
  tabId: number,
  challenge: Challenge
): Promise<string | null> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (
      expressions: string[],
      xRange: [number, number],
      yRange: [number, number]
    ) => {
      const Desmos = (window as any).Desmos;
      if (!Desmos) return null;

      const div = document.createElement("div");
      div.style.cssText =
        "width:800px;height:600px;position:absolute;left:-9999px;top:-9999px;";
      document.body.appendChild(div);

      let calc: any;
      try {
        calc = Desmos.GraphingCalculator(div, {
          expressions: false,
          settingsMenu: false,
          zoomButtons: false,
          keypad: false,
          autosize: false,
          border: false,
          showGrid: false,
          showXAxis: false,
          showYAxis: false,
        });
        calc.resize();
        calc.setMathBounds({
          left: xRange[0],
          right: xRange[1],
          bottom: yRange[0],
          top: yRange[1],
        });

        for (let i = 0; i < expressions.length; i++) {
          calc.setExpression({
            id: `target-${i}`,
            latex: expressions[i],
            color: "#000000",
          });
        }

        const png: string = await new Promise((resolve) => {
          calc.asyncScreenshot(
            {
              width: 400,
              height: 300,
              targetPixelRatio: 1,
              mode: "stretch",
              mathBounds: {
                left: xRange[0],
                right: xRange[1],
                bottom: yRange[0],
                top: yRange[1],
              },
            },
            resolve
          );
        });

        return png;
      } catch {
        return null;
      } finally {
        if (calc) calc.destroy();
        div.remove();
      }
    },
    args: [
      challenge.targetExpressions,
      challenge.graphData.xRange ?? [-10, 10],
      challenge.graphData.yRange ?? [-10, 10],
    ],
  });

  return results?.[0]?.result ?? null;
}

async function loadChallenge() {
  try {
    const res = await fetch("http://localhost:3000/api/challenges/today");
    if (!res.ok) throw new Error("Failed to fetch challenge");

    const challenge: Challenge = await res.json();
    currentChallenge = challenge;
    statusEl.textContent = challenge.date;
    challengeEl.classList.remove("hidden");

    const tab = await getActiveTab();
    if (!tab?.id) {
      graphImg.alt = "Open Desmos to see the target graph";
      return;
    }

    const png = await renderTargetPreview(tab.id, challenge);
    if (png) {
      graphImg.src = png;
    } else {
      graphImg.alt = "Could not render target graph";
    }
  } catch {
    statusEl.textContent = "Could not load today's challenge.";
  }
}

// Check match handler will be added in the next step
checkBtn.addEventListener("click", async () => {
  // placeholder — implemented in Task 7
});

loadChallenge();
```

- [ ] **Step 2: Build to verify no compile errors**

Run: `pnpm --filter extension build`
Expected: Compiles successfully (no function-plot/expr-eval imports).

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/popup/main.ts
git commit -m "feat: render target graph via injected Desmos screenshot"
```

---

### Task 7: Rewrite popup main.ts — check match with pixel comparison

**Files:**
- Modify: `packages/extension/src/popup/main.ts`

- [ ] **Step 1: Replace the placeholder click handler with the full comparison engine**

Replace the `checkBtn.addEventListener("click", ...)` block (the placeholder from Task 6) with:

```typescript
checkBtn.addEventListener("click", async () => {
  if (!currentChallenge) return;

  const tab = await getActiveTab();
  if (!tab?.id) return;

  resultEl.classList.remove("hidden", "success", "error");

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: async (
        targetExprs: string[],
        xRange: [number, number],
        yRange: [number, number]
      ) => {
        const Desmos = (window as any).Desmos;
        const Calc = (window as any).Calc;
        if (!Desmos || !Calc) return { match: false, score: 0, error: "Desmos API not found" };

        const userExpressions: string[] = Calc.getExpressions()
          .filter((e: any) => e.latex && e.type === "expression")
          .map((e: any) => e.latex);

        if (userExpressions.length === 0) return { match: false, score: 0 };

        const div = document.createElement("div");
        div.style.cssText =
          "width:800px;height:600px;position:absolute;left:-9999px;top:-9999px;";
        document.body.appendChild(div);

        let calc: any;
        try {
          calc = Desmos.GraphingCalculator(div, {
            expressions: false,
            settingsMenu: false,
            zoomButtons: false,
            keypad: false,
            autosize: false,
            border: false,
            showGrid: false,
            showXAxis: false,
            showYAxis: false,
          });
          calc.resize();

          const bounds = {
            left: xRange[0],
            right: xRange[1],
            bottom: yRange[0],
            top: yRange[1],
          };
          const shotOpts = {
            width: 400,
            height: 300,
            targetPixelRatio: 1,
            mode: "stretch" as const,
            mathBounds: bounds,
          };

          // Render target
          calc.setMathBounds(bounds);
          for (let i = 0; i < targetExprs.length; i++) {
            calc.setExpression({
              id: `t-${i}`,
              latex: targetExprs[i],
              color: "#000000",
            });
          }
          const targetPng: string = await new Promise((r) =>
            calc.asyncScreenshot(shotOpts, r)
          );

          // Render user
          calc.setBlank();
          calc.setMathBounds(bounds);
          for (let i = 0; i < userExpressions.length; i++) {
            calc.setExpression({
              id: `u-${i}`,
              latex: userExpressions[i],
              color: "#000000",
            });
          }
          const userPng: string = await new Promise((r) =>
            calc.asyncScreenshot(shotOpts, r)
          );

          // Pixel comparison
          const W = 400;
          const H = 300;

          async function loadImageData(dataUrl: string): Promise<Uint8ClampedArray> {
            const img = new Image();
            img.src = dataUrl;
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
            });
            const canvas = document.createElement("canvas");
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, W, H);
            return ctx.getImageData(0, 0, W, H).data;
          }

          const targetData = await loadImageData(targetPng);
          const userData = await loadImageData(userPng);

          let intersection = 0;
          let union = 0;

          for (let i = 0; i < targetData.length; i += 4) {
            const tDrawn = !(
              targetData[i] > 240 &&
              targetData[i + 1] > 240 &&
              targetData[i + 2] > 240
            );
            const uDrawn = !(
              userData[i] > 240 &&
              userData[i + 1] > 240 &&
              userData[i + 2] > 240
            );

            if (tDrawn || uDrawn) union++;
            if (tDrawn && uDrawn) intersection++;
          }

          const score = union === 0 ? 0 : intersection / union;
          console.log("[Desmos Daily] Pixel comparison score:", score);

          return { match: score >= 0.85, score };
        } catch (err: any) {
          return { match: false, score: 0, error: err?.message ?? "Unknown error" };
        } finally {
          if (calc) calc.destroy();
          div.remove();
        }
      },
      args: [
        currentChallenge.targetExpressions,
        currentChallenge.graphData.xRange ?? [-10, 10],
        currentChallenge.graphData.yRange ?? [-10, 10],
      ],
    });

    const result = results?.[0]?.result as
      | { match: boolean; score: number; error?: string }
      | undefined;

    if (result?.error) {
      resultEl.textContent = "Could not read Desmos. Is the calculator open?";
      resultEl.classList.add("error");
    } else if (result?.match) {
      resultEl.textContent = "Challenge Completed!";
      resultEl.classList.add("success");
    } else {
      resultEl.textContent = "Not quite — keep trying!";
      resultEl.classList.add("error");
    }
  } catch {
    resultEl.textContent = "Could not read Desmos. Is the calculator open?";
    resultEl.classList.add("error");
  }
});
```

- [ ] **Step 2: Build the extension to verify**

Run: `pnpm --filter extension build`
Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/popup/main.ts
git commit -m "feat: check match via Desmos pixel comparison engine"
```

---

### Task 8: Build and manual verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `pnpm build`
Expected: Both packages build with no errors.

- [ ] **Step 2: Verify the dist output**

Check that `packages/extension/dist/` contains `popup.js`, `content.js`, `background.js`, `manifest.json`, and `index.html`. Check that `popup.js` does NOT contain any `function-plot` or `expr-eval` references.

Run:
```bash
ls packages/extension/dist/
grep -l "function-plot\|expr-eval" packages/extension/dist/*.js || echo "No old deps found - OK"
```

- [ ] **Step 3: Manual test instructions**

To test the full flow:
1. Load the extension in Chrome: `chrome://extensions` -> Developer mode -> Load unpacked -> select `packages/extension/dist/`
2. Navigate to `https://www.desmos.com/calculator`
3. Click the Desmos Daily extension icon
4. The popup should show the target graph rendered as a Desmos screenshot
5. Enter matching expressions in Desmos
6. Click "Check Answer" — should report match/no-match with score logged to console

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Desmos pixel comparison implementation"
```
