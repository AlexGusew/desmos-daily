# Desmos Pixel Comparison — Expression Recognition Design

## Problem

The extension currently matches user expressions against challenges using `expr-eval` point sampling. This only works for `y = f(x)` style functions. It cannot handle implicit equations (`y(y+x^2-6)=0`), domain restrictions (`\left\{6-x^2\ge0\right\}`), parametric curves, polar plots, inequalities, or any other advanced Desmos expression type.

## Goal

Support **any expression type Desmos can graph** by using Desmos's own rendering for comparison instead of reimplementing math evaluation.

## Approach: In-Page Hidden Calculator + Pixel Comparison

Since the extension runs on desmos.com, the Desmos API (`window.Desmos`) is already available in the page's MAIN world. The popup injects comparison logic into the MAIN world via `chrome.scripting.executeScript` (the same pattern the codebase already uses), creates a hidden offscreen Desmos calculator instance, renders both target and user expressions, takes screenshots, and compares pixel output.

## Execution Context Architecture

Chrome content scripts in the ISOLATED world cannot access `window.Desmos` or `window.Calc`. Chrome extension APIs (`chrome.runtime`, etc.) are not available in the MAIN world. The existing codebase already solves this by using `chrome.scripting.executeScript({ world: "MAIN" })` from the popup.

**This design keeps the same pattern.** All Desmos API interaction runs inside functions passed to `chrome.scripting.executeScript` with `world: "MAIN"`. The popup orchestrates the flow. The content script (`content.ts`) remains minimal (just a log statement, as it is today). The `scripting` and `activeTab` permissions remain required in `manifest.json`.

The injected functions are `async` — `chrome.scripting.executeScript` in MV3 supports async functions and resolves with the returned value.

## Data Model Changes

### Challenge interface

```typescript
// Before
interface Challenge {
  id: number;
  date: string;
  targetFunction: string;          // expr-eval format: "x^2 + 3"
  graphData: Record<string, unknown>;
}

// After
interface Challenge {
  id: number;
  date: string;
  targetExpressions: string[];     // Desmos LaTeX: ["y\\left(y+x^{2}-6\\right)=0\\left\\{6-x^{2}\\ge0\\right\\}"]
  graphData: {
    xRange?: [number, number];     // viewport left/right, default [-10, 10]
    yRange?: [number, number];     // viewport bottom/top, default [-10, 10]
  };
}
```

Default viewport: if `xRange` or `yRange` is missing or malformed, use `[-10, 10]`.

### Database

Rename column `target_function` to `target_expressions`. Store a JSON array of Desmos LaTeX strings. This is a clean break — there is no production data to migrate. Any existing dev/test rows should be re-created with the new format.

### API

`GET /api/challenges/today` returns `targetExpressions: string[]` instead of `targetFunction: string`. The query aliases `target_expressions AS targetExpressions`.

## Comparison Engine

Runs in the page's MAIN world, injected by the popup via `chrome.scripting.executeScript({ world: "MAIN" })`.

### Step 1 — Create hidden calculator

- Check that `window.Desmos` exists. If not, throw an error.
- Create an offscreen div: `position: absolute; left: -9999px; top: -9999px; width: 800px; height: 600px`
- Instantiate with all UI and grid disabled to isolate expression curves:
  ```
  Desmos.GraphingCalculator(div, {
    expressions: false, settingsMenu: false, zoomButtons: false,
    keypad: false, autosize: false, border: false,
    showGrid: false, showXAxis: false, showYAxis: false
  })
  ```
- Call `calc.resize()`
- Wrap the entire engine in a `try/catch` — on any error (including `GraphingCalculator` instantiation failure), destroy the calculator, remove the div, and return `{ match: false, error: string }`.

### Step 2 — Render target

- `calc.setMathBounds({ left: xRange[0], right: xRange[1], bottom: yRange[0], top: yRange[1] })`
- Set ALL target expressions before screenshotting: `calc.setExpression({ id: 'target-N', latex, color: '#000000' })` for each
- Use `asyncScreenshot` with a **Promise wrapper** (the Desmos API uses a callback pattern):
  ```typescript
  const targetPng = await new Promise<string>(resolve => {
    calc.asyncScreenshot(
      { width: 400, height: 300, targetPixelRatio: 1, mode: 'stretch',
        mathBounds: { left: xRange[0], right: xRange[1], bottom: yRange[0], top: yRange[1] } },
      resolve
    );
  });
  ```

### Step 3 — Render user graph

