import json
import os
import pathlib
import re
import sys

HEAD_BYTES = 256_000
TAIL_BYTES = 400_000
TAIL_GROWTH = 4
MAX_TAIL_BYTES = TAIL_BYTES * TAIL_GROWTH ** 3
NEAREST_CANDIDATES = 8
MATCH_TOLERANCE_MS = 10 * 60 * 1000
PREVIEW_CHARS = 240
HOME = pathlib.Path.home()
AFFINITY = HOME / ".config" / "magpie" / "affinity.json"
CLAUDE_TOKEN_FIELDS = ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens")


def pi_directory(cwd):
    return HOME / ".pi" / "agent" / "sessions" / ("--" + re.sub(r"[/\\:]", "-", cwd.strip("/")) + "--")


def claude_directory(cwd):
    return HOME / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", cwd)


def pi_reply(entry):
    message = entry.get("message") if entry.get("type") == "message" else None
    if not isinstance(message, dict) or message.get("role") != "assistant":
        return None
    usage = message.get("usage") or {}
    return {"model": message.get("model"), "provider": message.get("provider"), "effort": message.get("thinkingLevel"),
            "tokens": usage.get("totalTokens"), "content": message.get("content")}


def claude_reply(entry):
    message = entry.get("message")
    if entry.get("type") != "assistant" or entry.get("isSidechain") or not isinstance(message, dict):
        return None
    usage = message.get("usage") or {}
    tokens = sum(usage.get(field) or 0 for field in CLAUDE_TOKEN_FIELDS)
    return {"model": message.get("model"), "provider": "anthropic", "effort": None, "tokens": tokens, "content": message.get("content")}


READERS = {
    "pi": {"directory": pi_directory, "reply": pi_reply, "reply_marker": b'"role":"assistant"',
           "name_marker": b'"type":"session_info"', "name_field": "name"},
    "claude-code": {"directory": claude_directory, "reply": claude_reply, "reply_marker": b'"type":"assistant"',
                    "name_marker": b'"type":"ai-title"', "name_field": "aiTitle"},
}


def parse_replies(chunk, reader):
    replies = []
    for line in chunk.split(b"\n"):
        if reader["reply_marker"] not in line:
            continue
        try:
            reply = reader["reply"](json.loads(line))
        except ValueError:
            continue
        if reply:
            replies.append(reply)
    return replies


class SessionFile:
    """Reads only the two ends of a session file: these files reach tens of megabytes."""

    def __init__(self, path):
        self.path = path
        with open(path, "rb") as stream:
            self.length = stream.seek(0, os.SEEK_END)
            stream.seek(0)
            self.head = stream.read(HEAD_BYTES)
        self.tail = self.last_lines(TAIL_BYTES)

    def last_lines(self, size):
        start = max(0, self.length - size)
        with open(self.path, "rb") as stream:
            stream.seek(start)
            chunk = stream.read()
        return chunk if start == 0 else chunk.partition(b"\n")[2]

    def name(self, reader):
        for chunk in (self.tail, self.head):
            position = chunk.rfind(reader["name_marker"])
            if position < 0:
                continue
            end = chunk.find(b"\n", position)
            line = chunk[chunk.rfind(b"\n", 0, position) + 1:end if end >= 0 else len(chunk)]
            try:
                return json.loads(line).get(reader["name_field"]) or ""
            except ValueError:
                continue
        return ""

    def replies(self, reader):
        """Widens the tail until it holds a reply: one pasted image is a single line larger than the first window."""
        size, chunk = TAIL_BYTES, self.tail
        while True:
            replies = parse_replies(chunk, reader)
            if replies or size >= min(self.length, MAX_TAIL_BYTES):
                return replies
            size *= TAIL_GROWTH
            chunk = self.last_lines(size)


def nearest_paths(directory, reference_ms):
    try:
        entries = [(abs(entry.stat().st_mtime * 1000 - reference_ms), entry.path) for entry in os.scandir(directory) if entry.name.endswith(".jsonl")]
    except OSError:
        return []
    return sorted(entries)[:NEAREST_CANDIDATES]


def open_session(path, files):
    if path not in files:
        files[path] = SessionFile(path)
    return files[path]


def newest_path(directory):
    try:
        sessions = [entry for entry in os.scandir(directory) if entry.name.endswith(".jsonl")]
    except OSError:
        return None
    return max(sessions, key=lambda entry: entry.stat().st_mtime).path if sessions else None


def pick_session(thread, reader, files, taken):
    if thread.get("directory"):
        path = newest_path(thread["directory"])
        return open_session(path, files) if path else None
    directory = reader["directory"](thread["cwd"])
    candidates = [item for item in nearest_paths(directory, thread["reference_ms"]) if item[1] not in taken]
    for _, path in candidates:
        if thread["titles"] and open_session(path, files).name(reader) in thread["titles"]:
            return files[path]
    if candidates and candidates[0][0] <= MATCH_TOLERANCE_MS:
        return open_session(candidates[0][1], files)
    return None


def preview_of(replies):
    for reply in reversed(replies):
        blocks = reply["content"] if isinstance(reply["content"], list) else []
        texts = [block.get("text") or "" for block in blocks if isinstance(block, dict) and block.get("type") == "text"]
        joined = " ".join(" ".join(texts).split())
        if joined:
            return joined[:PREVIEW_CHARS]
    return ""


def read_routes():
    try:
        affinity = json.loads(AFFINITY.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    routes = {}
    for key, route in sorted(affinity.items(), key=lambda item: str(item[1].get("at"))):
        parts = key.split("|")
        routes[(parts[0], parts[-1])] = route
    return routes


def summarize(thread, session_file, reader, routes):
    session = pathlib.Path(session_file.path).stem.split("_")[-1]
    replies = session_file.replies(reader)
    record = {"address": thread["address"], "session": session, "name": session_file.name(reader), "preview": preview_of(replies)}
    if not replies:
        return record
    last = replies[-1]
    route = routes.get((last["model"], session), {}) if last["provider"] == "magpie" else {}
    return {**record, "model": route.get("model") or last["model"], "effort": route.get("effort") or last["effort"], "tokens": last["tokens"]}


def main():
    threads = [thread for thread in json.loads(sys.argv[1]) if thread.get("app") in READERS and thread.get("cwd")]
    routes, files, taken, records = read_routes(), {}, set(), []
    for thread in sorted(threads, key=lambda item: (not item.get("directory"), not item["titles"])):
        reader = READERS[thread["app"]]
        session_file = pick_session(thread, reader, files, taken)
        if not session_file:
            continue
        taken.add(session_file.path)
        records.append(summarize(thread, session_file, reader, routes))
    print(json.dumps(records))


main()
