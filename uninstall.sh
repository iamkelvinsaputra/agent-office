#!/bin/sh
# Remove Agent Office's hooks, command and saved state. Leaves this folder alone.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

[ -f "$SETTINGS" ] && /usr/bin/python3 "$DIR/settings_hooks.py" uninstall "$SETTINGS"
[ -L "$HOME/.local/bin/agent-office" ] && rm "$HOME/.local/bin/agent-office"
rm -rf "${XDG_STATE_HOME:-$HOME/.local/state}/agent-office"
echo "Agent Office uninstalled. You can delete this folder now."
