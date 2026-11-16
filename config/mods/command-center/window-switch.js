import { run, notify, focused } from "herdr";
import { currentView, principalChat } from "./state.js";
import { showView, isPotsLayout } from "./navigation.js";
import { windowTerminal, selectWindowMode, toggleChanges, ownerOf } from "./window-modes.js";

/** The inspector's shell is the same terminal as the window's Shell mode, and one terminal cannot show in two places. */
function viewAfterSwitch(address) {
  const view = currentView();
  const isShownTwice = view.mode === "inspect" && windowTerminal(address) === view.shell;
  return isShownTwice ? { mode: "thread", terminal: view.terminal, source: "pointer" } : view;
}

export async function switchWindow(address, kind) {
  try {
    if (kind === "changes") await toggleChanges(address);
    else await selectWindowMode(address, kind);
    showView(viewAfterSwitch(address));
    run("pane.focus", { terminal: windowTerminal(address) });
  } catch (error) {
    notify({ title: "The window could not switch", body: error instanceof Error ? error.message : String(error), level: "error" });
  }
}

/** Keys act on the agent window that has the keyboard, through its shell or nvim too. The Pots pane is no agent window. */
export function switchFocusedWindow(kind) {
  const shownPrincipal = isPotsLayout() ? null : principalChat();
  const address = ownerOf(focused()?.terminal ?? null) ?? currentView().terminal ?? shownPrincipal;
  if (address) switchWindow(address, kind);
}
