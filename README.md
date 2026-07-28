# Agent Deck

![Agent Deck screenshot](./docs/Screenshot.png)

Local macOS dashboard for AI agent usage (Cursor, Claude Code, Codex), Mac resource meters, and your GitHub contribution calendar.

Runs entirely on your machine. Usage-reset lookups send your local Cursor, Codex, and Claude auth tokens from this Mac only to those vendors' usage APIs (api2.cursor.sh, auth.openai.com / chatgpt.com, api.anthropic.com) - not to Agent Deck or any other service.

![Agent Deck](https://img.shields.io/badge/platform-macOS-black) ![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Why the Mac still runs the API

Your machine is the source of truth:

- **Cursor** stats live in a local SQLite DB
- **Claude Code** / **Codex** sessions are local JSONL logs
- **CPU / GPU / Memory** only exist on this Mac
- **GitHub** calendar is fetched with your local `gh` auth

Collectors must stay on this Mac. You can host a **static UI** on Vercel (see below) that talks to the Mac API over a tunnel or LAN URL - do not deploy the collectors to a public cloud.

## Recommended setup (auto-start + dual auth)

You do **not** need `npm run dev` day to day. That is only for developers hacking on the UI.

1. Install once:

```bash
git clone https://github.com/ctt062/agent-dashboard.git
cd agent-dashboard
npm install
cp .env.example .env
```

2. Configure `.env`:

```bash
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
ALLOWED_EMAILS=you@gmail.com
DASHBOARD_PIN=your-phone-pin
PUBLIC_ORIGIN=https://agent-dashboard-ctt.vercel.app
```

Authorized JavaScript origins (Google Cloud Console) - Google GIS does **not** accept raw LAN IPs:

- `http://127.0.0.1:3847` and `http://localhost:3847` (production serve)
- `http://127.0.0.1:5174` and `http://localhost:5174` (`npm run dev`)
- `https://agent-dashboard-ctt.vercel.app` (or your `PUBLIC_ORIGIN`)

3. Build + install login auto-start:

```bash
npm run setup
```

`npm run setup` defaults to LAN bind (`HOST=0.0.0.0`) and refuses to install unless `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS`, and `DASHBOARD_PIN` are set.

After that, Agent Deck starts when you log into your Mac:

- Desktop / localhost and the Vercel UI origin use **Google** sign-in (verified email + allowlist).
- Phone on a raw LAN IP uses **PIN** sign-in (`DASHBOARD_PIN`).

`npm run dev` is optional (hot reload for coding). Prefer `npm run setup` for normal use.

## Optional: static UI on Vercel

Public UI: [https://agent-dashboard-ctt.vercel.app/](https://agent-dashboard-ctt.vercel.app/)

1. Deploy the Vite `dist/` (SPA rewrite is in `vercel.json`).
2. Point the UI at your Mac API with either:
   - build-time `VITE_API_BASE=https://your-mac-tunnel.example`, or
   - runtime `public/runtime-config.js` → `window.__AGENT_DECK_API_BASE__`
3. Prefer an **HTTPS tunnel** to the Mac when the UI is on HTTPS (browsers block mixed content to bare `http://192.168.x.x`).
4. On the Mac, keep `PUBLIC_ORIGIN=https://agent-dashboard-ctt.vercel.app` so CORS allows that origin + localhost only (no wildcard, no raw LAN origins).
5. Sign-in returns a **Bearer token** stored in the browser (`sessionStorage`) and sent as `Authorization: Bearer …`. Do not rely on third-party cookies for Vercel → Mac.

Collectors and `/api/*` still run on the Mac.

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

Agent Deck is a local web app. Your Mac still runs the API; your phone opens it in Safari/Chrome and signs in with the **PIN** (Google cannot authorize raw IP origins).

```bash
npm run serve:lan
```

The terminal prints a LAN URL like `http://192.168.x.x:3847`. Open that on your phone (same Wi-Fi) and enter `DASHBOARD_PIN`. On iOS you can use **Share → Add to Home Screen** for an app-like icon.

Dev equivalent:

```bash
npm run dev:lan
```

Then open the printed Vite URL (port `5174`) on your phone.

Only do this on a trusted network - LAN mode exposes local agent + Mac metrics to devices on that Wi-Fi.

## Start at login (macOS)

```bash
npm run setup
```

or only the LaunchAgent piece:

```bash
npm run launchagent:install
```

This keeps Agent Deck running (LAN-capable by default) and opens it once. Remove with:

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
- **Dual auth**: Google on localhost / `PUBLIC_ORIGIN`; PIN on LAN IPs; Bearer token for Vercel → Mac API; `ALLOWED_EMAILS` + `DASHBOARD_PIN` required for LAN bind
- **Local web app**: `npm run setup` auto-starts at login; `serve:lan` / LaunchAgent for phone on the same Wi-Fi
- **Cached collectors** (~10s TTL) with parallel collection; usage-reset lookups cache separately (~3 min). Refresh bypasses both caches

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
| `GET /api/auth/config` | Auth mode for this Host/Origin (`google` or `pin`) |

Override host/port if needed:

```bash
HOST=0.0.0.0 PORT=4000 npm start
```

## Privacy

- Dashboard stats come from files and tools already on your Mac
- Google sign-in uses Google Identity Services on localhost and `PUBLIC_ORIGIN`; LAN IPs use PIN instead
- Cross-origin Vercel UI uses Bearer tokens (not third-party cookies); Mac same-origin UI may still use session cookies
- When LAN bind is enabled, `ALLOWED_EMAILS` and `DASHBOARD_PIN` are required
- Failed PIN attempts are rate-limited in memory per client IP
- Usage-reset times use local Cursor / Codex / Claude credentials on this machine only to call those vendors' usage APIs; tokens are not sent to Agent Deck or any other service
- Default LaunchAgent bind is LAN-capable (`HOST=0.0.0.0`) - use only on trusted Wi-Fi
- CORS allowlists localhost + `PUBLIC_ORIGIN` only (no wildcard)
- Static UI may live on Vercel; collectors and the API stay on your Mac

## License

MIT - see [LICENSE](./LICENSE).
