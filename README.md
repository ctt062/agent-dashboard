# Agent Deck

Personal localhost dashboard for AI agent usage, Mac resource meters, and GitHub contributions.

## Why localhost (not Vercel / public web)

This machine is the source of truth:

- **Cursor** stats live in a local SQLite DB
- **Claude Code** / **Codex** sessions are local JSONL logs
- **CPU / GPU / Memory** only exist on this Mac
- **GitHub** calendar is fetched with your local `gh` auth

A public host cannot see those safely. Keep the app on `127.0.0.1`. The GitHub repo is just the code.

## Stack

- Vite + React + TypeScript UI (black minimalist)
- Tiny Express API on port `3847`
- Collectors read local files / `top` / `ioreg` / `gh api`

## Setup

```bash
cd ~/github/agent-dashboard
npm install
npm run dev
```

Open **http://127.0.0.1:5174**

Requires:

- Node 22+ (uses `node:sqlite`)
- `gh` authenticated (`gh auth status`)
- macOS (system collector)

## What the percentages mean

Agent % is **relative share** of a local activity score across Cursor, Claude Code, and Codex on this Mac - not a vendor billing percentage.

| Agent | Primary signal |
|-------|----------------|
| Cursor | Accepted AI lines (`aiCodeTracking.dailyStats`) + chat volume |
| Claude Code | Tokens from `~/.claude/projects/**/*.jsonl`, else message volume |
| Codex | Tokens from `~/.codex/sessions/**/*.jsonl`, else event volume |

## API

- `GET /api/dashboard` - full payload
- `GET /api/system` - Mac snapshot only
- `GET /api/health`

## Privacy

Nothing is uploaded by this app. Do not expose port 3847 beyond localhost.
