import { usedPercent, when } from "./format.js";
import { leftTone } from "./parts.js";

const FIGURE_SEPARATOR = " · ";
const NO_FIGURE = "Usage";

const shortName = (name) => String(name).split(" ")[0];
const isPlanWide = (window) => !window.model;

const windowsOf = (subscription) => subscription.windows
  .filter((window) => Number.isFinite(window.left))
  .map((window) => ({ ...window, provider: shortName(subscription.name) }));

function leastLeftByProvider(windows) {
  const least = new Map();
  for (const window of windows) {
    if ((least.get(window.provider)?.left ?? Infinity) > window.left) least.set(window.provider, window);
  }
  return [...least.values()];
}

const resetText = (window, nowMs, lead) => (window.resetsAt ? `${lead}${when(window.resetsAt, nowMs)}` : "");

const leastText = (window, nowMs) => `${window.provider} ${window.name}: ${usedPercent(window.left)}% used · ${window.left}% left${resetText(window, nowMs, ", resets ")}`;

function usedUpNote(windows, nowMs) {
  const usedUp = windows.filter((window) => window.model && window.left <= 0).map((window) => `${window.provider} ${window.name}${resetText(window, nowMs, " until ")}`);
  return usedUp.length ? ` Used up: ${[...new Set(usedUp)].join(FIGURE_SEPARATOR)}.` : "";
}

export function summaryOf(snapshot) {
  const windows = snapshot.subscriptions.flatMap(windowsOf);
  const least = leastLeftByProvider(windows.filter(isPlanWide));
  if (!least.length) return { text: NO_FIGURE, tone: "muted", label: "Magpie reports no plan-wide window" };
  const nowMs = Date.parse(snapshot.at);
  return {
    text: least.map((window) => `${window.provider} ${usedPercent(window.left)}% used`).join(FIGURE_SEPARATOR),
    tone: leftTone(Math.min(...least.map((window) => window.left))),
    label: `Most used window of each plan: ${least.map((window) => leastText(window, nowMs)).join(FIGURE_SEPARATOR)}.${usedUpNote(windows, nowMs)} Read on ${snapshot.host} at ${when(snapshot.at, nowMs)}`,
  };
}

export const failedSummary = (previous, failure) => ({
  text: previous?.text ?? NO_FIGURE,
  tone: "blocked",
  label: `Couldn't read usage: ${failure.message}`,
});
