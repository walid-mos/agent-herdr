import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, setShared, props, closeOverlay } from "herdr";
import { collect, sourceMachine } from "./source.js";
import { subscriptionCard } from "./subscriptions.js";
import { byStatus, creditRow } from "./credits.js";
import { summaryOf, failedSummary } from "./summary.js";
import { ago, when } from "./format.js";
import { notice, sectionLabel, STALE_AFTER_MS } from "./parts.js";

const STATE_KEY = "usage.state";
const OPEN_KEY = "usage.open";
const DISMISSED_KEY = "usage.dismissed";
const POLLER_ROLE = "poller";
const POLL_MS = 3 * 60_000;
const CLOCK_TICK_MS = 60_000;
const SPIN_MS = 900;
const STALE_MINUTES = STALE_AFTER_MS / 60_000;
const PANEL_RADIUS_PX = 12;

const isSnapshot = (value) => Array.isArray(value?.subscriptions) && Array.isArray(value?.credits);
const usageState = () => shared(STATE_KEY) ?? {};

export default class Usage extends View {
  init(_props, cx) {
    const given = props() ?? {};
    this.isPoller = given.role === POLLER_ROLE;
    this.overlay = given.overlay ?? null;
    this.isLoading = false;
    if (this.overlay) setShared(OPEN_KEY, this.overlay);
    this.refresh(cx);
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
    if (!this.isPoller) cx.timer.every(CLOCK_TICK_MS, (cx) => cx.notify());
  }

  async close() {
    if (this.overlay && shared(OPEN_KEY) === this.overlay) setShared(OPEN_KEY, null);
  }

  refresh(cx) {
    if (this.isLoading) return;
    this.isLoading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const snapshot = await collect(sourceMachine());
        if (!isSnapshot(snapshot)) throw new Error("the collector answered something other than a snapshot");
        setShared(STATE_KEY, { snapshot, failure: null, summary: summaryOf(snapshot) });
      } catch (error) {
        const failure = { at: new Date().toISOString(), message: String(error?.message ?? error) };
        const previous = usageState();
        setShared(STATE_KEY, { ...previous, failure, summary: failedSummary(previous.summary, failure) });
      } finally {
        this.isLoading = false;
        cx.notify();
      }
    });
  }

  header(t, snapshot, nowMs) {
    const place = snapshot?.host ?? sourceMachine() ?? "this computer";
    const status = snapshot ? `read on ${place} ${ago(snapshot.at, nowMs)}` : `reading on ${place}…`;
    return h_flex().flex_none().px(4).gap(10).items_center()
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Usage and credits"))
        .child(div().truncate().text_size(11.5).text_color(t.dim).child(status)))
      .child(div().id("usage-refresh").flex_none().p(6).rounded(7).cursor_pointer().text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("Read every source again")
        .on_click((_e, cx) => this.refresh(cx))
        .child(svg("mods/usage/refresh.svg").size(14).when(this.isLoading, (el) => el.spin(SPIN_MS))));
  }

  notices(t, { snapshot, failure }, nowMs) {
    const items = [];
    if (failure) {
      const shown = snapshot ? ` Figures below are from ${when(snapshot.at, nowMs)}.` : "";
      items.push(notice(t, t.blocked, `Couldn't read ${sourceMachine() ?? "this computer"} ${ago(failure.at, nowMs)}: ${failure.message}.${shown}`));
    }
    if (snapshot && !snapshot.magpie.ok) {
      const saved = snapshot.magpie.savedAt ? `its figures below were read ${ago(snapshot.magpie.savedAt, nowMs)}` : "no earlier figures are kept";
      items.push(notice(t, t.blocked, `Magpie failed ${ago(snapshot.magpie.at, nowMs)}: ${snapshot.magpie.error}. ${saved}.`));
    }
    return items;
  }

  subscriptions(t, snapshot, nowMs) {
    const list = snapshot?.subscriptions ?? [];
    const empty = snapshot ? "Magpie reports no subscription." : "Reading Magpie…";
    const cards = list.length ? list.map((s, i) => subscriptionCard(t, s, nowMs, i)) : [div().px(4).text_size(12).text_color(t.dim).child(empty)];
    return [sectionLabel(t, "SUBSCRIPTIONS", "share of each window used · from Magpie"), ...cards];
  }

  credits(t, snapshot, nowMs) {
    const list = [...(snapshot?.credits ?? [])].sort(byStatus);
    return [sectionLabel(t, "PREPAID CREDITS", "remaining balance · from Magpie or the provider's API"), ...list.map((credit) => creditRow(t, credit, nowMs))];
  }

  panel(t, state, snapshot, nowMs) {
    const rows = [...this.subscriptions(t, snapshot, nowMs), ...this.credits(t, snapshot, nowMs)];
    return v_flex().id("usage-panel").w_full().max_h_full().p(12).gap(10)
      .rounded(PANEL_RADIUS_PX).bg(t.popover).border_1().border_color(t.border).shadow_lg()
      .text_size(13).text_color(t.foreground)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(this.header(t, snapshot, nowMs))
      .children(this.notices(t, { snapshot, failure: state.failure }, nowMs))
      .child(v_flex().id("usage-body").flex_shrink(1).min_h(0).gap(6).overflow_y_scroll().children(rows))
      .child(div().flex_none().px(4).text_size(11).text_color(t.dim)
        .child(`Figures older than ${STALE_MINUTES} minutes are marked stale. Failed sources never show as zero.`));
  }

  render() {
    if (this.isPoller) return div();
    const t = theme();
    const nowMs = Date.now();
    const state = usageState();
    const snapshot = isSnapshot(state.snapshot) ? state.snapshot : null;
    return v_flex().id("usage").size_full()
      .on_mouse_down("left", () => this.overlay && closeOverlay(this.overlay))
      // Runs in the capture phase, so the top-bar button's own press handler sees which press closed this dropdown.
      .on_mouse_down_out((event) => { if (this.overlay) setShared(DISMISSED_KEY, { overlay: this.overlay, at: event.position }); })
      .child(this.panel(t, state, snapshot, nowMs));
  }
}
