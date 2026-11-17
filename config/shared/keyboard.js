import { keys, window } from "herdr";

const KEY_SYMBOLS = { left: "←", right: "→", up: "↑", down: "↓", enter: "↵", escape: "esc" };
const PLATFORMS = {
  macos: { symbols: { ...KEY_SYMBOLS, cmd: "⌘", alt: "⌥", shift: "⇧", ctrl: "⌃" }, click: "Command", enter: "⌘↵" },
  linux: { symbols: { ...KEY_SYMBOLS, cmd: "Super+", alt: "Alt+", shift: "Shift+", ctrl: "Ctrl+" }, click: "Control", enter: "Ctrl+↵" },
};
const platform = () => PLATFORMS[window()?.platform] ?? PLATFORMS.linux;

export function keyHint(key) {
  const { symbols } = platform();
  return key.split(/-(?=.)/).map(part => symbols[part] ?? part.toUpperCase()).join("");
}

export function shortcutFor(action) {
  const binding = keys().find(item => item.action === action);
  return binding ? keyHint(binding.keys) : "";
}

export const platformClick = () => platform().click;
export const platformEnter = () => platform().enter;
