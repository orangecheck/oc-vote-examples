# offline-tally — count a poll from its signed record

Counts an OC Vote poll from files: the signed poll and every signed ballot. Each BIP-322 signature is checked on your machine with [`@orangecheck/bip322`](https://npmjs.com/package/@orangecheck/bip322), and the count is [`@orangecheck/vote-core`](https://npmjs.com/package/@orangecheck/vote-core)'s `tally`, the same function vote.ochk.io and `oc-vote` run. No tally service is asked, so a result here does not depend on vote.ochk.io being up or honest.

The record of a real poll is committed under [`polls/9825268c…/`](./polls/9825268c74a3a15baefe8f9705f774cc7bb97205922fc828df3b377e0e158a18): "Do you believe that hyper-bitcoinization will happen in the next 25 years?", closed 2026-05-05, one ballot, signed with a P2TR address, copied from the five relays on 2026-11-11.

## Run it

Node 22 or later.

```bash
cd offline-tally
yarn install
POLL=9825268c74a3a15baefe8f9705f774cc7bb97205922fc828df3b377e0e158a18
yarn tally polls/$POLL/poll.json polls/$POLL/ballots.json
```

It prints the count as JSON:

```json
{
  "poll_id": "9825268c74a3a15baefe8f9705f774cc7bb97205922fc828df3b377e0e158a18",
  "state": "tallied",
  "snapshot_block": 947961,
  "turnout": { "voters": 1, "weight": 12311 },
  "tallies": { "yes": 12311, "no": 0 },
  "counted": ["1d10e1e5e108894285d74a11790860444fde0c51d180611006c6204360175164"],
  "rejected": []
}
```

`counted` lists the ballot that stood for each voter. `rejected` lists every ballot copy whose shape or signature fails, with its code (`E_BAD_SIG` for a signature that does not verify). Exit 0 on a count, 3 when the explorer did not give a voter's coins (no count; run it again), 1 on anything else, a poll whose signature fails included.

Weights depend on coins. A poll's weight counts each voter's coins that are unspent now and were confirmed at or before the snapshot block, as vote.ochk.io and `oc-vote` count them, so a voter who spends changes the weight. Who counted does not change.

## What it trusts

- **The files.** A ballot left out of `ballots.json` is not counted, and nothing here can tell. Signatures stop anyone from forging or changing a ballot; they cannot show one is missing. Read the ballots from more than one relay: kind 30081 with `#t: [<poll_id>]` (SPEC §3.6).
- **The explorer**, for block times and coins: `https://mempool.space/api`, named in plaintext. Use your own instance with `--mempool-base https://your-mempool/api`.

## What it does not count

- **Anchored polls**, every poll whose deadline is on or after 2026-11-15. Their ballots count by Bitcoin anchors (SPEC §4.6), which this example does not read. It says so and stops.
- **Secret polls.** It says so and stops.

For both, `npx -y @orangecheck/vote-cli tally <poll_id>` reads the relays and the anchors itself and verifies everything locally.

## Files

```
src/
├── offline-tally.ts   verify the poll, count the ballots, list the ones that fail
├── chain.ts           snapshot block and coins from a mempool.space-compatible explorer
└── cli.ts             yarn tally <poll.json> <ballots.json>
test/
└── offline-tally.test.ts   the committed record with a fixed chain, offline
polls/<poll_id>/       poll.json and ballots.json, as the relays serve them
```

`yarn test` counts the committed record with a fixed chain, and checks that a ballot or a poll with one signature byte changed does not count. CI runs it on every push, and every Monday `live.yml` counts the record against the real chain and checks it agrees with `oc-vote tally` and vote.ochk.io's `/api/tally`.
