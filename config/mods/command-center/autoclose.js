import { exec, home, readTextFile, notify, layout } from "herdr";
import { currentView } from "./state.js";
import { removeFinishedAuxiliaries } from "./lifecycle.js";

const TIMEOUT_MS = 120000;
const COMMAND = `${home()}/.pi/agent/bin/agent-lifecycle`;
let lastFailure = "";

function shownTerminals(node) {
  const terminal = node.content?.terminal;
  return [...(terminal ? [terminal] : []), ...(node.children ?? []).flatMap(shownTerminals)];
}

export async function sweepFinished() {
  try {
    await removeFinishedAuxiliaries();
    if (!(await readTextFile(COMMAND))) return;
    const view = currentView();
    const attached = [...new Set([
      ...shownTerminals(layout()), view.terminal, view.monitor, view.shell,
    ].filter(Boolean))];
    const args = ["sweep", "--apply", "--json"];
    if (attached.length) args.push("--attached", attached.join(","));
    const result = await exec(COMMAND, args, { timeout: TIMEOUT_MS });
    if (result.code !== 0) throw new Error(result.stderr.trim() || `sweep exited ${result.code}`);
    lastFailure = "";
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    if (failure === lastFailure) return;
    lastFailure = failure;
    notify({ title: "Automatic closing is paused", body: failure, level: "warning" });
  }
}
