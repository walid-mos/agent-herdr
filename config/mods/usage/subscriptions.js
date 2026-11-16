import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { countdown, dateLabel, FULL_PERCENT, usedPercent, when } from "./format.js";
import { ageChip, isStale, leftColor, providerTile } from "./parts.js";

const WINDOW_NAME_PX = 112;
const PERCENT_PX = 64;
const RESET_PX = 176;
const BAR_PX = 6;

function resetLabel(window, nowMs) {
  if (window.resetsAt) return `resets in ${countdown(window.resetsAt, nowMs)} · ${when(window.resetsAt, nowMs)}`;
  return window.left < FULL_PERCENT ? "no reset time given" : "not started";
}

function windowRow(t, window, nowMs, isOld) {
  const hasFigure = Number.isFinite(window.left);
  const used = hasFigure ? usedPercent(window.left) : 0;
  const fill = Math.min(FULL_PERCENT, Math.max(0, used));
  const color = isOld || !hasFigure ? t.dim : leftColor(t, window.left);
  return h_flex().gap(10).items_center().text_size(12)
    .child(div().w(WINDOW_NAME_PX).flex_none().truncate().text_color(t.muted).child(window.name))
    .child(div().flex_1().min_w(0).h(BAR_PX).rounded(3).bg(t.border)
      .child(div().h_full().rounded(3).bg(color).w(`${fill}%`)))
    .child(div().w(PERCENT_PX).flex_none().flex().justify_end().font_semibold().text_color(isOld ? t.muted : t.foreground).tooltip(hasFigure ? `${used}% used · ${window.left}% left` : "no figure").child(hasFigure ? `${used}% used` : "no figure"))
    .child(div().w(RESET_PX).flex_none().truncate().text_size(11).text_color(t.dim).child(resetLabel(window, nowMs)));
}

function cardHeader(t, subscription, nowMs) {
  const title = [subscription.name, subscription.plan].filter(Boolean).join(" · ");
  const also = subscription.also?.length ? `also read via ${subscription.also.join(", ")}` : null;
  const detail = [subscription.user, subscription.until && `plan until ${dateLabel(subscription.until)}`, also].filter(Boolean).join(" · ");
  return h_flex().gap(9).items_center()
    .child(providerTile(t, subscription.provider, subscription.name))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().text_size(13).font_semibold().text_color(t.foreground).child(title))
      .child(div().truncate().text_size(11).text_color(t.dim).child(detail)))
    .child(ageChip(t, subscription.readAt, nowMs));
}

export function subscriptionCard(t, subscription, nowMs, index) {
  const isOld = isStale(subscription.readAt, nowMs);
  return v_flex().id(`usage-sub-${index}`).p(10).gap(7).rounded(10).bg(t.background).border_1().border_color(t.border)
    .child(cardHeader(t, subscription, nowMs))
    .when(Boolean(subscription.error), (el) => el.child(div().text_size(12).text_color(t.blocked).child(`Failed: ${subscription.error}`)))
    .children(subscription.windows.map((window) => windowRow(t, window, nowMs, isOld)));
}
