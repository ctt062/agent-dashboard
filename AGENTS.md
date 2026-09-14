# Project agent memory

Agent Deck is a terminal UI, not a localhost web app. The product command is `agent-deck` (`bin/agent-deck.js` → `tui/cli.ts`). Collectors stay in `server/collectors/` and are called in-process via `server/lib/dashboard.ts`. Do not reintroduce an Express/Vite dashboard, LaunchAgent auto-start, or `127.0.0.1` serve path.

- Tests: `npm test` (status rendering in `tui/status.test.ts`, CLI in `tui/cli.test.ts`)
- Typecheck: `npm run build` (`tsc --noEmit`)

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
