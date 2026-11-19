import posixpath
import re
from pathlib import Path

from files import InstallError, digest, read_bytes, read_json, relative_path

MANAGED_ROOTS = ("mods", "themes")
SHARED_ROOT = "shared"
SEEDED_SETTINGS = "settings.json"
GENERATED_NAMES = frozenset(("jsconfig.json", "AGENTS.md", "gpui-kit.d.ts", "herdr.d.ts"))
RELATIVE_IMPORT = re.compile(rb'(?:from|import)\s*\(?\s*["\'](\.\.?/[^"\']+)["\']')
MODULE_SUFFIXES = (".js", ".mjs")


def check_runtime(path):
    if not isinstance(read_json(path), dict):
        raise InstallError("Runtime must be a JSON object.")


def managed_files(source):
    managed = {name: content for name, content in source.items()
               if Path(name).parts[0] in MANAGED_ROOTS and Path(name).name not in GENERATED_NAMES}
    shared = {posixpath.basename(name): content for name, content in source.items() if posixpath.dirname(name) == SHARED_ROOT}
    return link_imports(managed, shared)


def link_imports(managed, shared):
    """Herdr loads each mod from its own folder, so a missing sibling module is copied from config/shared."""
    linked, pending = dict(managed), sorted(name for name in managed if name.endswith(MODULE_SUFFIXES))
    while pending:
        importer = pending.pop()
        for match in RELATIVE_IMPORT.finditer(linked[importer]):
            name = posixpath.normpath(posixpath.join(posixpath.dirname(importer), match.group(1).decode()))
            if Path(name).parts[:2] != Path(importer).parts[:2]:
                raise InstallError(f"{importer} imports {name} from outside its mod folder, which Herdr cannot load.")
            if name in linked:
                continue
            module = shared.get(posixpath.basename(name))
            if posixpath.dirname(name) != posixpath.dirname(importer) or module is None:
                raise InstallError(f"{importer} imports missing {name}.")
            linked[name] = module
            pending.append(name)
    return linked


def managed_path(name):
    path = relative_path(name)
    if path.parts[0] not in MANAGED_ROOTS:
        raise InstallError(f"{name} is outside the managed {'/'.join(MANAGED_ROOTS)} folders.")
    return path


def check_provenance(managed, provenance):
    retired = set(provenance["retired"])
    for name in retired:
        managed_path(name)
    installed = sorted(retired & set(managed))
    if installed:
        raise InstallError(f"provenance.json retires {installed[0]}, which config/ still installs.")
    unexplained = [name for name in sorted(provenance["adoptable"])
                   if relative_path(name).parts[0] in MANAGED_ROOTS and name not in managed and name not in retired]
    if unexplained:
        raise InstallError(f"provenance.json adopts {unexplained[0]}, which is neither installed nor retired.")
    if retired - set(provenance["adoptable"]):
        raise InstallError("provenance.json must record adoption hashes for every retired file.")


def plan_managed(home, managed, previous, provenance):
    changes = {}
    adoptable = provenance["adoptable"]
    for name in sorted(set(managed) | set(previous) | set(provenance["retired"])):
        path = home / managed_path(name)
        if path.name in GENERATED_NAMES:
            continue
        before = read_bytes(path)
        after = managed.get(name)
        if before == after:
            continue
        allowed = [previous.get(name), *adoptable.get(name, [])]
        if before is not None and digest(before) not in allowed:
            raise InstallError(f"Local edit at {path}. Import or back up this file before installation.")
        changes[name] = {"before": before, "after": after}
    return changes


def plan_settings(source, home):
    if read_bytes(home / SEEDED_SETTINGS) is not None:
        return {}
    return {SEEDED_SETTINGS: {"before": None, "after": source[SEEDED_SETTINGS]}}
