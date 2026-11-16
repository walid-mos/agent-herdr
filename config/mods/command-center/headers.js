import { div } from "gpui-kit";
import { windowControls } from "./window-controls.js";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, terminals } from "herdr";
import { currentView, meta, potsStatus, MOD, PRINCIPAL } from "./state.js";
import { threads, ordered, counts, principal } from "./threads.js";
import { goHome, openNextWaiting, stepThread, shownThread, isPotsLayout, MOTION, LAYOUT } from "./navigation.js";
import {
  TEXT, STATES, ICON_BUTTON_PX, label, chip, keycap, keycapWidth, icon, iconButton, textButton, statusGlyph, programGlyph,
  withShortcut, shortcut, elapsed, compactTokens, pathTail, modelLabel, stopPress, solidButton,
} from "./ui.js";
import { shortcutFor } from "./keyboard.js";

const TRAFFIC_LIGHTS_PX = 82;
const BAR_GAP_PX = 8;
export const BAR_INSET_PX = 12;
const CRUMB_INSET_PX = 5;
const BACK_GAP_PX = 4;
// The keycap's width is estimated, so the reveal keeps this much room past it and never clips a rebound key.
const BACK_SLACK_PX = 5;
const PRINCIPAL_BUSY = ["working", "blocked"];

const bar = () => h_flex().size_full().min_w(0).items_center().gap(BAR_GAP_PX).px(BAR_INSET_PX).text_color(theme().foreground);
const divided = element => element.border_b(1).border_color(theme().border);
const strong = text => div().min_w(0).truncate().font_semibold().text_size(TEXT.body).child(text);
const backWidth = key => ICON_BUTTON_PX + (key ? BACK_GAP_PX + keycapWidth(key) : 0) + BACK_SLACK_PX;

function tallyPill({ id, state, text, hint, action }) {
  const colors = theme();
  return h_flex().id(id).h(22).px(8).gap(6).flex_none().items_center().rounded_full().bg(colors.surface).cursor_pointer()
    .hover(style => style.bg(colors.hover)).tooltip(hint).on_mouse_down("left", stopPress).on_click(action)
    .child(statusGlyph(state, id))
    .child(div().text_size(TEXT.small).text_color(colors.foreground).child(text));
}

const crumbRoot = () => h_flex().id("crumb-home").h(22).px(CRUMB_INSET_PX).flex_none().items_center().rounded(5)
  .font_semibold().text_size(TEXT.body).child("Command Center");
const homeLink = element => element.cursor_pointer().hover(style => style.bg(theme().hover)).tooltip(withShortcut("Back to Home", "home"))
  .on_mouse_down("left", stopPress).on_click(() => goHome("pointer"));

const switchLayoutButton = ({ id, text, layoutName }) => textButton({
  id, text, leading: "layers", keys: shortcutFor("layout.switch"), hint: `Switch to the ${text} layout`,
  action: () => run("layout.switch", { name: layoutName }),
});

export function titlebar(usageMenu) {
  const colors = theme();
  const thread = shownThread();
  const tally = counts(threads());
  const errors = meta().errors;
  return bar().id("titlebar").pl(TRAFFIC_LIGHTS_PX - CRUMB_INSET_PX).on_size_change(size => usageMenu.measure("bar", size))
    .child(h_flex().min_w(0).items_center().gap(BAR_GAP_PX - CRUMB_INSET_PX)
      .child(thread ? homeLink(crumbRoot()) : crumbRoot())
      .child(label("/", TEXT.body, colors.dim).flex_none())
      .child(label(thread ? `${thread.project} / ${thread.title}` : "Home", TEXT.body).pl(CRUMB_INSET_PX)))
    .child(div().flex_1())
    .when(errors.length > 0, element => element.child(h_flex().id("meta-warning").flex_none().tooltip(errors.join("\n"))
      .child(label("Some details are stale", TEXT.small, colors.blocked))))
    .when(tally.needs > 0, element => element.child(tallyPill({
      id: "tally-needs", state: "blocked", text: `${tally.needs} need${tally.needs === 1 ? "s" : ""} you`,
      hint: withShortcut("Open the next thread that needs you", "needs"), action: () => openNextWaiting(),
    })))
    .when(tally.working > 0, element => element.child(tallyPill({
      id: "tally-working", state: "working", text: `${tally.working} working`,
      hint: `${tally.working} of ${tally.total} threads are running`, action: () => goHome("pointer"),
    })))
    .child(h_flex().id("bar-actions").flex_none().items_center().gap(BAR_GAP_PX).on_size_change(size => usageMenu.measure("actions", size))
      .child(usageMenu.button())
      .child(textButton({ id: "search", text: "Search", leading: "search", keys: shortcut("search"), action: () => run(`${MOD}.search`) }))
      .child(switchLayoutButton({ id: "studio", text: "Studio", layoutName: "Studio" })));
}

/** Studio's way back: the same button at the same top-right spot as Studio's in the Command center bar. */
export function layoutReturn() {
  const colors = theme();
  return bar().justify_end().bg(colors.chrome).border_b(1).border_color(colors.border)
    .child(switchLayoutButton({ id: "command-center", text: "Command Center", layoutName: LAYOUT }));
}

