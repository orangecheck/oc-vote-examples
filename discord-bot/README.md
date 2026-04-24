# discord-bot — oc-vote tally bot for Discord

Minimal Discord bot that reads OC Vote tallies and renders them as embeds. Two slash commands:

- `/poll <id>` — fetch the tally for a single poll and post an embed with the bar chart.
- `/poll-watch <id>` — same, but update the embed every 5 minutes until the poll's deadline passes, then post one final message and stop.

No database. No persistent state beyond the in-memory watch list. Stateless by design — restart kills active watches (list them again after startup).

## Setup

```bash
cd discord-bot
yarn install
cp .env.example .env
# fill in DISCORD_TOKEN + DISCORD_APP_ID + DISCORD_GUILD_ID
yarn register   # one-time: register slash commands with Discord
yarn start
```

Create a bot at <https://discord.com/developers/applications>. Needs the `applications.commands` scope. Minimum bot permission: `Send Messages`.

## Env

| Var | Required | What |
|---|---|---|
| `DISCORD_TOKEN` | yes | bot token |
| `DISCORD_APP_ID` | yes | application id (Discord Dev Portal → General Information) |
| `DISCORD_GUILD_ID` | no | if set, registers commands to one guild (instant); otherwise registers globally (~1 hour propagation) |
| `TALLY_BASE_URL` | no | defaults to `https://vote.ochk.io/api/tally`. Override for self-hosted |

## How it talks to OC Vote

Just HTTP GET against `vote.ochk.io/api/tally?poll=<id>`. No Bitcoin node, no Nostr client — the web app is already doing the heavy lifting and caching responses at the edge for 60s. If you want independent verification, use the `@orangecheck/vote-cli` instead:

```ts
import { exec } from 'node:child_process';
exec(`npx -y @orangecheck/vote-cli tally ${pollId} --json`, ...);
```

## File map

```
src/
├── index.ts         bot entrypoint; wires up gateway + interaction handler
├── commands.ts      slash command definitions (for /poll and /poll-watch)
├── register.ts      one-shot: register slash commands with Discord's API
├── render.ts        tally → Discord embed (bars, percentages, state)
└── watch.ts         in-memory poll-watch scheduler
```
