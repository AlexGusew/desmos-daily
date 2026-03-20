# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desmos Daily is a Chrome browser extension that runs on the Desmos graphing calculator site (desmos.com). The user opens the extension while on Desmos, and it displays a daily graph challenge. The user creates functions directly in Desmos to try to match the target graph. The extension reads the current functions from the Desmos page, checks whether they match the daily challenge graph, and shows "challenge completed" when they do. A new challenge is presented each day.

## Tech Stack

- TypeScript, Vite, Tailwind CSS
- Chrome Extensions API (Manifest V3)
- Express + MySQL (backend API)
- pnpm workspaces (monorepo)

## Build Commands

```bash
pnpm install                    # install all dependencies
pnpm build                      # build all packages
pnpm --filter extension build   # build extension only (output: packages/extension/dist/)
pnpm --filter server build      # build server only (output: packages/server/dist/)
pnpm --filter extension dev     # watch-mode extension build
pnpm --filter server dev        # dev server with hot reload (tsx watch)
```

Load the extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `packages/extension/dist/`

## Architecture

Monorepo with two packages under `packages/`:

**`packages/extension`** — Chrome extension (Vite + Tailwind)
- `manifest.json` — Manifest V3 config; content script runs on `*.desmos.com/*`
- `src/popup/` — Extension popup UI (index.html, main.ts, style.css)
- `src/content.ts` — Content script injected into Desmos; reads calculator state and responds to CHECK_FUNCTIONS messages from the popup
- `src/background.ts` — Service worker

**`packages/server`** — Express API
- `src/index.ts` — App entry, CORS, JSON body parser, port 3000
- `src/db.ts` — mysql2 connection pool (configured via env vars)
- `src/routes/challenges.ts` — `GET /api/challenges/today` returns today's challenge
- `src/types.ts` — Shared `Challenge` interface
- `.env.example` — Template for DB connection env vars

**Communication flow:** Popup fetches today's challenge from the server API. When "Check My Answer" is clicked, the popup sends a `CHECK_FUNCTIONS` message to the content script, which reads the user's functions from Desmos and compares them to the challenge target.
