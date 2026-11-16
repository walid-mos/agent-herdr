import { openOverlay, closeOverlay, shared, setShared, theme, settings } from "herdr";
import { textButton, shortcut } from "./ui.js";

// Written by the usage mod: its summary for this button, the id of its dropdown while open, and the press that dismissed it.
const USAGE = { mod: "usage", state: "usage.state", open: "usage.open", dismissed: "usage.dismissed" };
const MENU_PX = { width: 560, below: 4, margin: 10 };
const MENU_HEIGHT_SHARE = 0.9;
const NO_SUMMARY = { text: "Usage", tone: "muted", label: "Subscription limits and prepaid credits" };

const zoom = () => Number(settings()?.zoom) || 1;
const isSamePoint = (a, b) => a?.x === b.x && a?.y === b.y;

/** The top-bar usage button and its dropdown, anchored under the button from the sizes the bar reports. */
export class UsageMenu {
  constructor(barInsetPx) {
    this.barInsetPx = barInsetPx;
    this.sizes = {};
    this.overlay = null;
    this.wasOpenAtPress = false;
  }

  measure(part, size) {
    this.sizes[part] = size;
  }

  isOpen() {
    return Boolean(this.overlay) && shared(USAGE.open) === this.overlay;
  }

  /** Closes whichever dropdown is open, ours or one left by an earlier copy of this button. */
  closeOpen() {
    const open = this.isOpen() ? this.overlay : shared(USAGE.open);
    if (open) closeOverlay(open);
    this.overlay = null;
  }

  anchor() {
    const { bar, actions, button } = this.sizes;
    if (!bar || !actions || !button) return "pointer";
    // Measured sizes and `at` are window pixels; MENU_PX and the overlay width are scaled by zoom.
    const scale = zoom();
    const width = MENU_PX.width * scale;
    const margin = MENU_PX.margin * scale;
    const buttonRight = bar.width - this.barInsetPx * scale - actions.width + button.width;
    const x = Math.min(Math.max(margin, buttonRight - width), bar.width - width - margin);
    return { x, y: (bar.height + button.height) / 2 + MENU_PX.below * scale };
  }

  press(event) {
    const dismissed = shared(USAGE.dismissed);
    const isDismissedByThisPress = dismissed?.overlay === this.overlay && isSamePoint(dismissed.at, event.position);
    if (isDismissedByThisPress) setShared(USAGE.dismissed, null);
    this.wasOpenAtPress = this.isOpen() || isDismissedByThisPress;
  }

  click() {
    const wasOpen = this.wasOpenAtPress;
    this.wasOpenAtPress = false;
    if (!wasOpen) return this.open();
    this.closeOpen();
  }

  toggle() {
    if (this.isOpen()) return this.closeOpen();
    this.open();
  }

  open() {
    // The usage mod draws its own panel, as tall as its rows up to this height, so a short list leaves no empty frame.
    this.overlay = openOverlay({ mod: USAGE.mod, kind: "popup", frame: "none", width: MENU_PX.width, height: MENU_HEIGHT_SHARE, at: this.anchor() });
  }

  button() {
    const summary = shared(USAGE.state)?.summary ?? NO_SUMMARY;
    return textButton({
      id: "usage", text: summary.text, label: summary.label, leading: "gauge", leadingColor: theme()[summary.tone],
      keys: shortcut("usage"), action: () => this.click(),
    })
      // Herdr closes the open dropdown on this same press, before this handler runs; the dropdown records that press for us.
      .on_mouse_down("left", (event, cx) => { cx.stop_propagation(); this.press(event); })
      .on_size_change(size => this.measure("button", size));
  }
}
