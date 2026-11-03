#!/usr/bin/env bash
# Runs the gate step's own shell, lifted from action.yml, against a stand-in
# /api/tally (stub.py) for each answer the README's table lists, and checks
# each ends with its exit code, its message and its outputs.
#
#   bash github-action-gate/test/run.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
stub_pid=
trap '[[ -n "$stub_pid" ]] && kill "$stub_pid" 2>/dev/null; rm -rf "$work"' EXIT

# The step's `run:` block, dedented. Its inputs reach it only through env.
python3 - "$here/../action.yml" > "$work/step.sh" <<'PY'
import sys
lines = open(sys.argv[1]).read().split("\n")
start = next(i for i, l in enumerate(lines) if l.strip() == "run: |")
indent = len(lines[start]) - len(lines[start].lstrip())
body = []
for l in lines[start + 1:]:
    if l.strip() and len(l) - len(l.lstrip()) <= indent:
        break
    body.append(l)
pad = min(len(l) - len(l.lstrip()) for l in body if l.strip())
script = "\n".join(l[pad:] for l in body)
assert "${{" not in script, "the step reads an expression outside env"
print(script)
PY

python3 "$here/stub.py" "$work/port" &
stub_pid=$!
for _ in $(seq 50); do [[ -s "$work/port" ]] && break; sleep 0.1; done
port=$(cat "$work/port")

fails=0
POLL=$(printf 'a%.0s' $(seq 64))

# check NAME CASE WANT_EXIT WANT_TEXT WANT_STATE [ENV=VALUE ...]
# WANT_STATE is the `state` output, or - for none.
check() {
    local name=$1 case=$2 want_exit=$3 want_text=$4 want_state=$5
    shift 5
    local out="$work/$name.out" gho="$work/$name.gho"
    : > "$gho"
    local got_exit=0
    env POLL_ID="$POLL" PASS_COND='.tallies.yes > .tallies.no' MIN_VOTERS=0 \
        REQUIRE_CLOSED=false AWAITING_REVEAL_IS=fail \
        BASE="http://127.0.0.1:$port/$case" GITHUB_OUTPUT="$gho" "$@" \
        bash "$work/step.sh" > "$out" 2>&1 || got_exit=$?
    local got_state
    got_state=$(sed -n 's/^state=//p' "$gho")
    if [[ "$got_exit" != "$want_exit" ]] || ! grep -qF -- "$want_text" "$out" \
        || [[ "${got_state:--}" != "$want_state" ]]; then
        echo "FAIL $name: exit $got_exit (want $want_exit), state '${got_state:--}' (want '$want_state')"
        echo "  want text: $want_text"
        sed 's/^/  | /' "$out"
        fails=$((fails + 1))
    else
        echo "ok   $name"
    fi
}

check tallied tallied 0 "passed" tallied
check tallied-condition-false tallied 1 "::error::pass-condition (.tallies.no > .tallies.yes) evaluated false" tallied PASS_COND='.tallies.no > .tallies.yes'
check tallied-too-few-voters tallied 1 "::error::only 4 voter(s) — min-voters is 5" tallied MIN_VOTERS=5
check provisional provisional 1 "::error::poll is provisional" provisional
check provisional-says-why provisional 1 "counts may still change; 2 counted ballot(s) have no anchor yet" provisional
check awaiting-reveal-fails awaiting_reveal 1 "::error::poll is awaiting_reveal" awaiting_reveal
check awaiting-reveal-passes awaiting_reveal 0 "treated as pass" awaiting_reveal AWAITING_REVEAL_IS=pass
check deferred deferred 1 "::error::/api/tally answered 409 (E_SNAPSHOT_UNRESOLVED): snapshot block has fewer than 6 confirmations — tally deferred. The tally is deferred, not final yet: run this job again later." -
check invalid invalid 1 "::error::/api/tally answered 422: poll event content does not match poll_id. The poll itself is invalid, so it can never pass." -
check chain-unread unread_chain 1 "::error::/api/tally answered 503: the block at the deadline could not be read: timeout. A relay or chain read did not finish, so nothing was counted: run this job again." -
check too-many too_many 1 "run this job again in 42 seconds." -
check event-id event_id 1 "set poll-id to $(printf 'b%.0s' $(seq 64))." -
check failed failed 1 "::error::/api/tally answered 500 (tally_failed). The tally failed on the server: run this job again." -
check not-json not_json 1 "answered 502 with a body that is not JSON" -
# Nothing listens on port 9 (discard) here; curl gets no answer.
check unreachable tallied 1 "::error::could not reach" - BASE=http://127.0.0.1:9/x

if (( fails > 0 )); then
    echo "$fails case(s) failed"
    exit 1
fi
echo "all cases pass"
