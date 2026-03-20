# Target Graph Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the daily challenge's target graph in the extension popup using function-plot.

**Architecture:** Add function-plot as a dependency, add a graph container div to the popup HTML, and wire up rendering in main.ts after fetching the challenge. The server already returns `targetFunction` and `graphData` — we just need to render them.

**Tech Stack:** TypeScript, Vite, function-plot (d3-based), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-20-target-graph-display-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/extension/package.json` | Modify | Add function-plot dependency |
| `packages/extension/src/popup/index.html` | Modify | Add `#graph` container div |
| `packages/extension/src/popup/main.ts` | Modify | Import function-plot, render graph after challenge loads |

---

### Task 1: Add function-plot dependency

**Files:**
- Modify: `packages/extension/package.json`

- [ ] **Step 1: Install function-plot**

Run from the repo root:
```bash
pnpm --filter extension add function-plot
```
Expected: `function-plot` added to `dependencies` in `packages/extension/package.json`, lockfile updated.

- [ ] **Step 2: Verify the build still works**

```bash
pnpm --filter extension build
```
Expected: Build succeeds with no errors. Output in `packages/extension/dist/`.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/package.json pnpm-lock.yaml
git commit -m "feat: add function-plot dependency to extension"
```

---

### Task 2: Add graph container to popup HTML

**Files:**
- Modify: `packages/extension/src/popup/index.html:12-13`

- [ ] **Step 1: Add the graph div**

In `packages/extension/src/popup/index.html`, inside the `#challenge` div, add a `<div id="graph">` between the instruction text (line 13) and the check button (line 14):

```html
<div id="challenge" class="mt-4 hidden">
  <p class="text-sm text-gray-500">Match the target graph using Desmos functions.</p>
  <div id="graph" class="mt-3 rounded border border-gray-200 overflow-hidden"></div>
  <button id="check-btn" class="mt-3 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
    Check My Answer
  </button>
  <p id="result" class="mt-2 text-center font-semibold hidden"></p>
</div>
```

The `overflow-hidden` and `rounded border` classes give the graph a clean contained look. function-plot will set the width/height of the SVG it injects.

- [ ] **Step 2: Verify the build still works**

```bash
pnpm --filter extension build
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/popup/index.html
git commit -m "feat: add graph container div to popup HTML"
```

---

### Task 3: Render the target graph with function-plot

**Files:**
- Modify: `packages/extension/src/popup/main.ts`

- [ ] **Step 1: Add function-plot import and rendering logic**

Replace the contents of `packages/extension/src/popup/main.ts` with:

```typescript
import functionPlot from "function-plot";

const statusEl = document.getElementById("status")!;
const challengeEl = document.getElementById("challenge")!;
const checkBtn = document.getElementById("check-btn")!;
const resultEl = document.getElementById("result")!;

async function loadChallenge() {
  try {
    const res = await fetch("http://localhost:3000/api/challenges/today");
    if (!res.ok) throw new Error("Failed to fetch challenge");

    const challenge = await res.json();
    statusEl.textContent = `Challenge: ${challenge.date}`;
    challengeEl.classList.remove("hidden");

    renderTargetGraph(challenge);
  } catch {
    statusEl.textContent = "Could not load today's challenge.";
  }
}

function renderTargetGraph(challenge: {
  targetFunction: string;
  graphData?: { xRange?: [number, number]; yRange?: [number, number] };
}) {
  const xDomain = challenge.graphData?.xRange ?? [-10, 10];
  const yDomain = challenge.graphData?.yRange ?? [-10, 10];

  functionPlot({
    target: "#graph",
    width: 288,
    height: 200,
    grid: true,
    xAxis: { domain: xDomain },
    yAxis: { domain: yDomain },
    data: [
      {
        fn: challenge.targetFunction,
        color: "#2563eb",
      },
    ],
  });
}

checkBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "CHECK_FUNCTIONS" }, (response) => {
    if (response?.match) {
      resultEl.textContent = "Challenge Completed!";
      resultEl.className = "mt-2 text-center font-semibold text-green-600";
    } else {
      resultEl.textContent = "Not quite — keep trying!";
      resultEl.className = "mt-2 text-center font-semibold text-red-500";
    }
    resultEl.classList.remove("hidden");
  });
});

loadChallenge();
```

Key decisions:
- Width is `288` (320px popup - 32px padding) to fit within `w-80 p-4`
- Height is `200` — enough to see the graph shape clearly
- Blue color `#2563eb` matches the existing `bg-blue-600` button styling
- `renderTargetGraph` is a separate function for clarity
- `graphData` is typed inline since the Challenge type lives in the server package

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter extension build
```
Expected: Build succeeds. The popup.js bundle in `dist/` now includes function-plot.

- [ ] **Step 3: Manual verification**

Load the extension in Chrome (`chrome://extensions` → Load unpacked → `packages/extension/dist/`). Open a Desmos page, click the extension icon. If the server is running with a challenge that has a valid `targetFunction` (e.g., `"x^2"`), the graph should render in the popup.

If the server is not running, the popup should show "Could not load today's challenge." with no errors in the console related to function-plot.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/popup/main.ts
git commit -m "feat: render target challenge graph in popup using function-plot"
```
