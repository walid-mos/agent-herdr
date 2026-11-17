# Contributing

These rules apply to people and agents changing this repository. Each scope may add its own AGENTS.md.

## Guarantees

A change that weakens one is wrong, even when it compiles.

1. Installation preserves existing layouts, registrations, keys, sessions and runtime state because the desktop can be running during updates.
2. A local edit to a managed file blocks installation before planned writes because live Mac work must survive consolidation.
3. Source updates and installation are separate because fetch credentials must not reach installed code.
4. Machine names, control paths and private account information stay outside tracked source because this tree is published.
5. Headless profiles do not install a desktop because control-only sessions need no UI.

## Architecture rules

- **Keep source separate from the writable profile.** Herdr rewrites shipped files and the drawer writes layouts.
- **Put installation IO behind the file operations module.** Plans must validate every managed target before applying changes.
- **Read build and final source identities from sources.json.** A clean repository import cannot rely on redirects or shared Git history.
- **Read docs/cutover.md before changing ownership or installation.** Old writers must stop only after the replacement works.

## Code rules

Preserve imported mod behavior unless a required compatibility correction is demonstrated by the native app. Record imported revisions and adoption hashes in provenance.json. Never put runtime output or quota caches into config/. Mods must not assume macOS: branch on `window().platform` or look the tool up, and resolve installed paths from `appHome()`.

## Checks

Run `./bin/check` for JSON, JavaScript, Python and shell syntax. After installing into a disposable initialized profile, run `DISPLAY=:1 ./bin/check --installed-home ABSOLUTE_PROFILE` and exercise the native app. Herdr mods are GPUI JavaScript, not browser components, so browser DOM checks do not apply. Installation uses Python standard library only, with no dependency runner or project secret consumer.

Verify repeated installation writes nothing, edited files fail before writes, unknown files survive, and live layouts and state remain byte-identical. Use disposable profiles for these checks. Do not edit existing tests or add a runner for a source migration.

## Commits

Use atomic Conventional Commits. Run the source check at each code commit. Leave the pull request in draft for the coordinator's readiness and merge decision.

## Documentation

Document ownership, failure behavior and operating contracts. Avoid duplicating values already defined by source.

**The docs describe the intended behavior.** That covers `docs/`, the README and the `AGENTS.md` files. When a change makes them wrong, do not just rewrite them to match. First check that the change is expected: the task asks for it, or the user confirms it.
- If it is expected, update the docs in the same commit as the change.
- If it is not, the docs win. Bring the code back in line with them, or stop and ask.

## Working against real systems

A live Mac install needs a Mac execution route and the operator's cutover instructions. Preserve backups locally and clean disposable profiles after verification. Never kill terminals or change another profile to validate an install.

## Extending

Add shared custom mods under config/mods with `place: none`. Herdr's shipped layouts are the views, so config/ holds no layout and the installer seeds none. Stage added or removed config paths and run `python3 bin/source-files` before checking. The installer reads this versioned manifest and ignores untracked files. Keep per-machine inputs in runtime JSON. Add source imports to provenance only after checking the exact source revision and excluding secrets and private machine details.
