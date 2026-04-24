# shell — one-liner oc-vote recipes

No build, no install (beyond `npx`). Just patterns for common shell workflows.

## gate a deploy on a poll result

```bash
#!/usr/bin/env bash
set -euo pipefail
POLL=3054390f047f2703186943a41178bc15931500b5139229517f26e56282026ee5

tally=$(curl -sSf "https://vote.ochk.io/api/tally?poll=$POLL")
passed=$(jq -e '.state == "tallied" and (.tallies.yes > .tallies.no)' <<< "$tally")
[[ "$passed" == "true" ]] || { echo "community rejected"; exit 1; }
./deploy.sh
```

## run an independent tally with the CLI

```bash
# Installs on-demand, runs against your own Bitcoin node if you have one.
npx -y @orangecheck/vote-cli tally "$POLL" --json
# = same output any conforming client produces.
```

## create a poll from CI (use with `oc-vote-protocol` access + wallet elsewhere)

```bash
# Step 1: compute the poll id (dry-run, no signature needed)
npx -y @orangecheck/vote-cli create \
    --creator bc1qalice… \
    --question "Ship v2.0?" \
    --option yes:Ship --option no:Hold \
    --weight-mode sats_days --cap-days 180 \
    --min-sats 100000 --min-days 30 \
    --dry-run --json > draft.json

POLL_ID=$(jq -r .poll_id draft.json)
echo "sign this with bc1qalice… via BIP-322:  $POLL_ID"
# … user signs via UniSat / Xverse / sparrow-wallet … copies base64 back
SIG="<paste>"

# Step 2: re-run with --sig to publish
npx -y @orangecheck/vote-cli create \
    --creator bc1qalice… \
    --question "Ship v2.0?" \
    --option yes:Ship --option no:Hold \
    --weight-mode sats_days --cap-days 180 \
    --min-sats 100000 --min-days 30 \
    --sig "$SIG" --json
```

## cast a vote from the terminal

```bash
# Same two-step sig dance as create, but for a ballot:
npx -y @orangecheck/vote-cli vote \
    --poll "$POLL_ID" --voter bc1qbob… --option yes \
    --dry-run --json    # prints ballot_id to sign

# sign ballot_id out of band, then:
npx -y @orangecheck/vote-cli vote \
    --poll "$POLL_ID" --voter bc1qbob… --option yes \
    --sig "$BALLOT_SIG" --json
```

## poll-status cron

```bash
# Email yourself the tally every hour until the poll closes.
while true; do
    npx -y @orangecheck/vote-cli show "$POLL" > /tmp/status
    deadline=$(jq -r .deadline /tmp/status)
    now=$(date -u +%s)
    dl=$(date -u -d "$deadline" +%s 2>/dev/null || date -j -f '%Y-%m-%dT%H:%M:%SZ' "$deadline" +%s)
    [[ "$now" -ge "$dl" ]] && break
    mail -s "poll $POLL status" you@example.com < /tmp/status
    sleep 3600
done
```

## discover polls from the relay set

```bash
npx -y @orangecheck/vote-cli discover --limit 10 --open-only
```

## mint a fresh reveal key for a secret-mode poll (before you create it)

```bash
# If you want to pin the reveal keypair in advance (e.g. DAO trustee ceremony),
# use gen-reveal-key to mint one in the open, then pass --reveal-pk explicitly.
npx -y @orangecheck/vote-cli gen-reveal-key --json > key.json
REVEAL_PK=$(jq -r .reveal_pk key.json)
REVEAL_SK=$(jq -r .reveal_sk key.json)
# … create the poll with --mode secret and reference REVEAL_PK …
# … store REVEAL_SK offline until deadline …
# … publish reveal:
npx -y @orangecheck/vote-cli reveal --poll "$POLL" --reveal-sk "$REVEAL_SK" --creator bc1qalice…
```
