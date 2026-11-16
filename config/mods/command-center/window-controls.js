import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { iconButton, withShortcut } from "./ui.js";
import { windowMode, isShowingChanges } from "./window-modes.js";
import { switchWindow } from "./window-switch.js";

const MODES = [
  { kind: "agent", icon: "message-square", title: "Agent" },
  { kind: "shell", icon: "terminal", title: "Shell in the agent's folder" },
  { kind: "nvim", icon: "code", title: "Nvim in the agent's folder" },
];
const SEGMENT_INSET_PX = 2;
// Concentric with the 6 px buttons inside it.
const SEGMENT_RADIUS_PX = 8;

const modeButton = (address, item) => iconButton({
  id: `window-${item.kind}`, name: item.icon, isActive: windowMode(address) === item.kind,
  hint: withShortcut(item.title, `window-${item.kind}`), action: () => switchWindow(address, item.kind),
});

/** Agent, Shell and Nvim replace each other in the window; Changes opens beside it. The header keeps the agent's status in every mode. */
export function windowControls(thread) {
  if (!thread) return h_flex().flex_none();
  const changesHint = isShowingChanges(thread.address) ? "Hide changes" : "Show this agent's changes";
  return h_flex().flex_none().items_center().gap(4)
    .child(h_flex().flex_none().items_center().gap(1).p(SEGMENT_INSET_PX).rounded(SEGMENT_RADIUS_PX).bg(theme().surface)
      .children(MODES.map(item => modeButton(thread.address, item))))
    .child(iconButton({ id: "window-changes", name: "git-compare", isActive: isShowingChanges(thread.address),
      hint: withShortcut(changesHint, "window-changes"), action: () => switchWindow(thread.address, "changes") }));
}
