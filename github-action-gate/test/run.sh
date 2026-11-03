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
# WANT_STATE is the `state` output, or - for none. Every case also holds the
# step to what a server must never be able to do through it: start a workflow
# command of its own, write an output line of its own, or run a command.
check() {
    local name=$1 case=$2 want_exit=$3 want_text=$4 want_state=$5
    shift 5
    local out="$work/$name.out" gho="$work/$name.gho"
    : > "$gho"
    rm -f "$work/gate-pwned"
    local got_exit=0
    (cd "$work" && env POLL_ID="$POLL" PASS_COND='.tallies.yes > .tallies.no' MIN_VOTERS=0 \
        REQUIRE_CLOSED=false AWAITING_REVEAL_IS=fail \
        BASE="http://127.0.0.1:$port/$case" GITHUB_OUTPUT="$gho" "$@" \
        bash "$work/step.sh") > "$out" 2>&1 || got_exit=$?
    local why='' got_state
    # Exactly one ::error:: on a failure and none on a pass, and no command but
    # ::error::, ::group:: and ::endgroup::. The runner also ends a line at a CR.
    local want_errors=1
    [[ "$want_exit" == 0 ]] && want_errors=0
    if [[ $(grep -c '^[[:space:]]*::error::' "$out") != "$want_errors" ]]; then
        why="not $want_errors ::error:: line(s)"
    fi
    if grep -E '^[[:space:]]*::' "$out" | grep -qvE '^[[:space:]]*::(error|group|endgroup)::'; then
        why="a workflow command the step does not write"
    fi
    if grep -q $'\r' "$out"; then why="a raw CR, which the runner reads as a line break"; fi
    # Only the three outputs, each at most once, read the way the runner reads them.
    if ! got_state=$(python3 -I "$here/outputs.py" "$gho"); then
        why="${got_state#BAD }"
        got_state='?'
    fi
    if [[ -e "$work/gate-pwned" ]]; then why="a server string ran as a command"; fi
    if [[ -n "$why" || "$got_exit" != "$want_exit" ]] || ! grep -qF -- "$want_text" "$out" \
        || [[ "$got_state" != "$want_state" ]]; then
        echo "FAIL $name: exit $got_exit (want $want_exit), state '$got_state' (want '$want_state')${why:+, $why}"
        sed 's/^/  o /' "$gho"
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
check inject-words inject_words 1 "boom%0A::add-mask::s3cret%0D%0A::stop-commands::tok 100%25" -
check inject-not-json not_json_inject 1 "oops%0A::add-mask::s3cret" -
check inject-output inject_output 1 "::error::pass-condition" tallied
check inject-state inject_state 1 "answered state tallied%0Apassed=true, which this action does not know" -
check inject-voters inject_voters 1 "a voter count that is not a whole number: PATH[\$(touch gate-pwned)]" tallied MIN_VOTERS=1
check voters-named voters_named 1 "a voter count that is not a whole number: MIN_VOTERS" tallied MIN_VOTERS=5
check inject-poll-id inject_poll_id 1 "answered 404: this is the Nostr event id of a poll. Check poll-id." -
check inject-unanchored inject_unanchored 1 "so the counts may still change. Run this job again later." provisional
check closed-no-deadline tallied 1 "::error::require-closed=true but /api/tally sent no deadline" tallied REQUIRE_CLOSED=true
check closed-past closed 0 "passed" tallied REQUIRE_CLOSED=true
check closed-future future 1 "::error::require-closed=true but deadline 2999-01-01T00:00:00Z is in the future" tallied REQUIRE_CLOSED=true
check closed-unread-deadline deadline_unread 1 "::error::require-closed=true but the deadline could not be read: soon" tallied REQUIRE_CLOSED=true
check unknown-state unread 1 "::error::/api/tally answered state unread, which this action does not know" -
check inject-deadline inject_deadline 1 "the deadline could not be read: 2999-01-01T00:00:00Z (x%0A::warning::y)" tallied REQUIRE_CLOSED=true
check inject-reason inject_reason 1 "answered 409 (E_SNAPSHOT_UNRESOLVED): late%0A::warning::x. The tally" -
check inject-reason-escaped inject_reason_escaped 1 "answered 409 (E_SNAPSHOT_UNRESOLVED): late%250A::warning::x. The tally" -
check retry-after-odd too_many_odd 1 "run this job again in 60 seconds." -
# A raw newline inside a string: jq 1.7 refuses the body; jq 1.6 takes it, and
# then only jq -c's one-line rewrite keeps its END_TALLY line out of the file.
if printf '"a\nb"' | jq . > /dev/null 2>&1; then
    check closes-heredoc closes_heredoc 1 "::error::pass-condition" tallied
else
    check closes-heredoc closes_heredoc 1 "answered 200 with a body that is not JSON" -
fi
# Nothing listens on port 9 (discard) here; curl gets no answer.
check unreachable tallied 1 "::error::could not reach" - BASE=http://127.0.0.1:9/x

if (( fails > 0 )); then
    echo "$fails case(s) failed"
    exit 1
fi
echo "all cases pass"
