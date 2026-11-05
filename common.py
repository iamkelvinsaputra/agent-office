"""Shared paths and session naming for Agent Office."""
import glob
import json
import os

HOME = os.path.expanduser("~")
STATE_DIR = os.path.join(
    os.environ.get("XDG_STATE_HOME") or os.path.join(HOME, ".local", "state"), "agent-office"
)
CLAUDE_DIR = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(HOME, ".claude")
REGISTRY_DIR = os.path.join(CLAUDE_DIR, "sessions")
PROJECTS_DIR = os.path.join(CLAUDE_DIR, "projects")

TITLE_SCAN_BYTES = 512 * 1024
_title_cache = {}  # transcript path -> (mtime, title)


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def registry_entry(session_id):
    try:
        names = os.listdir(REGISTRY_DIR)
    except OSError:
        return None
    for fn in names:
        if fn.endswith(".json"):
            reg = read_json(os.path.join(REGISTRY_DIR, fn))
            if reg and reg.get("sessionId") == session_id:
                return reg
    return None


def find_transcript(session_id, hint=None):
    if hint and os.path.exists(hint):
        return hint
    hits = glob.glob(os.path.join(PROJECTS_DIR, "*", "%s.jsonl" % glob.escape(session_id)))
    return hits[0] if hits else None


def _last_title(lines):
    """Newest custom title wins over the newest automatic one."""
    custom = auto = None
    for line in lines:
        if '"custom-title"' not in line and '"ai-title"' not in line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") == "custom-title" and d.get("customTitle"):
            custom = d["customTitle"]
        elif d.get("type") == "ai-title" and d.get("aiTitle"):
            auto = d["aiTitle"]
    return custom or auto


def transcript_title(path):
    """The session's title from its transcript, read from the tail and cached by mtime."""
    if not path:
        return None
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return None
    cached = _title_cache.get(path)
    if cached and cached[0] == mtime:
        return cached[1]
    title = None
    try:
        with open(path, "rb") as f:
            size = f.seek(0, os.SEEK_END)
            f.seek(max(0, size - TITLE_SCAN_BYTES))
            title = _last_title(f.read().decode("utf-8", "replace").splitlines())
            if title is None and size > TITLE_SCAN_BYTES:
                f.seek(0)
                title = _last_title(line.decode("utf-8", "replace") for line in f)
    except OSError:
        pass
    _title_cache[path] = (mtime, title)
    return title


def session_name(session_id, cwd="", reg=None, transcript_hint=None):
    """Your --name (or /rename), else Claude's automatic topic title, else the folder name."""
    reg = reg if reg is not None else registry_entry(session_id)
    if reg and reg.get("name") and reg.get("nameSource") == "user":
        return reg["name"]
    title = transcript_title(find_transcript(session_id, transcript_hint))
    if title:
        return title
    if reg and reg.get("name"):
        return reg["name"]
    return os.path.basename((cwd or "").rstrip("/")) or "Claude"
