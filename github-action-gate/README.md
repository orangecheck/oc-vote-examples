# github-action-gate

A reusable GitHub Action that gates a job on an OC Vote tally. Drop it into any workflow to require a community signal before shipping.

## Use case

You run a DAO / grant committee / cooperative / Nostr community. You want merges to a protected branch (or a production deploy, or a treasury disbursement triggered by a workflow) to require a passing OC Vote result.

## Usage

```yaml
name: Deploy

on:
    push:
        branches: [main]

jobs:
    gate:
        runs-on: ubuntu-latest
        steps:
            - name: Require OC Vote approval
              uses: orangecheck/oc-vote-examples/github-action-gate@main
              with:
                  # the id of a poll you made for this decision
                  poll-id: <64-hex poll id from vote.ochk.io>
                  # "yes beats no" — customize with any jq expression against the tally result
                  pass-condition: '.tallies.yes > .tallies.no'
                  # optional: require at least N voters
                  min-voters: 5
                  # optional: require the poll to be closed (tallied state, not open)
                  require-closed: 'true'
                  # optional: accept awaiting_reveal as a fail (default) or a pass
                  awaiting-reveal-is: 'fail'

    deploy:
        needs: gate
        runs-on: ubuntu-latest
        steps:
            - run: ./deploy.sh
```

## Inputs

| Input | Required | Default | Meaning |
|---|---|---|---|
| `poll-id` | yes | — | 64-hex OC Vote poll id |
| `pass-condition` | no | `.tallies.yes > .tallies.no` | jq expression over the `/api/tally` response; must evaluate truthy to pass |
| `min-voters` | no | `0` | reject if `turnout.voters` is below this |
| `require-closed` | no | `'false'` | if `'true'`, reject while the poll is still open (state must be `tallied` + deadline in the past) |
| `awaiting-reveal-is` | no | `'fail'` | one of `'fail'` or `'pass'`; how to treat secret-mode polls pre-reveal |
| `tally-base-url` | no | `https://vote.ochk.io/api/tally` | override for self-hosted |

## Outputs

| Output | Meaning |
|---|---|
| `state` | The `state` of a 200 answer: `tallied`, `awaiting_reveal` or `provisional`. Not set when `/api/tally` answers anything else |
| `passed` | `'true'` / `'false'` |
| `tally-json` | Full JSON response from `/api/tally`, written on one line |

### How each answer ends

| `/api/tally` answers | The step |
|---|---|
| 200 `tallied` | Applies `require-closed`, `min-voters` and `pass-condition`; passes only if all hold |
| 200 `awaiting_reveal` (secret poll, no reveal yet) | Passes or fails as `awaiting-reveal-is` says |
| 200 `provisional` (anchored poll, not final yet) | Fails, saying the count is provisional and may still change, and how many counted ballots have no anchor yet; run it again later |
| 200 with any other `state` | Fails, naming the state |
| 409 `deferred` (snapshot block not buried yet) | Fails with no `state` or `passed` output. The error names the status, the code (such as `E_SNAPSHOT_UNRESOLVED`) and the reason, and says to run it again later |
| 503 (the relays or the chain not read in full, such as the block at the deadline; no `state`, no count) | Fails the same way, with the server's words; run it again |
| 422 (an invalid poll) | Fails the same way, with the server's words; the poll can never pass |
| 404 | Fails the same way. For a poll's Nostr event id, it names the poll id to use instead |
| 429 | Fails the same way, saying how many seconds to wait (`Retry-After`) |
| 400 or 500 | Fails the same way, with the server's words or code |
| No answer, or a body that is not JSON | Fails, saying so |

Text from the server is escaped (`%`, CR and LF, as the Actions toolkit does) before it reaches a workflow command, so an answer can never write a command or an output of its own. Only a one-word `state` is written as an output, and a count is compared only once it is a whole number.

`bash github-action-gate/test/run.sh` runs the step against a stand-in `/api/tally` for each of these answers; CI runs it on every push.

## Verification story

This action uses the HTTP `/api/tally` endpoint for simplicity. For higher-value decisions, pair it with a **second job** that independently re-runs the tally via the CLI:

```yaml
independent-verify:
    runs-on: ubuntu-latest
    steps:
        - run: |
              npx -y @orangecheck/vote-cli tally $POLL_ID --json > tally.json
              jq -e '.tallies.yes > .tallies.no' tally.json
          env:
              POLL_ID: <64-hex poll id from vote.ochk.io>
```

Two independent implementations agreeing on a tally is the protocol's claim. If the two disagree, the CLI is authoritative and the web page has a bug — file an issue.

## Inline version

If you don't want the action overhead, drop the logic directly in a step:

```yaml
- name: Gate on poll result
  run: |
      tally=$(curl -sS "https://vote.ochk.io/api/tally?poll=$POLL_ID")
      state=$(echo "$tally" | jq -r '.state')
      passed=$(echo "$tally" | jq -e '.tallies.yes > .tallies.no' && echo true || echo false)
      echo "state=$state  passed=$passed"
      [[ "$state" == "tallied" && "$passed" == "true" ]] || exit 1
  env:
      POLL_ID: <64-hex poll id from vote.ochk.io>
```
