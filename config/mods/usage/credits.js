import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { ago, days, money, signedMoney, when } from "./format.js";
import { ageChip, isStale, providerTile } from "./parts.js";

const HOUR_IN_DAYS = 1 / 24;
const TREND_DAYS = 7;
const SPARK_HEIGHT_PX = 18;
const SPARK_BAR_PX = 4;
const MIN_SPARK_BAR_PX = 2;
const AMOUNT_COLUMN_PX = 200;
const STATUS_ORDER = { ok: 0, failed: 1, unavailable: 2 };

export const byStatus = (a, b) => (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1);

function sparkline(t, daily) {
  if (daily.length < 2) return div();
  const amounts = daily.map((point) => point.amount);
  const low = Math.min(...amounts);
  const span = Math.max(...amounts) - low || 1;
  const heightOf = (amount) => MIN_SPARK_BAR_PX + ((amount - low) / span) * (SPARK_HEIGHT_PX - MIN_SPARK_BAR_PX);
  return h_flex().flex_none().h(SPARK_HEIGHT_PX).gap(1).items_end()
    .children(daily.map((point) => div().w(SPARK_BAR_PX).h(heightOf(point.amount)).rounded(1).bg(t.muted)));
}

function trendText(trend, currency, nowMs) {
  if (!trend) return "";
  if (trend.spanDays < HOUR_IN_DAYS) return `trend builds from here · first read ${ago(trend.since, nowMs)}`;
  const period = trend.spanDays >= TREND_DAYS ? "in 7 days" : `since ${when(trend.since, nowMs)}`;
  const runway = trend.runwayDays ? ` · lasts ${days(trend.runwayDays)} at this pace` : "";
  return `${signedMoney(trend.change, currency)} ${period}${runway}`;
}

function figure(t, credit, nowMs) {
  const column = v_flex().w(AMOUNT_COLUMN_PX).flex_none().items_end().gap(2);
  if (credit.status === "unavailable") return column.child(div().text_size(13).text_color(t.dim).child("no figure"));
  if (credit.status === "failed") {
    const last = credit.trend?.latest;
    return column.child(div().text_size(13).font_semibold().text_color(t.blocked).child("failed"))
      .when(Boolean(last), (el) => el.child(div().text_size(11).text_color(t.dim).child(`last ${money(last.amount, last.currency)} · ${ago(last.at, nowMs)}`)));
  }
  const isOld = isStale(credit.readAt, nowMs);
  return column
    .child(div().text_size(17).font_semibold().text_color(isOld ? t.muted : t.foreground).child(money(credit.amount, credit.currency)))
    .child(h_flex().gap(6).items_center().max_w(AMOUNT_COLUMN_PX)
      .child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(trendText(credit.trend, credit.currency, nowMs)))
      .child(sparkline(t, credit.trend?.daily ?? [])));
}

function details(t, credit, nowMs) {
  const meta = h_flex().gap(6).items_center().min_w(0)
    .child(div().flex_none().text_size(11).text_color(t.dim).child(credit.source));
  if (credit.status === "unavailable") return meta;
  return meta.child(ageChip(t, credit.readAt, nowMs));
}

export function creditRow(t, credit, nowMs) {
  const hasReason = credit.status !== "ok" && Boolean(credit.error);
  return v_flex().id(`usage-credit-${credit.id}`).px(10).py(9).gap(5).rounded(10).bg(t.background).border_1().border_color(t.border)
    .child(h_flex().gap(9).items_center()
      .child(providerTile(t, credit.id, credit.name))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().truncate().text_size(13).font_semibold().text_color(t.foreground).child(credit.name))
        .child(details(t, credit, nowMs)))
      .child(figure(t, credit, nowMs)))
    .when(hasReason, (el) => el.child(div().pl(31).text_size(11.5).line_height("16px")
      .text_color(credit.status === "failed" ? t.blocked : t.muted).child(credit.error)));
}
