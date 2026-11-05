#!/usr/bin/env python3
"""Agent Office server: serves the office page and the live session list on 127.0.0.1 only."""
import json
import os
import re
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import REGISTRY_DIR, STATE_DIR, read_json, session_name  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR_NAME = re.compile(r"^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.js$")
HOME = os.path.expanduser("~")
PORT = int(os.environ.get("AGENT_OFFICE_PORT", "47823"))

YOUR_TURN_TIMEOUT = 30 * 60      # finished sessions hide after 30 min with no reply
ORPHAN_TIMEOUT = 2 * 60 * 60     # hook-only sessions (no registry entry) with no activity
STALE_FILE_AGE = 24 * 60 * 60    # state files older than this get deleted


def pid_alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except PermissionError:
        return True
    except Exception:
        return False


def load_registry():
    """Live Claude Code sessions, keyed by session id."""
    out = {}
    try:
        names = os.listdir(REGISTRY_DIR)
    except FileNotFoundError:
        return out
    for fn in names:
        if not fn.endswith(".json"):
            continue
        reg = read_json(os.path.join(REGISTRY_DIR, fn))
        if not reg or not reg.get("sessionId") or not pid_alive(reg.get("pid", -1)):
            continue
        out[reg["sessionId"]] = reg
    return out


def load_hook_states(now):
    out = {}
    try:
        names = os.listdir(STATE_DIR)
    except FileNotFoundError:
        return out
    for fn in names:
        if not fn.endswith(".json"):
            continue
        path = os.path.join(STATE_DIR, fn)
        st = read_json(path)
        if not st:
            continue
        if now - st.get("updated", 0) > STALE_FILE_AGE:
            try:
                os.remove(path)
            except OSError:
                pass
            continue
        out[st["session_id"]] = st
    return out


def sessions(now):
    registry = load_registry()
    hooks = load_hook_states(now)
    result = []

    for sid in set(registry) | set(hooks):
        reg, hk = registry.get(sid), hooks.get(sid)
        if reg is None and hk is None:
            continue
        cwd = (reg or {}).get("cwd") or (hk or {}).get("cwd") or ""
        name = session_name(sid, cwd, reg=reg or {}, transcript_hint=(hk or {}).get("transcript_path"))

        # Registry gives busy/idle; hooks add detail and "needs you". Newest wins,
        # except plain "busy" never clears a pending "needs you".
        reg_state = reg_since = None
        if reg:
            reg_state = {"busy": "working", "idle": "your_turn"}.get(reg.get("status"))
            reg_since = (reg.get("statusUpdatedAt") or reg.get("updatedAt") or 0) / 1000.0
        if hk and (reg_state is None or hk["updated"] >= reg_since
                   or (hk["state"] == "needs_you" and reg_state == "working")):
            state, since, detail = hk["state"], hk["since"], hk.get("detail", "")
        elif reg_state:
            state, since = reg_state, reg_since
            detail = "working" if reg_state == "working" else "finished"
        else:
            continue

        if reg is None and now - (hk or {}).get("updated", 0) > ORPHAN_TIMEOUT:
            continue  # no live process we can see, and quiet for a long time
        if state == "your_turn" and now - since > YOUR_TURN_TIMEOUT:
            continue  # idle doing nothing: hidden

        result.append({
            "id": sid,
            "name": name,
            "cwd": cwd.replace(HOME, "~", 1),
            "named": bool(reg and reg.get("nameSource") == "user"),
            "source": (hk or {}).get("source", "claude-code"),
            "state": state,
            "detail": detail,
            "since": since,
        })
    order = {"needs_you": 0, "working": 1, "your_turn": 2}
    result.sort(key=lambda s: (order.get(s["state"], 9), s["name"].lower()))
    return result


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            with open(os.path.join(HERE, "office.html"), "rb") as f:
                self._send(200, "text/html; charset=utf-8", f.read())
        elif path == "/api/state":
            now = time.time()
            body = json.dumps({"now": now, "sessions": sessions(now)}).encode()
            self._send(200, "application/json", body)
        elif path.startswith("/vendor/") and VENDOR_NAME.match(path[8:]) and os.path.isfile(os.path.join(HERE, "vendor", path[8:])):
            # only plain file names, so nothing outside vendor/ can be read
            with open(os.path.join(HERE, "vendor", path[8:]), "rb") as f:
                self._send(200, "text/javascript; charset=utf-8", f.read())
        else:
            self._send(404, "text/plain", b"not found")

    def log_message(self, *args):
        pass


def main():
    url = "http://127.0.0.1:%d/" % PORT
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        print("Agent Office is already running: %s" % url)
        if "--no-open" not in sys.argv:
            webbrowser.open(url)
        return
    print("Agent Office running at %s  (Ctrl-C to stop)" % url)
    if "--no-open" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAgent Office stopped.")


if __name__ == "__main__":
    main()
