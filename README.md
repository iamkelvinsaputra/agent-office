# Agent Office

A tiny isometric office in your browser that shows your live Claude Code sessions, plus macOS
notifications when one of them needs you.

- **One desk per live session.** Characters walk in when a session starts and walk out when it closes.
- **At-a-glance states:** ⚙ working (typing, code on screen) · ⚠ needs you (permission prompt or a
  question; waving, flashing screen) · ✓ your turn (finished, leaning back).
- **No clutter:** sessions that finished and haven't been touched for 30 minutes are hidden.
  Closed sessions disappear right away.
- **Readable names:** your `--name` / `/rename` if you set one, otherwise Claude's automatic topic
  title, otherwise the folder name.
- **Notifications:** a macOS banner (with sound) when a session needs you or finishes, whether or not
  the office is open.
- **No dependencies:** built-in Python 3 and a single HTML page. The server listens on `127.0.0.1` only.

## Requirements

macOS with `/usr/bin/python3` (ships with the Xcode Command Line Tools) and Claude Code.

## Install

```sh
git clone https://github.com/iamkelvinsaputra/agent-office.git ~/Projects/agent-office
~/Projects/agent-office/install.sh
```

`install.sh` backs up your `~/.claude/settings.json`, adds hooks that run `hook.py` from this folder,
and links `agent-office` into `~/.local/bin`. Run it again whenever you move the folder.

New Claude Code sessions pick up the hooks. Then:

```sh
agent-office          # opens http://127.0.0.1:47823/  (Ctrl-C to stop)
```

Set `AGENT_OFFICE_PORT` to use another port.

## How it works

| File | Role |
|---|---|
| `hook.py` | Runs on Claude Code hook events. Writes each session's state to `~/.local/state/agent-office/` and sends notifications. Always exits 0 so it can never block Claude Code. |
| `server.py` | Merges hook state with Claude Code's own live-session list (`~/.claude/sessions/`), applies the visibility rules, and serves the page plus `/api/state`. |
| `office.html` | The isometric office, drawn on a canvas with no libraries. |
| `common.py` | Shared paths and session naming. |
| `settings_hooks.py` | Adds or removes this project's hooks in `settings.json` without touching anything else. |

Sessions that were already running before you installed still appear (as working / your turn) from
Claude Code's session list; "needs you" and notifications need a session started after install.

## Uninstall

```sh
~/Projects/agent-office/uninstall.sh
```

Removes the hooks, the `agent-office` command and the saved state. Then delete the folder.

## License

MIT. See [LICENSE](LICENSE).
