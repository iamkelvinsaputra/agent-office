#!/usr/bin/env python3
"""Add or remove Agent Office's hooks in a Claude Code settings.json, leaving everything else alone.

usage: settings_hooks.py install <settings.json> <path/to/hook.py>
       settings_hooks.py uninstall <settings.json>
"""
import json
import os
import sys

EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
          "PermissionRequest", "Notification", "Stop", "SessionEnd"]
# Anything whose command runs one of these is ours (includes the old pre-repo location).
MARKERS = ("agent-office", "agent-status/hook.py")


def is_ours(hook):
    cmd = hook.get("command", "")
    return "hook.py" in cmd and any(m in cmd for m in MARKERS)


def strip(settings):
    hooks = settings.get("hooks", {})
    for ev in list(hooks):
        groups = []
        for g in hooks[ev]:
            kept = [h for h in g.get("hooks", []) if not is_ours(h)]
            if kept:
                groups.append(dict(g, hooks=kept))
        if groups:
            hooks[ev] = groups
        else:
            del hooks[ev]
    if not hooks:
        settings.pop("hooks", None)


def main():
    action, path = sys.argv[1], sys.argv[2]
    settings = {}
    if os.path.exists(path):
        with open(path) as f:
            settings = json.load(f)
    strip(settings)
    if action == "install":
        cmd = '/usr/bin/python3 "%s"' % os.path.abspath(sys.argv[3])
        hooks = settings.setdefault("hooks", {})
        for ev in EVENTS:
            hooks.setdefault(ev, []).append(
                {"matcher": "*", "hooks": [{"type": "command", "command": cmd, "timeout": 5}]})
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


if __name__ == "__main__":
    main()
