import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { shortcutFor } from "./keyboard.js";
import { MOD } from "./state.js";

const ICONS = "mods/workspace-chrome";
const OWN_ICONS = Object.fromEntries(["inbox", "message-square", "code", "gauge"].map(name => [name, `mods/command-center/icons/${name}.svg`]));
const HOVERED_OPACITY = 0.9;
const MINUTE_MS = 60000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const TOKENS_PER_THOUSAND = 1000;
const TOKENS_PER_MILLION = 1000000;
const SPIN_MS = 900;
const PULSE = { from: 1, to: 0.35, period: 1400 };
const PRESSED_OPACITY = 0.7;
const KEYCAP = { height: 16, inset: 4, border: 1, text: 10 };
// Symbols and capitals fill the text size, a lowercase letter takes about half of it.
const KEYCAP_GLYPH_EMS = { wide: 1, narrow: 0.55 };
export const ICON_BUTTON_PX = 26;

export const TEXT = { micro: 10.5, small: 11.5, body: 12.5, title: 13.5 };
export const STATES = {
  ready: { label: "Ready", color: "done" },
  offline: { label: "Offline", color: "dim" },
  starting: { label: "Starting", color: "dim" },
  blocked: { label: "Needs input", color: "blocked" },
  done: { label: "Done", color: "done" },
  working: { label: "Working", color: "working" },
  idle: { label: "Idle", color: "idle" },
  new: { label: "Not started", color: "dim" },
};

export const stopPress = (_event, cx) => cx.stop_propagation();
export const icon = (name, size, color) => svg(OWN_ICONS[name] ?? `${ICONS}/${name}.svg`).size(size).flex_none().text_color(color);
export const pathTail = path => path.split("/").filter(Boolean).slice(-2).join("/");

export function label(text, size = TEXT.small, color = theme().muted) {
  return div().min_w(0).truncate().text_size(size).text_color(color).child(text);
}

export function elapsed(since) {
  if (!since) return "";
  const minutes = Math.floor((Date.now() - since) / MINUTE_MS);
  if (minutes < 1) return "now";
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return hours < HOURS_PER_DAY ? `${hours}h` : `${Math.floor(hours / HOURS_PER_DAY)}d`;
}

export function compactTokens(tokens) {
  if (!tokens) return "";
  if (tokens >= TOKENS_PER_MILLION) return `${(tokens / TOKENS_PER_MILLION).toFixed(1)}M`;
  return `${Math.round(tokens / TOKENS_PER_THOUSAND)}k`;
}

export const shortcut = command => shortcutFor(`${MOD}.${command}`);
export const withShortcut = (text, command) => [text, shortcut(command)].filter(Boolean).join("  ");
export const modelLabel = thread => [thread.model.split("/").at(-1), thread.effort].filter(Boolean).join(" · ");

const glyphBox = () => h_flex().size(14).flex_none().items_center().justify_center();

export function statusGlyph(state, id) {
  const color = theme()[STATES[state].color];
  const box = glyphBox();
  if (state === "working") return box.child(icon("spinner", 12, color).spin(SPIN_MS));
  if (state === "done") return box.child(icon("circle-check", 13, color));
  if (state === "blocked") return box.child(div().id(`pulse-${id}`).size(8).rounded_full().bg(color).loop("opacity", PULSE));
  if (state === "idle" || state === "ready") return box.child(div().size(6).rounded_full().bg(color));
  return box.child(div().size(7).rounded_full().border(1).border_color(color));
}

/** A state's mark at rest, for a column nobody is in: every animation redraws the whole window, so movement is kept for live threads. */
export function restingGlyph(state) {
  const color = theme()[STATES[state].color];
  if (state === "working") return glyphBox().child(icon("spinner", 12, color));
  if (state === "blocked") return glyphBox().child(div().size(8).rounded_full().bg(color));
  return statusGlyph(state, "resting");
}

export function programGlyph(program, size, color) {
  if (!program?.icon) return div().flex_none();
  const figure = program.tint ? svg(program.icon).size(size).text_color(color) : image(program.icon).w(size).h(size);
  return figure.flex_none();
}

export function chip(text, color = theme().muted) {
  return h_flex().h(18).px(6).flex_none().max_w(240).items_center().rounded(5).bg(theme().surface)
    .child(label(text, TEXT.micro, color));
}

export function keycap(text) {
  const colors = theme();
  return h_flex().h(KEYCAP.height).px(KEYCAP.inset).flex_none().items_center().rounded(4).border(KEYCAP.border).border_color(colors.border)
    .text_size(KEYCAP.text).text_color(colors.muted).child(text);
}

/** A keycap sizes itself. This estimate serves a container that animates its width and so needs it before layout. */
export function keycapWidth(text) {
  const ems = [...text].reduce((sum, glyph) => sum + (glyph === glyph.toUpperCase() ? KEYCAP_GLYPH_EMS.wide : KEYCAP_GLYPH_EMS.narrow), 0);
  return 2 * (KEYCAP.inset + KEYCAP.border) + ems * KEYCAP.text;
}

export function iconButton({ id, name, hint, action, isActive }) {
  const colors = theme();
  return h_flex().id(id).size(ICON_BUTTON_PX).flex_none().items_center().justify_center().rounded(6).cursor_pointer()
    .when(isActive, element => element.bg(colors.selected))
    .hover(style => style.bg(colors.hover)).active(style => style.opacity(PRESSED_OPACITY))
    .tooltip(hint).accessibility_label(hint).on_mouse_down("left", stopPress).on_click(action)
    .child(icon(name, 14, isActive ? colors.accent : colors.muted));
}

export function textButton({ id, text, hint, label, action, leading, leadingColor, keys: keyHint }) {
  const colors = theme();
  return h_flex().id(id).h(26).px(8).gap(6).flex_none().items_center().rounded(6).cursor_pointer()
    .hover(style => style.bg(colors.hover)).active(style => style.opacity(PRESSED_OPACITY))
    .when(hint, element => element.tooltip(hint)).when(label, element => element.accessibility_label(label))
    .on_mouse_down("left", stopPress).on_click(action)
    .when(leading, element => element.child(icon(leading, 13, leadingColor ?? colors.muted)))
    .child(div().flex_none().text_size(TEXT.small).text_color(colors.foreground).child(text))
    .when(keyHint, element => element.child(keycap(keyHint)));
}

export function solidButton({ id, text, action }) {
  const colors = theme();
  return h_flex().id(id).h(30).px(12).flex_none().items_center().rounded(7).cursor_pointer()
    .bg(colors.solid).text_color(colors.solid_foreground).text_size(TEXT.body).font_medium()
    .hover(style => style.opacity(HOVERED_OPACITY)).active(style => style.opacity(PRESSED_OPACITY))
    .on_mouse_down("left", stopPress).on_click(action).child(text);
}
