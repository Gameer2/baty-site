#!/usr/bin/env python3
"""Local dev server for the whole site.

Identical to `python3 -m http.server` for every normal page request, plus one extra
endpoint (POST /math-lab/note-taker/save) that the note-taking widget calls on every
add/delete — it writes straight to note-taker/notes.json (raw data) and regenerates
note-taker/notes.md (a readable export), so notes survive across days and sessions without
any manual export step. Not part of the shipped site — a personal review tool only.

Serves from the REPO ROOT, not from math-lab/, so every part of the site is reachable from
one origin: the top-level hub at /, the General Lab at /math-lab/, and Syntropy Canvas at
/canvas/dist/. That's what makes the hub's own `../canvas/dist/index.html` link resolve, and
what lets the canvas app load this widget over http instead of only over file://.

Run this INSTEAD of `python3 -m http.server`, from anywhere:

    python3 math-lab/note-taker/serve.py         # serves on port 8000
    python3 math-lab/note-taker/serve.py 8080    # or a custom port

Then open http://localhost:8000/ (or whatever port you chose).
"""
import http.server
import json
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))    # .../math-lab/note-taker
MATH_LAB = os.path.dirname(HERE)                      # .../math-lab
SITE_ROOT = os.path.dirname(MATH_LAB)                 # repo root
SITE_ROOT_REAL = os.path.realpath(SITE_ROOT)
NOTES_JSON = os.path.join(HERE, "notes.json")
NOTES_MD = os.path.join(HERE, "notes.md")
SAVE_PATH = "/math-lab/note-taker/save"


UNDATED = "Undated (added before session tracking)"


def _session_key(note):
    created = note.get("createdAt") if isinstance(note, dict) else None
    if not created:
        return UNDATED
    # createdAt is an ISO timestamp like 2026-08-01T12:34:56.000Z — the date part is the session.
    return created[:10] if len(created) >= 10 else UNDATED


def write_markdown(data):
    # Flatten to (page, note) pairs, then regroup by session (the day a note was added) so the
    # file reads as a history of what was flagged and resolved on each visit — nothing here ever
    # gets deleted by this export step, deleting a note is only ever a deliberate click in the
    # widget itself.
    by_session = {}
    for page, notes in data.items():
        for n in notes:
            if not isinstance(n, dict):
                n = {"text": str(n), "target": None}
            by_session.setdefault(_session_key(n), {}).setdefault(page, []).append(n)

    lines = ["# Site notes — last saved " + date.today().isoformat(), ""]
    if not by_session:
        lines.append("(no notes yet)")
    else:
        sessions = sorted((s for s in by_session if s != UNDATED), reverse=True)
        if UNDATED in by_session:
            sessions.append(UNDATED)
        for session in sessions:
            lines.append("## Session: " + session)
            lines.append("")
            pages = by_session[session]
            for page in sorted(pages):
                lines.append("### " + page)
                lines.append("")
                for n in pages[page]:
                    target = n.get("target")
                    text = n.get("text", "")
                    done = n.get("status") == "done"
                    box = "[x]" if done else "[ ]"
                    where = ""
                    if target:
                        where = "[%s \"%s\"] " % (target.get("label", ""), target.get("snippet", ""))
                    else:
                        where = "(general) "
                    suffix = ""
                    if done and n.get("resolvedAt"):
                        suffix = " _(done %s)_" % n["resolvedAt"][:10]
                    lines.append("- %s %s%s%s" % (box, where, text, suffix))
                lines.append("")
    with open(NOTES_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SITE_ROOT, **kwargs)

    def log_message(self, fmt, *args):
        if self.path != SAVE_PATH:
            super().log_message(fmt, *args)

    def _blocked_path(self):
        # Widening SITE_ROOT to the repo root (so the hub, math-lab, and canvas share one
        # origin) put .git/ (full commit history), .claude/, .superpowers/, and every other
        # dotfile in the repo behind a plain HTTP GET — none of that was reachable back when
        # SITE_ROOT was just math-lab/.
        #
        # translate_path() is the SAME method SimpleHTTPRequestHandler itself uses to turn
        # self.path into the filesystem path it will open — it URL-unquotes (so %2e -> ".") and
        # posixpath.normpath()s (collapsing "..") before mapping onto SITE_ROOT. Checking the
        # raw, still-encoded self.path string directly (an earlier version of this guard did)
        # is a parser differential: a request for "/%2egit/config" doesn't literally start with
        # "." until decoded, so a check on the encoded string misses it while the real handler,
        # decoding it the same way translate_path does, would still open it. Checking
        # translate_path()'s OUTPUT guarantees this guard sees exactly what will actually be
        # opened, and realpath() resolves any symlink so a dotfile can't be reached by a
        # non-dot alias either.
        resolved = os.path.realpath(self.translate_path(self.path))
        if os.path.commonpath([resolved, SITE_ROOT_REAL]) != SITE_ROOT_REAL:
            return True  # escaped SITE_ROOT entirely (shouldn't happen; defense in depth)
        rel = os.path.relpath(resolved, SITE_ROOT_REAL)
        return any(part.startswith(".") for part in rel.split(os.sep) if part not in ("", os.curdir))

    def do_GET(self):
        if self._blocked_path():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if self._blocked_path():
            self.send_error(404)
            return
        super().do_HEAD()

    def _same_origin(self):
        # Basic CSRF guard: a page from any other origin loaded in the same browser could
        # otherwise POST here and overwrite notes.json/notes.md — this endpoint only accepts
        # requests declaring one of the two origins this server actually listens on. Requests
        # with no Origin header (curl, same-origin fetches that omit it) are still allowed,
        # since this server has no auth of its own to check instead.
        #
        # Deliberately NOT compared against the request's own Host header: Host is
        # client-supplied on a raw socket, so "Origin == Host" is defeated by DNS rebinding — a
        # page served from a domain the attacker controls can rebind that domain's DNS to
        # 127.0.0.1 mid-session, after which its same-origin fetches carry an Origin AND Host
        # that agree with each other while still being entirely attacker-chosen. Comparing
        # against a fixed allowlist built from the port this process actually bound closes that
        # gap: the attacker can make Origin equal their own Host, but not equal ours.
        origin = self.headers.get("Origin")
        if not origin:
            return True
        return origin in ALLOWED_ORIGINS

    def do_POST(self):
        if self.path != SAVE_PATH:
            self.send_error(404)
            return
        if not self._same_origin():
            self.send_error(403)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body.decode("utf-8"))
            with open(NOTES_JSON, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            write_markdown(data)
            self.send_response(204)
            self.end_headers()
        except Exception:
            # Not str(e) in the response body: this server now serves the whole repo, and an
            # exception here is most often a filesystem error whose message can include local
            # paths — no reason to hand that to whatever sent the (possibly cross-origin) POST.
            self.send_response(500)
            self.end_headers()


# Set from argv before the server starts, and read by Handler._same_origin() on every POST —
# see that method for why this allowlist is built from the port we actually bound rather than
# from the request's own Host header.
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ALLOWED_ORIGINS = {
    "http://localhost:%d" % PORT,
    "http://127.0.0.1:%d" % PORT,
}

if __name__ == "__main__":
    # Bind to localhost only. SITE_ROOT widened to the repo root in the site-integration change
    # (so the hub, math-lab, and canvas share one origin) — binding "" (all interfaces) would
    # have turned that into a whole-repo file server reachable by anything else on the network.
    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    print("Serving %s at http://localhost:%d" % (SITE_ROOT, PORT))
    print("Notes auto-save to %s" % NOTES_MD)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
