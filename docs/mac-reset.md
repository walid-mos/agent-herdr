# Mac fresh-view task

The source installer retires the old panels without resetting live views. A Mac operator must first establish the running app's profile, command contract and saved panes. This worker has no Mac execution route or native app, so the task below deliberately stops after read-only inventory.

Paste this task into the Mac thread only when the coordinator clears the BOAT and model windows:

```text
Inspect the running Herdr window for the fresh-view reset. This task authorizes read-only inventory only. Stop after reporting it. Do not install, reset, reload, close panes, stop agents, change labels, or restart Herdr, pots sessions, relay, watcher, gateway or router. Do not sign, push main, call a model, or upload raw config.

Use the existing herdr-app and hc tools. If either is unavailable, report that and stop. Run herdr-app status, herdr-app ls and herdr-app commands. Use hc's read-only listing to record terminal addresses and their herdr.space, herdr.tab and pots worker labels. Do not print command arguments, conversation text, credentials or unrelated labels in the report.

Establish the active absolute HERDR_APP_HOME from the running app's supported metadata. Do not assume the shell's environment describes the running window. If the profile cannot be established without guessing, report that and stop. Read its installed AGENTS.md and command declarations to verify layout.reset and layout.switch accept name=main. Inspect only the layout names and mod references needed to identify Command Center, Pots, Studio, main-notify and custom mod panes. Record the difference between a layout block and a core-saved mod pane. Never close a terminal pane to hide a mod.

Report the installed app version, active profile, selected layout, relevant command signatures, affected layout names and custom pane IDs, and the retained terminal addresses. Include only names, IDs and counts, with private machine/account names redacted. Identify any older installer or dotfiles writer that can restore the retired source. Do not change its owner here. If the native app offers no read-only way to identify it, report the missing fact.

STOP. Return the metadata to the coordinator. Send a concise report with:
hc exec --on mastermind pots wake --from mac-thread --note 'HERDR RESET: inventory only; reset not run; <sanitized findings and missing facts>'
Replace the bracketed text with the actual findings. This is the only remote write authorized by this task.
```

The follow-up reset must use the inventoried profile and installed command contract. Before writes, make a private readable backup of the complete profile, which includes layouts and `layouts/.state/`, `view.json`, `shared.json`, settings, keys and `.agent-herdr/`. Retain the backup locally, verify file readability and checksums, and establish a consistent snapshot if another process is writing. Preserve core state, conversations and credentials. Do not infer core storage locations from the profile path.

Apply the reviewed source with the installer only after accounting for previous writers and edited managed files. Reset and select the shipped `main` through the supported app commands. Treat core-saved mod panes separately using inventoried IDs and command semantics. Preserve every terminal and personal layout. Do not erase `view.json`, `shared.json` or the core document to obtain a clean screen. Any unavoidable reload needs an agreed idle window and a statement of its effect on unsaved UI state.

Prepare the rollback against that exact backup before executing the reset. Record the previous selected layout and retain its code so switching back can work after retired modules are removed. Restore only the files changed by the reset, after stopping the relevant profile writer in an agreed window. A blanket live copy over the profile could overwrite new state. Do not invent a restore command until its verified source and target paths are known.

Post-reset evidence must include native status and a private screenshot showing the standard agent list and terminals without old panels, unchanged terminal addresses and labels, a repeat installation with no writes, and confirmation that pot cleanup still uses acknowledged results. Never terminate a worker to test that path. Report through the same `hc exec --on mastermind pots wake` route with `HERDR RESET:`, including the local backup location and rollback procedure, without uploading the backup.
