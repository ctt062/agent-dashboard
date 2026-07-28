# Agent Deck

![Agent Deck screenshot](./docs/Screenshot.png)

Local macOS dashboard for AI agent usage (Cursor, Claude Code, Codex), Mac resource meters, and your GitHub contribution calendar.

Runs entirely on your machine. Usage-reset lookups send your local Cursor, Codex, and Claude auth tokens from this Mac only to those vendors' usage APIs (api2.cursor.sh, auth.openai.com / chatgpt.com, api.anthropic.com) - not to Agent Deck or any other service.

![Agent Deck](https://img.shields.io/badge/platform-macOS-black) ![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Why localhost (not Vercel / public web)

Your machine is the source of truth:

- **Cursor** stats live in a local SQLite DB
- **Claude Code** / **Codex** sessions are local JSONL logs
- **CPU / GPU / Memory** only exist on this Mac
- **GitHub** calendar is fetched with your local `gh` auth

A remote host like Vercel cannot see those safely. This GitHub repo is only the source code. For phone viewing, keep the API on your Mac and open it over your LAN (below) - do not deploy the collectors to a public cloud.

## Download

### Option A - Clone with Git

```bash
git clone https://github.com/ctt062/agent-dashboard.git
cd agent-dashboard
npm install
npm run dev
```

### Option B - ZIP download (no Git)

1. Open https://github.com/ctt062/agent-dashboard
2. Click **Code → Download ZIP**
3. Unzip, then in that folder:

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5174**

### One-command production serve

Builds the UI and serves API + static UI from one localhost port:

```bash
npm install
npm run serve
```

Open **http://127.0.0.1:3847**

`npm start` alone also works after `npm run build` (serves `dist/` when present).

## View on your phone (same Wi-Fi)

Agent Deck is a local web app. Your Mac still runs the API; your phone just opens it in Safari/Chrome.

```bash
npm run serve:lan
```

The terminal prints a LAN URL like `http://192.168.x.x:3847`. Open that on your phone (same Wi-Fi). On iOS you can use **Share → Add to Home Screen** for an app-like icon.

Dev equivalent:

```bash
npm run dev:lan
```

Then open the printed Vite URL (port `5174`) on your phone.

Only do this on a trusted network - LAN mode exposes local agent + Mac metrics to devices on that Wi-Fi.

## Start at login (macOS)

```bash
npm run launchagent:install
```

This installs a LaunchAgent that keeps Agent Deck running on `http://127.0.0.1:3847` and opens it once. Remove with:

```bash
npm run launchagent:uninstall
```

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

- **Date range**: Today / 7 days / 30 days / This month for agent share and charts
- **Usage resets**: Per-provider token/limit reset times (Cursor billing cycle via local dashboard API, Codex ChatGPT wham/usage windows, Claude rolling 5h/weekly with `/usage` guidance when exact times are unavailable)
- **Detailed agent stats**: period total, avg/day, active days, peak day, acceptance rate (Cursor), input/output tokens
- **Dual-series charts** plus a cross-agent comparison chart
- **Local web app**: `npm run serve` on loopback, or `npm run serve:lan` for phone access on the same Wi-Fi
- **Cached collectors** (~10s TTL) with parallel collection; usage-reset lookups cache separately (~3 min). Refresh bypasses the collector cache

## Stack

- Vite + React + TypeScript UI
- Express API on port `3847` (Local Mac; also serves `dist/` after build)
- Collectors read local files / `top` / `ioreg` / `gh api`

## What the percentages mean

Agent % is **relative share** of a local activity score across Cursor, Claude Code, and Codex for the selected date range - not a vendor billing percentage.

| Agent | Primary signal |
|-------|----------------|
| Cursor | Accepted AI lines (`aiCodeTracking.dailyStats`) |
| Claude Code | Tokens from `~/.claude/projects/**/*.jsonl`, else message volume |
| Codex | Tokens from `~/.codex/sessions/**/*.jsonl`, else event volume |

## API

Default bind is `127.0.0.1`. Use `HOST=0.0.0.0` (or `npm run serve:lan`) for LAN/phone access.

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard?range=1d\|7d\|30d\|month` | Full payload (agents + system + GitHub). Add `refresh=1` to bypass cache. |
| `GET /api/system` | Mac snapshot only |
| `GET /api/health` | Liveness check |

Override host/port if needed:

```bash
HOST=0.0.0.0 PORT=4000 npm start
```

## Privacy

- Dashboard stats come from files and tools already on your Mac
- Usage-reset times use local Cursor / Codex / Claude credentials on this machine only to call those vendors' usage APIs; tokens are not sent to Agent Deck or any other service
- Default bind is localhost; `serve:lan` exposes the dashboard on your LAN - use only on trusted Wi-Fi
- The API has no open CORS; the Vite proxy and same-origin `serve` are enough for the UI
- Do not deploy this app to Vercel/public cloud - collectors require your Mac

## License

MIT - see [LICENSE](./LICENSE).
