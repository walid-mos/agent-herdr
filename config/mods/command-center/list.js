import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { theme, setShared } from "herdr";
import { platformClick, platformEnter } from "./keyboard.js";
import { FILTER, currentView, statusFilter } from "./state.js";
import { threads, sections, ordered, matching, needsYou, FILTERS } from "./threads.js";
import { SHORTCUT_SLOTS, focusPrincipal } from "./navigation.js";
import { TEXT, STATES, label, icon, keycap, statusGlyph, programGlyph, elapsed, compactTokens, modelLabel, shortcut, stopPress } from "./ui.js";

const hints = () => [["↑↓", "select"], ["↵", "open"], [platformEnter(), "with monitor"], [shortcut("end"), "end"], ["tab", "filter"], ["esc", "clear"]]
  .filter(([key]) => key);
const threadsIn = rows => rows.filter(row => row.thread).map(row => row.thread);
const groupTitle = group => (group.machine ? `${group.project} on ${group.machine}` : group.project);

function rowFacts(thread, project) {
  const colors = theme();
  const facts = [project, thread.branch, modelLabel(thread), thread.tokens > 0 && `${compactTokens(thread.tokens)} ctx`];
  return h_flex().gap(6).items_center().min_w(0)
    .child(programGlyph(thread.program, 11, colors.dim))
    .child(label(STATES[thread.state].label, TEXT.small, colors[STATES[thread.state].color]).flex_none())
    .child(label(facts.filter(Boolean).join("  ·  "), TEXT.small, colors.dim));
}

function threadRow(thread, { isSelected, isListFocused, slot, isProjectShown, onOpen }) {
  const colors = theme();
  const isWaiting = needsYou(thread);
  return h_flex().id(`row-${thread.address}`).w_full().flex_none().items_start().gap(9).px(10).py(7).rounded(7).cursor_pointer()
    .when(Boolean(thread.isChild), element => element.pl(30))
    .when(isSelected, element => element.bg(isListFocused ? colors.selected : colors.surface))
    .hover(style => style.bg(colors.hover)).on_mouse_down("left", stopPress).on_click(onOpen)
    .accessibility_label(`Open ${thread.title}, ${STATES[thread.state].label}. ${platformClick()} click also opens its monitor and shell.`)
    .child(div().pt(1).flex_none().child(statusGlyph(thread.state, thread.address)))
    .child(v_flex().flex_1().min_w(0).gap(3)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(TEXT.body).text_color(colors.foreground)
          .when(isWaiting, element => element.font_semibold()).child(thread.title))
        .child(label(elapsed(thread.since), TEXT.micro, colors.dim).flex_none())
        .when(Boolean(slot), element => element.child(keycap(slot))))
      .child(rowFacts(thread, isProjectShown ? thread.project : null))
      .when(isWaiting && Boolean(thread.preview), element => element.child(label(thread.preview, TEXT.small, colors.muted))));
}

function sectionHeading({ id, title, count, leading, color }) {
  const colors = theme();
  return h_flex().id(`section-${id}`).w_full().flex_none().h(26).px(10).gap(6).items_center()
    .child(icon(leading, 12, color ?? colors.dim))
    .child(div().flex_none().font_semibold().text_size(TEXT.small).text_color(color ?? colors.muted).child(title))
    .child(label(String(count), TEXT.micro, colors.dim));
}

function filterTab({ filter, count, isActive }) {
  const colors = theme();
  return h_flex().id(`filter-${filter.id}`).h(24).px(8).gap(5).flex_none().items_center().rounded(6).cursor_pointer()
    .when(isActive, element => element.bg(colors.selected))
    .hover(style => style.bg(colors.hover)).on_mouse_down("left", stopPress).on_click(() => setShared(FILTER, filter.id))
    .child(div().text_size(TEXT.small).text_color(isActive ? colors.foreground : colors.muted).child(filter.title))
    .child(label(String(count), TEXT.micro, colors.dim));
}

function hintBar() {
  const colors = theme();
  return h_flex().w_full().flex_none().h(28).px(12).gap(12).items_center().overflow_hidden().border_t(1).border_color(colors.border)
    .children(hints().map(([key, text]) => h_flex().gap(5).flex_none().items_center().child(keycap(key)).child(label(text, TEXT.micro, colors.dim))));
}

export class ThreadList {
  constructor(actions) {
    this.actions = actions;
    this.query = "";
    this.selected = currentView().last ?? null;
    this.successor = null;
    this.isAwaitingEnd = false;
    this.isFocused = false;
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Search threads" });
    this.input.on("change", (_event, cx) => { this.query = this.input.value(); cx.notify(); });
    this.input.on("submit", (event, cx) => this.openSelected({ isInspecting: Boolean(event.secondary) }, cx));
    this.input.on("focus", (_event, cx) => { this.isFocused = true; this.isAwaitingEnd = false; cx.notify(); });
    this.input.on("blur", (_event, cx) => { this.isFocused = false; cx.notify(); });
    this.revealSelected();
  }

  focus() { this.input.focus(); }

