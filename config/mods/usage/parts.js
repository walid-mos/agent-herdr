import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { ago, msSince } from "./format.js";

export const STALE_AFTER_MS = 30 * 60_000;
const ICON_OF_PROVIDER = { claude: "icons/claude.svg", codex: "icons/codex.svg" };
const LEVELS = [
  { upTo: 5, tone: "blocked" },
  { upTo: 25, tone: "ansi3" },
  { upTo: 100, tone: "done" },
];
const TILE_PX = 22;

export const isStale = (iso, nowMs) => !iso || msSince(iso, nowMs) > STALE_AFTER_MS;

export const leftTone = (left) => (LEVELS.find((level) => left <= level.upTo) ?? LEVELS.at(-1)).tone;

export const leftColor = (t, left) => t[leftTone(left)];

export function providerTile(t, provider, name) {
  const icon = ICON_OF_PROVIDER[provider];
  const tile = div().flex_none().size(TILE_PX).rounded(6).flex().items_center().justify_center().bg(t.raised).border_1().border_color(t.border);
  if (icon) return tile.child(svg(icon).size(13).text_color(t.foreground));
  return tile.text_size(11).font_semibold().text_color(t.muted).child(String(name ?? provider ?? "?").slice(0, 1).toUpperCase());
}

export function sectionLabel(t, text, note) {
  return h_flex().px(4).pt(6).pb(2).gap(8).items_center()
    .child(div().flex_none().text_size(11).font_semibold().text_color(t.dim).child(text))
    .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(note ?? ""));
}

export function ageChip(t, iso, nowMs) {
  const isOld = isStale(iso, nowMs);
  const label = isOld ? `stale · read ${ago(iso, nowMs)}` : `read ${ago(iso, nowMs)}`;
  return div().flex_none().px(6).h(18).flex().items_center().rounded(5).text_size(11)
    .when(isOld, (el) => el.bg(`${t.ansi3}22`).text_color(t.ansi3))
    .when(!isOld, (el) => el.text_color(t.dim))
    .child(label);
}

export function notice(t, color, text) {
  return div().px(10).py(7).rounded(8).bg(`${color}18`).border_1().border_color(`${color}40`)
    .text_size(12).line_height("17px").text_color(t.foreground).child(text);
}