- `calc.setBlank()`
- Read user expressions: `window.Calc.getExpressions().filter(e => e.latex && e.type === 'expression')`
- Set ALL user expressions before screenshotting: `calc.setExpression({ id: 'user-N', latex: e.latex, color: '#000000' })` for each — normalize to black
- `asyncScreenshot(...)` with identical dimensions and mathBounds → user PNG data URL

### Step 4 — Pixel comparison

- Draw both PNGs onto offscreen `<canvas>` elements (400x300)
- `ctx.getImageData(0, 0, 400, 300)` for both
- Since grid/axes are disabled, background is plain white. For each pixel, classify as "drawn" or "background":
  - Background = pixel is close to white (R,G,B all > 240)
  - Drawn = everything else
- Compute Jaccard similarity: `|targetDrawn ∩ userDrawn| / |targetDrawn ∪ userDrawn|`
- Match if score >= 0.85 (85%)
- **Note:** The 85% threshold is provisional and needs calibration testing. During development, log the score for correct/incorrect answers to tune the threshold. Consider testing: exact match, slight offset (`x^2` vs `x^2+0.5`), completely wrong, and partial match.

### Step 5 — Cleanup

- `calc.destroy()`
- Remove offscreen div from DOM
- Return `{ match: boolean, score: number }` to popup

## Popup Changes

### Target preview

The popup no longer renders the graph itself. Instead:

1. Popup calls `chrome.scripting.executeScript({ world: "MAIN" })` with an async function that:
   - Creates a hidden Desmos calculator (same as comparison engine Step 1)
   - Sets target expressions and math bounds
   - Calls `asyncScreenshot` (Promise-wrapped) to get a PNG data URL
   - Cleans up and returns the data URL
2. Popup displays the returned data URL in an `<img>` element inside the `#graph` div

### Check flow

1. User clicks "Check My Answer"
2. Popup calls `chrome.scripting.executeScript({ world: "MAIN" })` with an async function that runs the full comparison engine (Steps 1-5), passing `targetExpressions` and `graphData` as `args`
3. Returns `{ match: boolean, score: number }`
4. Popup displays "Challenge Completed!" or "Not quite — keep trying!"

### Dependencies removed

- `expr-eval` — no longer needed (remove from package.json)
- `function-plot` — no longer needed (remove from package.json)

## Files Changed

1. `packages/server/src/types.ts` — update Challenge interface (`targetFunction` → `targetExpressions: string[]`, typed `graphData`)
2. `packages/server/src/routes/challenges.ts` — update query column name (`target_expressions AS targetExpressions`) and response mapping
3. `packages/extension/src/content.ts` — no changes needed (stays as a minimal log statement)
4. `packages/extension/src/popup/main.ts` — remove function-plot/expr-eval imports, replace `renderTargetGraph` with injected Desmos screenshot, replace `checkMatch`/`latexToExprEval` with injected comparison engine
5. `packages/extension/src/popup/index.html` — replace `<div id="graph"></div>` with `<img id="graph-img" />` (or keep div and insert img dynamically)
6. `packages/extension/src/popup/style.css` — remove function-plot-specific CSS rules (lines 110-137: `.function-plot`, SVG axis/grid rules)
7. `packages/extension/package.json` — remove `expr-eval` and `function-plot` dependencies

## Key Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Screenshot size | 400x300px | Enough detail for comparison, fast to process |
| targetPixelRatio | 1 | No need for HiDPI in pixel comparison |
| Expression color | #000000 (black) | Normalize so color choice doesn't affect matching |
| Grid/axes | Disabled | Eliminates noise from grid lines in comparison |
| Background threshold | R,G,B all > 240 | Catches white background and near-white anti-aliasing |
| Match threshold | 85% Jaccard (provisional) | Needs calibration — log scores during development |
| Default viewport | [-10, 10] x [-10, 10] | Fallback when graphData ranges are missing |

## Edge Cases

- **User has no expressions**: Score = 0, no match
- **User has extra expressions**: They'll add drawn pixels, reducing Jaccard score. Acceptable — the user should match the target, not add extras
- **Desmos API not available**: Injected function checks for `window.Desmos` before proceeding. Returns `{ match: false, error: "Desmos API not found" }` if missing. Popup shows "Could not read Desmos. Is the calculator open?"
- **GraphingCalculator instantiation failure**: Wrapped in try/catch. Returns error to popup.
- **Viewport mismatch**: Both screenshots use identical `setMathBounds` and `asyncScreenshot` mathBounds, so viewport is always matched
- **Slow expression evaluation**: `asyncScreenshot` waits for all expression evaluation to complete before capturing
- **Missing graphData ranges**: Fall back to `[-10, 10]` for both axes
