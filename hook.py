#!/usr/bin/env python3
"""Agent Office hook: records each Claude Code session's state and sends Mac notifications.

Called by Claude Code hooks with the event JSON on stdin. It must never block or
break Claude Code, so every failure is swallowed and it always exits 0 silently.
"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import STATE_DIR, session_name

WORKING, NEEDS_YOU, YOUR_TURN = "working", "needs_you", "your_turn"
# Tools that stop and wait for the user even though they arrive as a normal tool call.
QUESTION_TOOLS = {"AskUserQuestion"}
NEEDS_NOTIFICATION_TYPES = {"permission_prompt", "elicitation_dialog"}


def notify(title, message):
    def esc(s):
        return s.replace("\\", "\\\\").replace('"', '\\"')

    script = 'display notification "%s" with title "Agent Office" subtitle "%s" sound name "Glass"' % (
        esc(message[:200]),
        esc(title[:100]),
    )
    # Fire and forget so the hook returns immediately.
    subprocess.Popen(
        ["/usr/bin/osascript", "-e", script],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def main():
    event = json.load(sys.stdin)
    name = event.get("hook_event_name", "")
    sid = event.get("session_id")
    if not sid:
        return
    path = os.path.join(STATE_DIR, "%s.json" % sid)

    if name == "SessionEnd":
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        return

    try:
        with open(path) as f:
            prev = json.load(f)
    except Exception:
        prev = {}

    now = time.time()
    tool = event.get("tool_name")
    new_state, detail = None, prev.get("detail", "")

    if name in ("SessionStart",):
        new_state, detail = YOUR_TURN, "ready"
    elif name == "UserPromptSubmit":
        new_state, detail = WORKING, "thinking"
    elif name == "PreToolUse":
        if tool in QUESTION_TOOLS:
            new_state, detail = NEEDS_YOU, "has a question for you"
        else:
            new_state, detail = WORKING, tool or "working"
    elif name == "PostToolUse":
        new_state, detail = WORKING, tool or "working"
    elif name == "PermissionRequest":
        new_state, detail = NEEDS_YOU, "permission: %s" % (tool or "tool")
    elif name == "Notification":
        ntype = event.get("notification_type")
        msg = event.get("message") or ""
        if ntype in NEEDS_NOTIFICATION_TYPES or (ntype is None and "permission" in msg.lower()):
            new_state = NEEDS_YOU
            if prev.get("state") != NEEDS_YOU:
                detail = msg or "needs your input"
    elif name == "Stop":
        if event.get("stop_hook_active"):
            return
        new_state, detail = YOUR_TURN, "finished"

    if new_state is None:
        return

    cwd = event.get("cwd") or prev.get("cwd") or ""
    changed = new_state != prev.get("state")
    record = {
        "session_id": sid,
        "source": "claude-code",
        "cwd": cwd,
        "transcript_path": event.get("transcript_path") or prev.get("transcript_path"),
        "state": new_state,
        "detail": detail,
        "since": now if changed else prev.get("since", now),
        "updated": now,
    }
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = path + ".tmp%d" % os.getpid()
    with open(tmp, "w") as f:
        json.dump(record, f)
    os.replace(tmp, path)

    tp = record["transcript_path"]
    if changed and new_state == NEEDS_YOU:
        notify("⚠ %s needs you" % session_name(sid, cwd, transcript_hint=tp), detail or "Waiting for your input")
    elif changed and new_state == YOUR_TURN and name == "Stop":
        notify("✓ %s finished" % session_name(sid, cwd, transcript_hint=tp), "Your turn")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
