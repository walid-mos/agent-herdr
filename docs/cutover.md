# Safe cutover

Use a fresh checkout of the Herdr repository named by `sources.json`. Source installation must succeed before the previous source owners stop writing Herdr files.

1. Inventory every custom mod and config on both Macs. Compare live files with chezmoi and the previous sandbox installer. Copy sanitized source, including MacBook-only work, into this repository before retiring its owner. Exclude credentials, machine addresses, quota caches, sessions and generated files.
2. Back up the writable Herdr profile and core registration/state directories privately on each machine. Keep the backup outside this repository. Close automated profile sync while replacing source ownership, so it cannot race the install.
3. Create the private runtime JSON described in the README. Use an absolute `--home` and `--runtime` with `bin/install`. Resolve a conflict by importing the live edit or preserving it elsewhere first. Do not delete an unrecognized file to force success.
4. Verify the standard agent list, machine registrations and terminal sessions against shipped `main`. Confirm retained terminals keep their addresses, text and working folders. Check `herdr-app status` for errors and run the contributor checks against the installed profile. For Mac Studio, finish on a new personal copy of reset `main` with the custom agent strip and agent naming. Follow [the Mac task](mac-reset.md).
5. Run `bin/update` again. It should print no file changes. Edit a managed file in a disposable copy and confirm the update refuses it without writing other files. Keep successful applied revisions in the provisioner's state only after installation succeeds.
6. Replace the sandbox watchdog's installation step with delegation to this repository's update command after safe source refresh. Keep the scheduling cadence, serialize refresh/install, preserve task branches and dirty checkouts, and retry a failed installation on the next cycle. A change merged into the source main must still reach both Macs automatically.
7. Only after both Macs and desktop sandboxes pass, remove the previous sandbox pane source and installer through its owner, and remove chezmoi ownership through the dotfiles owner. Do not run a forced chezmoi apply over the new installation. Recheck that no old writer can reinstall stale code.

The first move to the new public repositories requires a fresh clone because their histories start over. Keep private runtime and writable profiles outside the source checkout. After that initial move, the provisioner can use its usual guarded fast-forward refresh.

## Failure outcomes

| Failure | What remains |
| --- | --- |
| Invalid runtime, receipt, symlink or edited managed file | No planned file changes are applied. |
| IO failure during application | Already completed atomic files may remain, the receipt stays old, and the next run accepts matching desired files and retries the rest. |
| A live layout or key file already exists | Layouts remain untouched and occupied keys retain their bindings. |
| Headless installation | Desktop files remain untouched. |

## Inventory and source ownership

Custom mods share one implementation across computers and activate only when added to a personal layout. Herdr supplies the standard views. Discord owns pot management, so this source retires Command Center, its changes panel, Pots and its terminal drawer. The fresh standard view also retires `agent-notify`, `my-tabs` and `usage`, which no kept mod imports. Generated type declarations, instruction files and jsconfig are excluded. Adoption hashes identify exact imported files, including the shared helpers previously copied into Pots. No previous source owner is removed by this import. Only paths explicitly listed as retired in provenance.json can be removed on first adoption, and each must match a recorded source hash.

## Competing writers

- **Dotfiles owner.** At `walid-mos/dotfiles@bcb45e5cc27133b658986ce33a7168001d46fa52`, chezmoi maps `dot_config/herdr-app/` to `~/.config/herdr-app/`. In that source it owns `mods/agent-notify/{main.js,mod.json,jsconfig.json}`, `mods/pots/`, `layouts/main-notify.{json,svg}`, `keys.json`, `settings.json`, `themes/` and overlapping copies under `mods/{agent-strip,agent-naming,current-session,session-picker}/`. The `main-notify` layout references `agent-notify` and `pots`. Once the replacement is verified on both Macs, remove these paths from chezmoi ownership. Leave actual personal layouts, generated files, live settings and keys on disk. Avoid a `.chezmoiremove` entry or forced apply. Verify `chezmoi managed` has no overlap with the new ownership.
- **Sandbox owner.** At `walid-mos/agent-sandbox@7d7bfd34e97d314d77c1bfe3aeb53866533df77e`, `mac/update` calls `bin/install-herdr` on each watchdog run, even if its sandbox source did not advance. With `herdrEnabled` true, `bin/install-herdr` uses `session/agent-sources.json` and the private source URL override if present. `lib/source_refresh.py` fast-forwards the clean Herdr source checkout at `~/.local/share/agent-herdr` on `main` to the fetched `main`. `lib/agent_sources.py` writes `~/.config/agent-sandbox/herdr-runtime.json` and passes it to `bin/update` against `~/.config/herdr-app`. The prior Herdr main at `0ad0afb16624d8545aa494970627463beda29868` still ships `agent-notify`, `my-tabs` and `usage` and generates `mods/usage/runtime.js`. If the watchdog selects that source after the trim is installed, `bin/update` reinstalls the missing files and records them again in the receipt. With delegation off, the fallback uses `herdr/` and the existing Command Center `ui.js` and `state.js` to write `mods/pots/` and `mods/pots-terminals/` and can reseed the old Pots bindings. After cutover verification, remove the fallback and its bundled pane source. Keep the guarded delegated refresh and install, and make a disabled desktop install leave the profile alone. Preserve the existing runtime argument contract until both repositories agree to change it.
- **Mac operator.** Profile sync can copy old installed files back from the other Mac. Pause it for the cutover and exclude the installer-managed paths, or verify both ends use the same approved source before resuming.

## Retired views

Installation removes only receipt-owned or hash-recognized retired files. It never edits saved layouts, their click state, existing keys, terminal splits, conversations, registrations or credentials to force a visual reset. Old layout references and shortcuts can therefore remain after an update. Unknown files in a retired mod folder remain untouched. A retained personal layout that names a retired mod needs operator review rather than an automatic rewrite.

Herdr's installed guide defines `layouts/<name>.json`, saved clicks under `layouts/.state/`, the selected layout in `shared.json`, and screen selection in `view.json`. The core's `herdr-app` document owns spaces, tabs, terminal splits and mod panes. Resetting that document would risk active sessions. The supported `layout.reset {name}` route resets a shipped layout and its clicks, and `layout.switch {name}` selects it. Neither is permission to close terminal panes or erase mod state.

The approved Mac run starts with read-only inventory of the installed command contract, active profile and core-saved mod panes. It resets and selects shipped `main`, then adds the agent strip and naming mounts only to a new personal copy. If the installed build cannot do that through scoped native commands, the run stops before live writes. Keep backups private and outside the checkout. The default run requires no restart. Follow [the Mac task](mac-reset.md).

Pot workers close through the sandbox's acknowledged-result path in their own Pi, independently of the Herdr window. Removing Command Center also removes its scheduling of the generic `agent-lifecycle` sweep for other terminals. No replacement UI timer is installed. Preserve workers with unread results, open goals or questions and active review children.

Import every modified live file into source before ownership of that file changes. Until then the installer refuses the edited managed file and preserves live keys and settings. Never add a live file's hash to `provenance.json` to accept stale source as adopted.

Retiring `agent-notify`, `my-tabs` and `usage` removes only their installed files. The alert queue under `~/.local/state/herdr-alerts` and the usage readings and account caches under `~/.local/state/herdr-usage` stay on each computer, and no source here reads or writes them again. Any reader of that alert queue stops receiving alerts. The `new-workbench` tab command leaves with `my-tabs`, while terminal watching stays with Pi's `terminal-watch` skill. A live key bound to a retired command stays bound, as other existing keys do.
