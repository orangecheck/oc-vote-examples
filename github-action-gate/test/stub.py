"""A stand-in for /api/tally: the first path segment picks the answer.

    python3 stub.py PORT_FILE    # binds a free port and writes it to PORT_FILE
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PAST = "2026-01-01T00:00:00Z"
COUNT = {"turnout": {"voters": 4, "weight": 4}, "tallies": {"yes": 3, "no": 1}, "deadline": PAST}

# Each answer as /api/tally sends it (oc-vote-web src/pages/api/tally.ts).
ANSWERS = {
    "tallied": (200, {"state": "tallied", "basis": "voter_clocks", **COUNT}),
    "provisional": (
        200,
        {"state": "provisional", "basis": "anchored", "close_height": 900000, "unanchored": 2, **COUNT},
    ),
    "awaiting_reveal": (200, {"state": "awaiting_reveal", "basis": "voter_clocks", "ballot_count": 4}),
    "deferred": (
        409,
        {
            "state": "deferred",
            "basis": "voter_clocks",
            "code": "E_SNAPSHOT_UNRESOLVED",
            "reason": "snapshot block has fewer than 6 confirmations — tally deferred",
        },
    ),
    "invalid": (422, {"error": "poll event content does not match poll_id"}),
    "unread_chain": (
        503,
        {"basis": "anchored", "error": "the block at the deadline could not be read: timeout"},
    ),
    "too_many": (429, {"error": "too many tallies asked; try again in a minute"}),
    "event_id": (
        404,
        {"error": "this is the Nostr event id of a poll; tally by its poll id", "poll_id": "b" * 64},
    ),
    "failed": (500, {"error": "tally_failed"}),
    # A server that tries to write workflow commands or outputs of its own.
    "inject_words": (503, {"error": "boom\n::add-mask::s3cret\r\n::stop-commands::tok 100%"}),
    "inject_output": (
        200,
        {
            "state": "tallied",
            "turnout": {"voters": 4, "weight": 4},
            "tallies": {"yes": 1, "no": 3},
            "note": "x\nEND_TALLY\npassed=true\nstate=forged",
        },
    ),
    "inject_state": (200, {"state": "tallied\npassed=true", **COUNT}),
    "inject_voters": (
        200,
        {"state": "tallied", "turnout": {"voters": "PATH[$(touch gate-pwned)]"}, "tallies": {"yes": 3, "no": 1}},
    ),
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        case = self.path.split("?")[0].strip("/")
        if case in ("not_json", "not_json_inject"):
            self.send_response(502)
            self.send_header("content-type", "text/html")
            self.end_headers()
            body = b"<html>Bad gateway</html>"
            if case == "not_json_inject":
                body = b"oops\n::add-mask::s3cret\n"
            self.wfile.write(body)
            return
        status, body = ANSWERS[case]
        self.send_response(status)
        self.send_header("content-type", "application/json")
        if status == 429:
            self.send_header("Retry-After", "42")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def log_message(self, *args):
        pass


server = HTTPServer(("127.0.0.1", 0), Handler)
with open(sys.argv[1], "w") as f:
    f.write(str(server.server_address[1]))
server.serve_forever()
