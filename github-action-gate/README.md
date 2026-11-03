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
                  poll-id: 3054390f047f2703186943a41178bc15931500b5139229517f26e56282026ee5
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
| `tally-json` | Full JSON response from `/api/tally` |

### How each answer ends

| `/api/tally` answers | The step |
|---|---|
| 200 `tallied` | Applies `require-closed`, `min-voters` and `pass-condition`; passes only if all hold |
| 200 `awaiting_reveal` (secret poll, no reveal yet) | Passes or fails as `awaiting-reveal-is` says |
| 200 `provisional` (anchored poll, not final yet) | Fails: "unexpected state: provisional" |
| 409 `deferred` (snapshot block not buried yet) | Fails at the `curl` call, with no `state` or `passed` output; run it again later |
| 503 (relays not read in full; no `state`, no count) | Fails at the `curl` call, the same way |
| 400, 404, 429 or 500 | Fails at the `curl` call, the same way |

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
              POLL_ID: 3054…
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
      POLL_ID: 3054…
```
