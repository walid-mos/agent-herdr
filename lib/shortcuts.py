import json
import re
import sys

from files import InstallError, encode, read_bytes

KEY_SEPARATOR = re.compile(r"-(?=.)")


def native_key(key):
    primary = "cmd" if sys.platform == "darwin" else "ctrl-shift"
    parts = KEY_SEPARATOR.split(key.replace("primary", primary))
    return "-".join((*dict.fromkeys(parts[:-1]), parts[-1]))


def chord(key):
    parts = KEY_SEPARATOR.split(key.lower())
    aliases = {"secondary": "cmd", "super": "cmd", "win": "cmd"}
    return (*sorted({aliases.get(part, part) for part in parts[:-1]}), parts[-1])


def occupied_actions(keys, section, shortcut):
    relevant = set(keys) if section == "global" else {"global", "terminal", section}
    return [action for scope, bindings in keys.items() if scope in relevant
            for key, action in bindings.items() if chord(key) == chord(shortcut)]


def merge_section(keys, section, bindings):
    for shortcut, command in bindings.items():
        key = native_key(shortcut)
        occupied = occupied_actions(keys, section, key)
        if occupied and any(action != command for action in occupied):
            continue
        keys.setdefault(section, {})[key] = command


def plan_keys(source, home):
    before = read_bytes(home / "keys.json")
    if before is None:
        return {}
    keys = json.loads(before)
    if not isinstance(keys, dict) or any(not isinstance(section, dict) for section in keys.values()):
        raise InstallError("keys.json needs an object of binding sections. File left unchanged.")
    for section, bindings in json.loads(source["keys.json"]).items():
        merge_section(keys, section, bindings)
    return {} if keys == json.loads(before) else {"keys.json": {"before": before, "after": encode(keys)}}
