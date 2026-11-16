import { exec, machines, appHome } from "herdr";

import { SOURCE_MACHINE, SOURCE_HOME } from "./runtime.js";
const COLLECTOR = "mods/usage/collector/collect.mjs";
const COLLECT_TIMEOUT_MS = 90_000;

export const sourceMachine = () => (machines().some((machine) => machine.name === SOURCE_MACHINE) ? SOURCE_MACHINE : null);

// zsh reads ~/.zshenv, which exports PATH and the core-vault provider keys the adapters use. A computer without zsh uses its own login shell, whose banner lines precede the one-line JSON result.
const RUN_COLLECTOR = `collector_home=\${1:-$HOME/.config/herdr-app}; if command -v zsh >/dev/null; then exec zsh -c 'exec node "$0/${COLLECTOR}"' "$collector_home"; fi; exec "\${SHELL:-/bin/sh}" -lc 'exec node "$0/${COLLECTOR}"' "$collector_home"`;

export async function collect(machine) {
  const result = await exec("sh", ["-c", RUN_COLLECTOR, "sh", machine ? SOURCE_HOME : appHome()], { on: machine, timeout: COLLECT_TIMEOUT_MS });
  if (result.code !== 0) throw new Error(result.stderr.trim().split("\n").at(-1) || `the collector exited with code ${result.code}`);
  return JSON.parse(result.stdout.trimEnd().split("\n").at(-1));
}
