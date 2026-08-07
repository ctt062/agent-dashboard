# Agent Deck

![Agent Deck screenshot](./docs/Screenshot.png)

A local macOS dashboard for your AI coding agents.

See **this billing cycle’s plan usage** for Cursor, Grok (xAI), Claude Code, Gemini, and Codex as circular meters, plus a cumulative usage chart. Also shows Mac CPU / memory / GPU and your GitHub contribution heatmap.

Runs only on your machine at **http://127.0.0.1:3847**. No cloud host and no sign-in - open the URL and the dashboard loads. This app is **localhost-only**.

![Agent Deck](https://img.shields.io/badge/platform-macOS-black) ![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Quick start

```bash
git clone https://github.com/ctt062/agent-dashboard.git
cd agent-dashboard
npm install
npm run setup
```

That builds the UI, installs a macOS LaunchAgent so Agent Deck starts at login, and opens **http://127.0.0.1:3847**.

### ZIP (no Git)

1. Open https://github.com/ctt062/agent-dashboard
2. Click **Code → Download ZIP**
3. Unzip, then run `npm install` and `npm run setup`

### Useful commands

| Command | What it does |
|---------|----------------|
| `npm run setup` | Build + install LaunchAgent (recommended) |
| `npm run serve` | Build and serve once at **http://127.0.0.1:3847** |
| `npm run dev` | Hot-reload API + UI (dev UI at **http://127.0.0.1:5174**) |
| `npm run launchagent:uninstall` | Remove the login auto-start agent |

## What you get

- **Billing-cycle plan meters** - one circle per agent with used % in the center
- **Harness picker** - show or hide Cursor, Grok (xAI), Claude, Gemini, and Codex (saved locally; defaults to Cursor + Grok + Codex)
- **Cumulative usage chart** - monochrome lines from Cursor’s billing-cycle start to now
- **Light / dark mode** - toggle next to Refresh; preference is saved locally
- **Mac meters** - CPU, memory, and GPU utilization
- **GitHub heatmap** - last year of contributions via local `gh` auth
- **Auto-start at login** via LaunchAgent

Missing collectors degrade gracefully. Each panel shows a short hint instead of crashing.

## Requirements

- **macOS** (system collector uses `top` / `ioreg`)
- **Node.js 22+** (uses built-in `node:sqlite`)
- **[GitHub CLI](https://cli.github.com/)** authenticated (`gh auth status`) for the contribution calendar
- Optional local data for agent panels:
  - Cursor installed (reads `~/Library/Application Support/Cursor/...`)
  - Grok (xAI) sessions under `~/.grok/sessions/` (and `grok login` for plan %)
  - Claude Code logs under `~/.claude/projects/`
  - Gemini / Antigravity under `~/.gemini` or Antigravity app data
  - Codex sessions under `~/.codex/sessions/`

## How plan % works

The big circle for each agent is **vendor plan usage for this billing cycle** when the provider exposes it (for example Cursor’s included Auto / API usage).

The shared chart X-axis follows **Cursor’s billing-cycle start → now**, so other calendar windows do not pull the timeline backward.

Daily activity under the chart is built from local logs on this Mac:

| Agent | Local signal |
|-------|----------------|
| Cursor | Agent transcripts / ACP sessions (and legacy accepted-line stats when present) |
| Grok (xAI) | Tokens from `~/.grok/sessions/**/updates.jsonl` turn completions, else turn volume |
| Claude Code | Tokens from `~/.claude/projects/**/*.jsonl`, else message volume |
| Gemini | Local Gemini / Antigravity footprint when present (plan % not yet available) |
| Codex | Tokens from `~/.codex/sessions/**/*.jsonl`, else event volume |

## Privacy

- Dashboard stats come from files and tools already on your Mac
- Bound to **127.0.0.1 only** - not exposed on your LAN or the public internet
- Usage-reset / plan lookups use local Cursor, Codex, and Grok credentials on this machine only to call those vendors’ usage APIs (`api2.cursor.sh`, `auth.openai.com` / `chatgpt.com`, `cli-chat-proxy.grok.com`) - not Agent Deck or any other service

## API

Bind is `127.0.0.1` only. Non-loopback `HOST` values are rejected at startup.

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard` | Full payload for this billing cycle (agents + system + GitHub). Add `refresh=1` to bypass cache. |
| `GET /api/system` | Mac snapshot only. |
| `GET /api/health` | Liveness check. |

## Stack

- Vite + React + TypeScript UI
- Express API on port `3847` (also serves `dist/` after build)
- Collectors read local files / `top` / `ioreg` / `gh api`

## License

MIT - see [LICENSE](./LICENSE).
