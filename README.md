# Agent Deck

![Agent Deck screenshot](./docs/Screenshot.png)

Local macOS dashboard for AI agent usage (Cursor, Claude Code, Codex), Mac resource meters, and your GitHub contribution calendar.

Runs entirely on your machine at **http://127.0.0.1:3847**. No cloud host and no sign-in - open the URL and the dashboard loads.

Usage-reset lookups send your local Cursor, Codex, and Claude auth tokens from this Mac only to those vendors' usage APIs (api2.cursor.sh, auth.openai.com / chatgpt.com, api.anthropic.com) - not to Agent Deck or any other service.

![Agent Deck](https://img.shields.io/badge/platform-macOS-black) ![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Why localhost

Your machine is the source of truth:

- **Cursor** stats live in a local SQLite DB
- **Claude Code** / **Codex** sessions are local JSONL logs
- **CPU / GPU / Memory** only exist on this Mac
- **GitHub** calendar is fetched with your local `gh` auth

Collectors must stay on this Mac. This app is **localhost-only**.

## Recommended setup

```bash
git clone https://github.com/ctt062/agent-dashboard.git
cd agent-dashboard
npm install
npm run setup
```

That builds the UI, installs a macOS LaunchAgent so Agent Deck starts at login, and opens **http://127.0.0.1:3847**.

`npm run dev` is optional (hot reload for coding).

## Download

### ZIP (no Git)

1. Open https://github.com/ctt062/agent-dashboard
2. Click **Code → Download ZIP**
3. Unzip, then `npm install` and `npm run setup`.

### One-command production serve

```bash
npm run serve
```

Open **http://127.0.0.1:3847**.

`npm start` alone also works after `npm run build`. Hot-reload coding: `npm run dev` → **http://127.0.0.1:5174**.

## Start at login (macOS)

```bash
npm run setup
```

LaunchAgent only: `npm run launchagent:install`  
Remove: `npm run launchagent:uninstall`

## Requirements

- **macOS** (system collector uses `top` / `ioreg`)
- **Node.js 22+** (uses built-in `node:sqlite`)
- **[GitHub CLI](https://cli.github.com/)** authenticated (`gh auth status`) for the contribution calendar
- Optional local data for agent panels:
  - Cursor installed (reads `~/Library/Application Support/Cursor/...`)
  - Claude Code logs under `~/.claude/projects/`
  - Codex sessions under `~/.codex/sessions/`

Missing collectors degrade gracefully - each panel shows a short hint instead of crashing.

## Features

- **Billing cycle view**: Plan usage % / limits plus relative agent activity for each provider’s current billing window
- **Usage resets**: Per-provider token/limit reset times
- **Detailed agent stats**: period total, avg/day, active days, peak day, acceptance rate (Cursor), input/output tokens
- **Dual-series charts** plus a cross-agent comparison chart
- **Auto-start** at login via `npm run setup`
- **Cached collectors** (~10s TTL) with parallel collection; usage-reset lookups cache separately (~3 min)

## Stack

- Vite + React + TypeScript UI
- Express API on port `3847` (also serves `dist/` after build)
- Collectors read local files / `top` / `ioreg` / `gh api`

## What the percentages mean

Agent % is **relative share** of a local activity score across Cursor, Claude Code, and Codex for the selected date range - not a vendor billing percentage.

| Agent | Primary signal |
|-------|----------------|
| Cursor | Accepted AI lines when present; otherwise Agent transcript / ACP session volume |
| Claude Code | Tokens from `~/.claude/projects/**/*.jsonl`, else message volume |
| Codex | Tokens from `~/.codex/sessions/**/*.jsonl`, else event volume |

## API

Bind is `127.0.0.1` only. Non-loopback `HOST` values are rejected.

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard` | Full payload for this billing cycle (agents + system + GitHub). Add `refresh=1` to bypass cache. |
| `GET /api/system` | Mac snapshot only. |
| `GET /api/health` | Liveness check. |

## Privacy

- Dashboard stats come from files and tools already on your Mac
- Bound to localhost only - not exposed on your LAN or the public internet
- Usage-reset times use local Cursor / Codex / Claude credentials on this machine only to call those vendors' usage APIs

## License

MIT - see [LICENSE](./LICENSE).
