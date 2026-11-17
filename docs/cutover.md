# Safe cutover

Use a fresh checkout of the Herdr repository named by `sources.json`. Source installation must succeed before the previous source owners stop writing Herdr files.

1. Inventory every custom mod and config on both Macs. Compare live files with chezmoi and the previous sandbox installer. Copy sanitized source, including MacBook-only work, into this repository before retiring its owner. Exclude credentials, machine addresses, quota caches, sessions and generated files.
2. Back up the writable Herdr profile and core registration/state directories privately on each machine. Keep the backup outside this repository. Close automated profile sync while replacing source ownership, so it cannot race the install.
3. Create the private runtime JSON for the usage collector as described in the README. Use an absolute `--home` and `--runtime` with `bin/install`. Resolve a conflict by importing the live edit or preserving it elsewhere first. Do not delete an unrecognized file to force success.
4. Use the shipped main layout and verify the standard agent list, machine registrations and terminal sessions. Confirm retained terminals keep their addresses, text and working folders. Check `herdr-app status` for errors, and run the contributor checks against the installed profile. An existing custom layout needs the separate reset described below.
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

Custom mods share one implementation across computers and activate only when added to a personal layout. Herdr supplies the standard views. Discord owns pot management, so this source retires Command Center, its changes panel, Pots and its terminal drawer. Generated type declarations, instruction files and jsconfig are excluded. Adoption hashes identify exact imported files, including the shared helpers previously copied into Pots. No previous source owner is removed by this import. Only paths explicitly listed as retired in provenance.json can be removed on first adoption, and each must match a recorded source hash.

## Retired views

Installation removes only receipt-owned or hash-recognized retired files. It never edits saved layouts, their click state, existing keys, terminal splits, conversations, registrations or credentials to force a visual reset. Old layout references and shortcuts can therefore remain after an update. Unknown files in a retired mod folder remain untouched. A retained personal layout that names a retired mod needs operator review rather than an automatic rewrite.

Herdr's installed guide defines `layouts/<name>.json`, saved clicks under `layouts/.state/`, the selected layout in `shared.json`, and screen selection in `view.json`. The core's `herdr-app` document owns spaces, tabs, terminal splits and mod panes. Resetting that document would risk active sessions. The supported `layout.reset {name}` route resets a shipped layout and its clicks, and `layout.switch {name}` selects it. Neither is permission to close terminal panes or erase mod state.

Read [the Mac task](mac-reset.md) before changing an existing window. It stops at read-only inventory until the installed command contract, active profile and saved custom panes are known. Keep backups private and outside the checkout. No restart is part of installation. If a reload is needed, report its exact effects and agree an idle window before proceeding.

Pot workers close through the sandbox's acknowledged-result path in their own Pi, independently of the Herdr window. Removing Command Center also removes its scheduling of the generic `agent-lifecycle` sweep for other terminals. No replacement UI timer is installed. Preserve workers with unread results, open goals or questions and active review children.

Import every modified live file into source before ownership of that file changes. Until then the installer refuses the edited managed file and preserves live keys and settings. Never add a live file's hash to `provenance.json` to accept stale source as adopted.

The collector still runs `magpie quota --json`. Set `usageMachine` in private runtime configuration to its source computer. The collector, account matching, polling and cache behavior are preserved. A separate display change shows consumed percentages as Claude does, calculated from each normalized remaining allowance. Remaining percentages stay available in tooltips. Credit balances keep their currency values. Quota account caches and readings remain local.
