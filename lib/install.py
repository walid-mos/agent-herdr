import argparse
import fcntl
import sys
from pathlib import Path

from files import InstallError, apply_changes, atomic_write, digest, encode, read_json, read_source, real_parent, safe_path
from plan import check_provenance, load_runtime, managed_files, plan_managed, plan_seeds

REPOSITORY = Path(__file__).resolve().parents[1]
STATE = ".agent-herdr"


def arguments():
    parser = argparse.ArgumentParser(description="Install versioned Herdr files without replacing local edits or layouts.")
    parser.add_argument("--home", required=True, type=Path, help="Absolute Herdr app profile directory")
    parser.add_argument("--profile", required=True, choices=("desktop", "headless"))
    parser.add_argument("--runtime", type=Path, help="Absolute JSON file containing private usage collector settings")
    options = parser.parse_args()
    if not options.home.is_absolute():
        parser.error("--home must be absolute")
    if options.profile == "desktop" and (options.runtime is None or not options.runtime.is_absolute()):
        parser.error("desktop requires --runtime with an absolute JSON path")
    return options


def install_locked(home, runtime):
    receipt_path = home / STATE / "receipt.json"
    previous = read_json(receipt_path, {})
    if not isinstance(previous, dict) or any(not isinstance(value, str) for value in previous.values()):
        raise InstallError("Invalid receipt. Restore .agent-herdr/receipt.json before updating.")
    provenance = read_json(REPOSITORY / "provenance.json")
    source = read_source(REPOSITORY)
    managed = managed_files(source, runtime)
    check_provenance(managed, provenance)
    changes = plan_managed(home, managed, previous, provenance)
    changes.update(plan_seeds(source, home))
    apply_changes(home, changes)
    receipt = {name: digest(managed[name]) for name in sorted(managed)}
    if receipt != previous:
        atomic_write(receipt_path, encode(receipt))
    for name in changes:
        print(f"{'Removed' if changes[name]['after'] is None else 'Installed'} {home / name}")


def install(options):
    if options.profile == "headless":
        print("Headless profile: no desktop configuration installed.")
        return
    runtime = load_runtime(real_parent(options.runtime))
    home = safe_path(real_parent(options.home))
    lock_path = safe_path(home / STATE / "install.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        install_locked(home, runtime)


def main():
    options = arguments()
    try:
        install(options)
    except (InstallError, OSError, ValueError, KeyError) as error:
        print(f"Herdr installation failed: {error}", file=sys.stderr)
        sys.exit(1)
