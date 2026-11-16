import { openOverlay, setShared, shared } from "herdr";
import { MOD, ENDING, currentView } from "./state.js";
import { threads } from "./threads.js";
import { endThreads } from "./lifecycle.js";
import { showView } from "./navigation.js";
import { pathTail } from "./ui.js";

const DIALOG = { width: 460, height: 208 };
const NAMED_THREADS = 3;

function question([thread, ...others]) {
  if (!others.length) {
    const warning = thread.state === "working" ? "It is working right now and stops mid-turn. " : "";
    return { title: "End this thread?", detail: `${warning}"${thread.title}" stops with its monitor and shell, and its memory is freed. `
      + `The conversation stays on disk and can be resumed from ${pathTail(thread.cwd) || "its folder"}.` };
  }
  const list = [thread, ...others];
  const unnamed = list.length - NAMED_THREADS;
  const names = list.slice(0, NAMED_THREADS).map(item => item.title).join(", ");
  return { title: `End ${list.length} threads?`, detail: `${names}${unnamed > 0 ? ` and ${unnamed} more` : ""}. `
    + "Their agents stop and their memory is freed. Each conversation stays on disk and can be resumed from its folder." };
}

/** The shipped confirm dialog can only run a command, so the threads it asks about wait in shared state for that command. */
export function askToEnd(list) {
  if (!list.length) return;
  setShared(ENDING, list.map(thread => thread.address));
  openOverlay({ mod: "confirm", kind: "dialog", ...DIALOG, props: { ...question(list), command: { name: `${MOD}.end-confirmed` } } });
}

export function endConfirmed() {
  const asked = shared(ENDING) ?? [];
  setShared(ENDING, null);
  endThreads(threads().filter(thread => asked.includes(thread.address)));
  if (asked.includes(currentView().terminal)) showView({ mode: "home", source: "keyboard" });
}
