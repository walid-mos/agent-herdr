# Safe cutover

Use a fresh checkout of the Herdr repository named by `sources.json`. Source installation must succeed before the previous source owners stop writing Herdr files.

1. Inventory every custom mod and config on both Macs. Compare live files with chezmoi and the previous sandbox installer. Copy sanitized source, including MacBook-only work, into this repository before retiring its owner. Exclude credentials, machine addresses, quota caches, sessions and generated files.
2. Back up the writable Herdr profile and core registration/state directories privately on each machine. Keep the backup outside this repository. Close automated profile sync while replacing source ownership, so it cannot race the install.
3. Create the private runtime JSON with that machine's sandbox records and the control path on those sandboxes. Use an absolute `--home` and `--runtime` with `bin/install`. Resolve a conflict by importing the live edit or preserving it elsewhere first. Do not delete an unrecognized file to force success.
4. Verify the existing screen, Command Center, quota panel, machine registrations and terminal sessions. In the Pots layout, use Cmd-T to open and hide the drawer. Confirm a retained terminal keeps its address, text and working folder. Check `herdr-app status` for errors, and run the contributor checks against the installed profile.
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

The common source includes Command Center, its changes panel, Magpie, the tab bar, the usage panel and its real collector. It seeds no layout. These components were previously unmanaged on the desktop and now share one implementation across Macs and desktop SealSkin. Generated type declarations, instruction files and jsconfig are excluded. Adoption hashes identify exact imported files, including the shared helpers previously copied into Pots. No previous source owner is removed by this import. Only paths explicitly listed as retired in provenance.json can be removed on first adoption, and each must match a recorded source hash.

Import every modified live file into source before ownership of that file changes. Until then the installer refuses the edited managed file and preserves live keys and settings. Never add a live file's hash to `provenance.json` to accept stale source as adopted.

The collector still runs `magpie quota --json`. Set `usageMachine` in private runtime configuration to its source computer. The collector, account matching, polling and cache behavior are preserved. A separate display change shows consumed percentages as Claude does, calculated from each normalized remaining allowance. Remaining percentages stay available in tooltips. Credit balances keep their currency values. Quota account caches and readings remain local.