  onCommand(command) {
    if (command === "search") this.focus();
    if (command === "end" && this.isFocused) this.endSelected();
    // The confirm dialog takes the keyboard and nothing hands it back to a mod: the list takes it again, so the next end needs no click.
    if (command === "end-confirmed" && this.isAwaitingEnd) this.focus();
  }

  revealSelected() {
    const index = this.rows().findIndex(row => row.thread?.address === this.selected);
    if (index >= 0) this.scroll.scroll_to_item(index);
  }

  rows() {
    const { waiting, groups } = sections(matching(threads(), statusFilter(), this.query));
    const inbox = waiting.length ? [{ heading: { id: "needs", title: "Needs you", count: waiting.length, leading: "inbox", color: theme().blocked } },
      ...waiting.map(thread => ({ thread, isProjectShown: true }))] : [];
    const projects = groups.flatMap(group => [
      { heading: { id: `${group.machine ?? "local"}-${group.project}`, title: groupTitle(group), count: group.threads.length, leading: "folder" } },
      ...group.threads.map(thread => ({ thread, isProjectShown: false })),
    ]);
    return [...inbox, ...projects];
  }

  /** When the selected thread has just been ended, its neighbour takes the selection so a run of ends keeps its place. */
  selectedIn(rows) {
    const visible = threadsIn(rows);
    const wanted = [this.selected, this.successor].map(address => visible.find(thread => thread.address === address));
    return wanted.find(Boolean) ?? visible[0] ?? null;
  }

  move(delta, cx) {
    const rows = this.rows();
    const visible = threadsIn(rows);
    if (!visible.length) return;
    const index = visible.indexOf(this.selectedIn(rows));
    this.selected = visible[(index + delta + visible.length) % visible.length].address;
    this.revealSelected();
    cx.notify();
  }

  endSelected() {
    const rows = this.rows();
    const visible = threadsIn(rows);
    const thread = this.selectedIn(rows);
    if (!thread) return;
    const index = visible.indexOf(thread);
    this.selected = thread.address;
    this.successor = (visible[index + 1] ?? visible[index - 1])?.address ?? null;
    this.isAwaitingEnd = true;
    this.actions.end([thread]);
  }

  openSelected({ isInspecting }, cx) {
    const thread = this.selectedIn(this.rows());
    if (thread) this.actions.open(thread, { source: "keyboard", isInspecting }, cx);
  }

  cycleFilter(delta) {
    const index = FILTERS.findIndex(filter => filter.id === statusFilter());
    setShared(FILTER, FILTERS[(index + delta + FILTERS.length) % FILTERS.length].id);
  }

  clear(cx) {
    if (!this.query) return focusPrincipal();
    this.input.set_value("");
    this.query = "";
    cx.notify();
  }

  onKey(event, cx) {
    if (event.key === "down") this.move(1, cx);
    else if (event.key === "up") this.move(-1, cx);
    else if (event.key === "tab") this.cycleFilter(event.modifiers.shift ? -1 : 1);
    else if (event.key === "escape") this.clear(cx);
    else return;
    cx.stop_propagation();
  }

  toolbar(list) {
    const colors = theme();
    const active = statusFilter();
    return h_flex().w_full().flex_none().h(44).px(10).gap(8).items_center().border_b(1).border_color(colors.border)
      .child(h_flex().flex_1().min_w(120).h(28).px(8).gap(7).items_center().rounded(7).border(1)
        .border_color(this.isFocused ? colors.accent : colors.border).bg(colors.background)
        .child(icon("search", 13, this.isFocused ? colors.accent : colors.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(TEXT.body).text_color(colors.foreground))
        .when(!this.isFocused, element => element.child(keycap(shortcut("search")))))
      .children(FILTERS.map(filter => filterTab({ filter, count: matching(list, filter.id, this.query).length, isActive: filter.id === active })));
  }

  emptyState(total) {
    const text = total === 0 ? "No threads yet. Ask Principal to start one." : "No thread matches this search and filter.";
    return v_flex().flex_1().items_center().justify_center().gap(6).child(icon("layers", 20, theme().dim)).child(label(text, TEXT.body));
  }

  render() {
    const list = threads();
    const rows = this.rows();
    const selected = this.selectedIn(rows);
    const slots = new Map(ordered(list).slice(0, SHORTCUT_SLOTS).map((thread, index) => [thread.address, shortcut(`open-${index + 1}`)]));
    return v_flex().id("thread-list-root").size_full().min_w(0).on_key_down((event, cx) => this.onKey(event, cx))
      .child(this.toolbar(list))
      .when(rows.length === 0, element => element.child(this.emptyState(list.length)))
      .when(rows.length > 0, element => element.child(v_flex().id("thread-rows").flex_1().min_h(0).p(6).gap(1).overflow_y_scrollbar().track_scroll(this.scroll)
        .children(rows.map(row => row.heading ? sectionHeading(row.heading) : threadRow(row.thread, {
          isSelected: row.thread.address === selected?.address, isListFocused: this.isFocused, slot: slots.get(row.thread.address),
          isProjectShown: row.isProjectShown, onOpen: (event, cx) => this.actions.open(row.thread, { source: "pointer", isInspecting: event.modifiers?.platform }, cx),
        })))))
      .child(hintBar());
  }
}
