export const FULL_PERCENT = 100;
const PERCENT_DECIMALS = 2;
export const usedPercent = (left) => Number((FULL_PERCENT - left).toFixed(PERCENT_DECIMALS));

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_DAYS = 7;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SYMBOL_OF_CURRENCY = { USD: "$", EUR: "€", GBP: "£", CNY: "¥" };
const MINUS = "−";

const pad = (n) => String(n).padStart(2, "0");

export const msSince = (iso, nowMs) => nowMs - Date.parse(iso);

export function ago(iso, nowMs) {
  const elapsedMs = msSince(iso, nowMs);
  if (!Number.isFinite(elapsedMs)) return "never";
  if (elapsedMs < MINUTE_MS) return "just now";
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}m ago`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)}h ago`;
  return `${Math.floor(elapsedMs / DAY_MS)}d ago`;
}

export function countdown(iso, nowMs) {
  const leftMs = Date.parse(iso) - nowMs;
  if (!Number.isFinite(leftMs)) return "";
  if (leftMs <= 0) return "now";
  const days = Math.floor(leftMs / DAY_MS);
  const hours = Math.floor((leftMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((leftMs % HOUR_MS) / MINUTE_MS);
  if (days > 0) return `${days}d ${hours}h`;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function when(iso, nowMs) {
  const date = new Date(iso);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const daysAway = (date.getTime() - nowMs) / DAY_MS;
  if (new Date(nowMs).toDateString() === date.toDateString()) return time;
  if (Math.abs(daysAway) < WEEK_DAYS - 1) return `${WEEKDAYS[date.getDay()]} ${time}`;
  return dateLabel(iso);
}

export function dateLabel(iso) {
  const date = new Date(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function money(amount, currency) {
  const digits = Math.abs(amount).toFixed(2);
  const sign = amount < 0 ? MINUS : "";
  const symbol = SYMBOL_OF_CURRENCY[currency];
  return symbol ? `${sign}${symbol}${digits}` : `${sign}${digits} ${currency}`;
}

export function signedMoney(change, currency) {
  if (change === 0) return `±${money(0, currency)}`;
  return change > 0 ? `+${money(change, currency)}` : money(change, currency);
}

export const days = (count) => (count < 1 ? "under a day" : `${Math.round(count)} day${Math.round(count) === 1 ? "" : "s"}`);
