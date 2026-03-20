# Display Target Challenge Graph in Extension Popup

## Problem

The extension popup fetches the daily challenge (including `targetFunction` and `graphData`) but only displays the date. Users have no visual reference for what graph they need to match.

## Solution

Render the target challenge graph in the popup using **function-plot**, a lightweight (~50KB) math function graphing library built on d3.

## Data Flow

```
Server API → { targetFunction: "x^2", graphData: { xRange: [-10, 10], yRange: [-10, 10] } }
    ↓
popup/main.ts fetches challenge
    ↓
Parse targetFunction → function-plot data format: { fn: "x^2" }
    ↓
Render into #graph div via functionPlot({ target, data, xAxis, yAxis })
```

## Changes

### `packages/extension/package.json`

Add `function-plot` as a dependency.

### `packages/extension/src/popup/index.html`

Add a `<div id="graph">` container between the instruction text and the "Check My Answer" button. Container sized at ~300x200px to fit within the existing `w-80` (320px) popup width.

### `packages/extension/src/popup/main.ts`

After fetching the challenge:

1. Parse `targetFunction` string into function-plot's `fn` format
2. Extract viewport bounds from `graphData` if present (`xRange`, `yRange`), otherwise default to `[-10, 10]`
3. Call `functionPlot()` to render the graph into `#graph`

```typescript
import functionPlot from "function-plot";

// Inside loadChallenge(), after receiving the challenge:
functionPlot({
  target: "#graph",
  width: 300,
  height: 200,
  grid: true,
  xAxis: { domain: challenge.graphData?.xRange ?? [-10, 10] },
  yAxis: { domain: challenge.graphData?.yRange ?? [-10, 10] },
  data: [{ fn: challenge.targetFunction, color: "#2563eb" }],
});
```

### `packages/extension/vite.config.ts`

May need adjustments if function-plot or d3 requires special bundling for the Chrome extension context. Verify during implementation.

## Viewport Configuration

The `graphData` field (type `Record<string, unknown>`) can optionally contain:

- `xRange: [number, number]` — x-axis domain (default: `[-10, 10]`)
- `yRange: [number, number]` — y-axis domain (default: `[-10, 10]`)

These are optional. If not provided, the graph renders with default bounds.

## Constraints

- Popup width remains `w-80` (320px); graph fits within padding
- function-plot renders to SVG, so the graph is crisp at any resolution
- No new Chrome extension permissions required
- Requires the server to be running (same as current behavior for fetching challenges)
