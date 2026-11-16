import { platformClick } from "./keyboard.js";
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, settings } from "herdr";
import { threads, columnThreads, COLUMNS } from "./threads.js";
import { TEXT, label, chip, icon, textButton, statusGlyph, restingGlyph, elapsed, modelLabel, stopPress } from "./ui.js";

// Home gives the board a quarter of the window, where two columns side by side stay wide enough to read a card.
const NARROW_COLUMNS = 2;
// Narrower than this, a card cuts its title after two or three words, so all columns share one row only above it.
const MIN_WIDE_COLUMN_PX = 250;
const COLUMN_HEADER_PX = 30;
const CARD_SLOT_PX = 84;
const MAX_SIZED_CARDS = 3;
const ONE_CARD_PX = COLUMN_HEADER_PX + CARD_SLOT_PX;

// A measured width is in screen points, while every size written here grows with the person's zoom.
const unzoomed = width => width / (Number(settings().zoom) || 1);
const sectionsOf = column => column.sections ?? [column];
const cardsIn = (section, cards) => cards.filter(thread => section.states.includes(thread.state));
const inRows = (items, perRow) => Array.from({ length: Math.ceil(items.length / perRow) }, (_, row) => items.slice(row * perRow, (row + 1) * perRow));

function boardCard(thread, actions) {
  const colors = theme();
  return v_flex().id(`card-${thread.address}`).w_full().flex_none().px(9).py(8).gap(5).rounded(7).cursor_pointer()
    .bg(colors.background).border(1).border_color(colors.border)
    .hover(style => style.bg(colors.hover)).on_mouse_down("left", stopPress)
    .on_click((event, cx) => actions.open(thread, { source: "pointer", isInspecting: event.modifiers?.platform }, cx))
    .accessibility_label(`Open ${thread.title}. ${platformClick()} click also opens its monitor and shell.`)
    .child(div().truncate().text_size(TEXT.small).text_color(colors.foreground).child(thread.title))
    .child(h_flex().gap(6).items_center()
      .child(label([thread.project, thread.branch].filter(Boolean).join("  ·  "), TEXT.micro, colors.dim).flex_1())
      .child(label(elapsed(thread.since), TEXT.micro, colors.dim).flex_none()))
    .when(Boolean(thread.model), element => element.child(h_flex().overflow_hidden().child(chip(modelLabel(thread)))));
}

function columnHeader(column, cards, actions, endable) {
  const colors = theme();
  return h_flex().h(COLUMN_HEADER_PX).pl(10).pr(4).gap(6).flex_none().items_center()
    .child(cards.length ? statusGlyph(column.glyph, `column-${column.id}`) : restingGlyph(column.glyph))
    .child(div().flex_none().font_semibold().text_size(TEXT.small).text_color(colors.foreground).child(column.title))
    .child(label(String(cards.length), TEXT.micro, colors.dim))
    .child(div().flex_1())
    .when(endable.length > 0, element => element.child(textButton({
      id: `end-${column.id}`, text: "End all", hint: "End every idle and done thread and free their memory", action: () => actions.end(endable),
    })));
}

const sectionHeight = cards => COLUMN_HEADER_PX + Math.min(MAX_SIZED_CARDS, Math.max(1, cards.length)) * CARD_SLOT_PX;
const columnHeight = (column, cards) => sectionsOf(column).reduce((height, section) => height + sectionHeight(cardsIn(section, cards)), 0);

function columnSection(section, cards, actions, endable) {
  const colors = theme();
  return v_flex().flex_1().flex_grow(sectionHeight(cards)).min_h(ONE_CARD_PX).min_w(0)
    .child(columnHeader(section, cards, actions, endable))
    .child(v_flex().id(`column-${section.id}`).flex_1().min_h(0).px(6).pb(6).gap(6).overflow_y_scrollbar().mode("always")
      .when(cards.length === 0, element => element.child(h_flex().h(40).items_center().justify_center().child(label(section.empty, TEXT.micro, colors.dim))))
      .children(cards.map(thread => boardCard(thread, actions))));
}

function boardColumn(column, cards, actions) {
  const colors = theme();
  const endable = column.isEndable ? cards : [];
  return v_flex().flex_1().h_full().min_h(0).min_w(0).rounded(8).bg(colors.chrome).overflow_hidden()
    .children(sectionsOf(column).map((section, index) => columnSection(section, cardsIn(section, cards), actions, index === 0 ? endable : [])
      .when(index > 0, element => element.border_t(1).border_color(colors.border))));
}

/** Rows share the height by what their fullest column needs, so one card is never clipped while a long column gets the rest. */
function boardRow(columns, list, actions) {
  const filled = columns.map(column => ({ column, cards: columnThreads(list, column) }));
  const height = Math.max(...filled.map(entry => columnHeight(entry.column, entry.cards)));
  const minimum = Math.max(...filled.map(entry => sectionsOf(entry.column).length * ONE_CARD_PX));
  return h_flex().w_full().flex_1().flex_grow(height).min_h(minimum).gap(8)
    .children(filled.map(entry => boardColumn(entry.column, entry.cards, actions)));
}

export function board(actions, { width, onResize }) {
  const colors = theme();
  const list = threads();
  const perRow = unzoomed(width) >= COLUMNS.length * MIN_WIDE_COLUMN_PX ? COLUMNS.length : NARROW_COLUMNS;
  return v_flex().id("board-root").size_full().min_w(0).on_size_change(onResize)
    .child(h_flex().w_full().flex_none().h(36).px(12).gap(8).items_center().border_b(1).border_color(colors.border)
      .child(icon("layers", 13, colors.muted))
      .child(div().flex_none().font_semibold().text_size(TEXT.body).text_color(colors.foreground).child("Board"))
      .child(label("Each thread sits where its agent is", TEXT.small, colors.dim)))
    .child(v_flex().id("board-rows").flex_1().min_h(0).p(8).gap(8).overflow_y_scrollbar()
      .children(inRows(COLUMNS, perRow).map(columns => boardRow(columns, list, actions))));
}
