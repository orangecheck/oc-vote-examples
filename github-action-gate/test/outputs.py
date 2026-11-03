"""Reads a $GITHUB_OUTPUT file the way the runner does and holds it to what the
gate step writes: state, tally-json and passed, each at most once.

    python3 outputs.py FILE    # prints the state output, or -; exits 1 on anything else

A line is name=value when its = comes before any <<, and otherwise opens a
name<<DELIM block that runs to the next line that is exactly DELIM.
"""

import json
import sys

KNOWN_STATES = {"tallied", "provisional", "awaiting_reveal"}


def bad(why):
    print(f"BAD {why}")
    sys.exit(1)


lines = open(sys.argv[1], newline="").read().split("\n")
if lines[-1] == "":
    lines.pop()
outputs = {}
i = 0
while i < len(lines):
    line = lines[i]
    eq, heredoc = line.find("="), line.find("<<")
    if eq > 0 and (heredoc < 0 or eq < heredoc):
        name, value = line[:eq], line[eq + 1 :]
        i += 1
    elif heredoc > 0:
        name, delim = line[:heredoc], line[heredoc + 2 :]
        try:
            end = lines.index(delim, i + 1)
        except ValueError:
            bad(f"{name}<< block never closed")
        value = "\n".join(lines[i + 1 : end])
        i = end + 1
    else:
        bad(f"a line that is no output: {line!r}")
    if name in outputs:
        bad(f"{name} written twice")
    outputs[name] = value

if set(outputs) - {"state", "tally-json", "passed"}:
    bad(f"an output the step does not write: {sorted(set(outputs) - {'state', 'tally-json', 'passed'})}")
if "passed" in outputs and outputs["passed"] not in ("true", "false"):
    bad(f"passed={outputs['passed']!r}")
if "state" in outputs and outputs["state"] not in KNOWN_STATES:
    bad(f"state={outputs['state']!r}")
if "tally-json" in outputs:
    try:
        # strict=False: jq 1.6 lets a raw control character through inside a string.
        json.loads(outputs["tally-json"], strict=False)
    except ValueError:
        bad("tally-json is not the JSON body")
print(outputs.get("state", "-"))
