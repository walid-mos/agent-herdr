import hashlib
import json
import os
import tempfile
from pathlib import Path


class InstallError(Exception):
    pass


def digest(content):
    return hashlib.sha256(content).hexdigest()


def safe_path(path):
    for part in (path, *path.parents):
        if part.is_symlink():
            raise InstallError(f"Refusing symlink {part}. Use a real profile directory.")
    return path


def real_parent(path):
    """Resolve the parent directories but keep the leaf, so safe_path still refuses a symlinked leaf."""
    return path.parent.resolve() / path.name


def read_bytes(path):
    safe_path(path)
    if not path.exists():
        return None
    if not path.is_file():
        raise InstallError(f"Expected a regular file at {path}.")
    return path.read_bytes()


REQUIRED = object()


def read_json(path, default=REQUIRED):
    content = read_bytes(path)
    if content is not None:
        return json.loads(content)
    if default is REQUIRED:
        raise InstallError(f"Missing {path}.")
    return default


def encode(value):
    return (json.dumps(value, indent=2, ensure_ascii=True) + "\n").encode()


def relative_path(name):
    path = Path(name)
    if path.is_absolute() or not path.parts or any(part in (".", "..") for part in path.parts):
        raise InstallError(f"Unsafe relative path {name!r} in the receipt or provenance.json.")
    return path


def read_source(repository):
    names = read_json(repository / "source-files.json")
    if not isinstance(names, list) or any(not isinstance(name, str) for name in names) or len(names) != len(set(names)):
        raise InstallError("source-files.json must contain unique relative config paths.")
    source = {}
    for name in names:
        content = read_bytes(repository / "config" / relative_path(name))
        if content is None:
            raise InstallError(f"Missing config/{name} listed in source-files.json.")
        source[name] = content
    return source


def atomic_write(path, content):
    safe_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, pending = tempfile.mkstemp(prefix=".agent-herdr-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(pending, path)
    finally:
        if os.path.exists(pending):
            os.unlink(pending)


def apply_changes(home, changes):
    for name, change in changes.items():
        if read_bytes(home / name) != change["before"]:
            raise InstallError(f"{home / name} changed during installation. Retry after editing stops.")
    for name, change in changes.items():
        if change["after"] is None:
            (home / name).unlink()
        else:
            atomic_write(home / name, change["after"])
