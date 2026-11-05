#!/bin/sh
# Install Agent Office: add Claude Code hooks pointing at this folder and put
# `agent-office` on your PATH. Safe to run again (e.g. after moving the folder).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
BIN="$HOME/.local/bin"

# Keep the first backup: it's the settings from before Agent Office was ever installed.
if [ -f "$SETTINGS" ] && [ ! -f "$SETTINGS.pre-agent-office.bak" ]; then
  cp "$SETTINGS" "$SETTINGS.pre-agent-office.bak"
fi
/usr/bin/python3 "$DIR/settings_hooks.py" install "$SETTINGS" "$DIR/hook.py"

mkdir -p "$BIN"
ln -sf "$DIR/agent-office" "$BIN/agent-office"
chmod +x "$DIR/agent-office" "$DIR/hook.py" "$DIR/server.py"

echo "Agent Office installed."
echo "  hooks    -> $SETTINGS (backup: $SETTINGS.pre-agent-office.bak)"
echo "  command  -> $BIN/agent-office"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "  note: add $BIN to your PATH";; esac
echo "Start new Claude Code sessions to pick up the hooks, then run: agent-office"
