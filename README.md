# Agent Deck

A terminal UI for your AI coding agents on this Mac.

Type `agent-deck` and a window shows **this billing cycle's plan usage** for Cursor, Grok (xAI), Claude Code, Gemini, and Codex: used % when the provider exposes it, whether local data is available, and a short hint when a collector has nothing to show.

Mac CPU / memory / GPU and a compact GitHub contribution line sit under the provider list. Collectors run in-process in the same command. No browser, no `127.0.0.1` server, and no LaunchAgent.

![Agent Deck](https://img.shields.io/badge/platform-macOS-black) ![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Quick start

```bash
git clone https://github.com/ctt062/agent-dashboard.git
cd agent-dashboard
npm install
npx agent-deck
```

That opens the terminal window. Use `q` to quit and `r` to refresh.

### ZIP (no Git)

1. Open https://github.com/ctt062/agent-dashboard
2. Click **Code → Download ZIP**
3. Unzip, then run `npm install` and `npx agent-deck`

### Useful commands

| Command | What it does |
|---------|----------------|
| `npx agent-deck` | Open the terminal UI (the product command) |
| `npx agent-deck --once` | Print provider status and exit |
| `npm start` | Same as `agent-deck` via tsx |
| `npm test` | Unit tests |

## What you get

- **Provider status** - plan % for this billing cycle when known, availability, and a hint when there is no local data
- **Mac meters** - CPU, memory, and GPU utilization
- **GitHub line** - this year's contribution count via local `gh` auth (sparkline for the last 7 days)

Missing collectors degrade gracefully. Each row shows a short hint instead of crashing.

## Requirements

- **macOS** (system collector uses `top` / `ioreg`)
- **Node.js 22+** (uses built-in `node:sqlite`)
- **[GitHub CLI](https://cli.github.com/)** authenticated (`gh auth status`) for the contribution calendar
- Optional local data for agent rows:
  - Cursor installed (reads `~/Library/Application Support/Cursor/...`)
  - Grok (xAI) sessions under `~/.grok/sessions/` (and `grok login` for plan %)
  - Claude Code logs under `~/.claude/projects/`
  - Gemini / Antigravity under `~/.gemini` or Antigravity app data
  - Codex sessions under `~/.codex/sessions/`

## How plan % works

The plan column for each agent is **vendor plan usage for this billing cycle** when the provider exposes it (for example Cursor's included Auto / API usage).

Daily activity used internally still follows **Cursor's billing-cycle start to now**, so other calendar windows do not pull the timeline backward.

Local signals on this Mac:

| Agent | Local signal |
|-------|----------------|
| Cursor | Agent transcripts / ACP sessions (and legacy accepted-line stats when present) |
| Grok (xAI) | Tokens from `~/.grok/sessions/**/updates.jsonl` turn completions, else turn volume |
| Claude Code | Tokens from `~/.claude/projects/**/*.jsonl`, else message volume |
| Gemini | Local Gemini / Antigravity footprint when present (plan % not yet available) |
| Codex | Tokens from `~/.codex/sessions/**/*.jsonl`, else event volume |

## Privacy

- Stats come from files and tools already on your Mac
- The TUI does not bind a network port
- Usage-reset / plan lookups use local Cursor, Codex, and Grok credentials on this machine only to call those vendors' usage APIs (`api2.cursor.sh`, `auth.openai.com` / `chatgpt.com`, `cli-chat-proxy.grok.com`) - not Agent Deck or any other service

## Stack

- Ink + React terminal UI launched by `agent-deck`
- Node/TypeScript collectors read local files / `top` / `ioreg` / `gh api`

## License

MIT - see [LICENSE](./LICENSE).