function principalState(thread) {
  if (!thread) return "offline";
  if (!thread.app) return "starting";
  return PRINCIPAL_BUSY.includes(thread.state) ? thread.state : "ready";
}

/** A Pots bot has no terminal on this machine: its pane reports the bot, state and model shown here. */
function principalSummary() {
  if (isPotsLayout()) {
    const { state, model, bot } = potsStatus();
    return { title: bot, state, chips: ["Pots", model], thread: null };
  }
  const thread = principal();
  return {
    title: PRINCIPAL.title, state: principalState(thread), thread,
    chips: [thread?.model && modelLabel(thread), thread?.tokens > 0 && `${compactTokens(thread.tokens)} ctx`],
  };
}

export function principalHeader() {
  const colors = theme();
  const view = currentView();
  const { title, state, chips, thread } = principalSummary();
  const homeKey = shortcut("home");
  return divided(bar())
    .child(h_flex().id("back-reveal").w(view.mode === "home" ? 0 : backWidth(homeKey)).flex_none().gap(BACK_GAP_PX).items_center().overflow_hidden()
      .when(view.source === "pointer", element => element.transition("width", MOTION))
      .child(iconButton({ id: "back", name: "chevron-left", hint: withShortcut("Back to Home", "home"), action: () => goHome("pointer") }))
      .when(Boolean(homeKey), element => element.child(keycap(homeKey))))
    .child(statusGlyph(state, "principal"))
    .child(h_flex().flex_1().min_w(0).gap(BAR_GAP_PX).items_center().overflow_hidden()
      .child(strong(title).flex_none())
      .child(label(STATES[state].label, TEXT.small, colors.muted).flex_none())
      .child(div().flex_1())
      .children(chips.filter(Boolean).map(text => chip(text))))
    .child(windowControls(thread));
}

function threadChips(thread) {
  const colors = theme();
  return [
    h_flex().gap(4).flex_none().items_center().child(programGlyph(thread.program, 12, colors.muted)).child(label(thread.project, TEXT.small, colors.muted)),
    thread.branch && h_flex().gap(3).flex_none().items_center().child(icon("git-branch", 11, colors.dim)).child(label(thread.branch, TEXT.small, colors.dim).max_w(220)),
    thread.model && chip(modelLabel(thread)),
    thread.tokens > 0 && chip(`${compactTokens(thread.tokens)} ctx`),
    label(`${STATES[thread.state].label} · ${elapsed(thread.since)}`, TEXT.small, colors[STATES[thread.state].color]).flex_none(),
  ].filter(Boolean);
}

export function threadHeader(actions) {
  const colors = theme();
  const thread = shownThread();
  if (!thread) return divided(bar()).child(label("This thread has ended."));
  const list = ordered(threads());
  const position = list.findIndex(item => item.address === thread.address) + 1;
  return divided(bar())
    .child(statusGlyph(thread.state, "thread-heading"))
    .child(strong(thread.title))
    .child(h_flex().flex_1().min_w(0).gap(8).items_center().overflow_hidden().children(threadChips(thread)))
    .child(label(`${position}/${list.length}`, TEXT.micro, colors.dim).flex_none())
    .child(iconButton({ id: "previous-thread", name: "chevron-left", hint: withShortcut("Previous thread", "previous"), action: () => stepThread(-1) }))
    .child(iconButton({ id: "next-thread", name: "chevron-right", hint: withShortcut("Next thread", "next"), action: () => stepThread(1) }))
    .child(windowControls(thread))
    .child(iconButton({ id: "end-thread", name: "x", hint: withShortcut("End thread", "end"), action: () => actions.end([thread]) }));
}

export function monitorHeader() {
  const colors = theme();
  const thread = shownThread();
  const monitor = terminals().find(terminal => terminal.address === currentView().monitor);
  const state = monitor?.status === "working" ? "working" : "ready";
  return divided(bar())
    .child(statusGlyph(state, "monitor"))
    .child(strong("Monitor"))
    .child(label(thread ? `Read-only agent watching ${thread.title}` : "Read-only agent", TEXT.small, colors.muted));
}

export function shellHeader() {
  const colors = theme();
  const thread = shownThread();
  return divided(bar())
    .child(icon("terminal", 13, colors.muted))
    .child(strong("Shell"))
    .child(label(thread ? pathTail(thread.cwd) : "", TEXT.small, colors.muted))
    .child(div().flex_1())
    .when(Boolean(thread?.branch), element => element.child(h_flex().gap(3).flex_none().items_center()
      .child(icon("git-branch", 11, colors.dim)).child(label(thread.branch, TEXT.small, colors.dim).max_w(200))));
}

export function offlinePanel({ isStarting, onStart }) {
  const colors = theme();
  return v_flex().size_full().items_center().justify_center().gap(10).p(24)
    .child(icon("terminal", 22, colors.dim))
    .child(div().font_semibold().text_size(TEXT.title).text_color(colors.foreground).child("Principal is offline"))
    .child(label("Its pi session has ended. Threads keep running, and starting it resumes its latest conversation.", TEXT.small))
    .child(solidButton({ id: "start-principal", text: isStarting ? "Starting…" : "Start Principal", action: onStart }));
}
