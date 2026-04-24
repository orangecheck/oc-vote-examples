# oc-vote-examples

Copy-forkable integrations of [OC Vote](https://github.com/orangecheck/oc-vote-protocol) into real-world platforms. Each subdirectory is a standalone template — fork, replace the placeholder poll id / Discord token / whatever, ship.

## What's in here

| Path | What it is |
|---|---|
| [`discord-bot/`](./discord-bot) | A minimal Discord bot that reads tallies and renders them as Discord embeds. Slash commands: `/poll <id>` (one-shot tally), `/poll-watch <id>` (subscribe to periodic updates until deadline). |
| [`github-action-gate/`](./github-action-gate) | A reusable GitHub Action that gates a job on a poll's tally. Wait for deadline, run the canonical tally function, exit 0 if `yes > no` (configurable), exit 1 otherwise. |
| [`shell/`](./shell) | One-liner `oc-vote` + `jq` recipes. No build required — just npx. |

## Shared assumptions

- You have a **Bitcoin wallet** (UniSat, Xverse, Leather, OKX, Phantom) capable of BIP-322 signing, or any offline BIP-322 signer. The CLI accepts signatures interactively or via `--sig`.
- You have a **poll id** — either one you created at [vote.ochk.io/create](https://vote.ochk.io/create) or one someone else published.
- For the Discord bot you have a **Discord application + bot token**. For the GH Action, nothing — it's a plain runner.

## How the protocol decouples

The point of these templates is to show how thin the integration is. OC Vote's data lives on Nostr; the tally is a pure function; every example here is about three things:

1. Ask `/api/tally` for the result (or run the CLI yourself).
2. Render the result in whatever surface you own.
3. Act on it (grant role, merge PR, send email, allocate funds).

Nothing in this repo is load-bearing for the protocol. These are UI patterns, not protocol extensions.

## Running locally

Each subdirectory has its own `README.md`. None of them share deps; cd in, follow the instructions.

## License

MIT. Fork freely.

## Related

- **Protocol**: [`orangecheck/oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol)
- **Web client**: [`vote.ochk.io`](https://vote.ochk.io)
- **Library**: [`@orangecheck/vote-core`](https://npmjs.com/package/@orangecheck/vote-core)
- **CLI**: [`@orangecheck/vote-cli`](https://npmjs.com/package/@orangecheck/vote-cli)
- **Integration docs**: [`vote.ochk.io/docs/integration`](https://vote.ochk.io/docs/integration)
