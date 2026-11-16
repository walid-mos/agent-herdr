import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const RECORD_EVERY_MS = 60 * 60 * 1000;

function parsePoint(line) {
  try {
    const point = JSON.parse(line);
    const isValid = typeof point?.id === "string" && Number.isFinite(point.amount) && Boolean(point.currency) && !Number.isNaN(Date.parse(point.at));
    return isValid ? point : null;
  } catch {
    return null;
  }
}

export async function readHistory(historyFile) {
  const text = await readFile(historyFile, "utf8").catch(() => "");
  return text.split("\n").filter(Boolean).map(parsePoint).filter(Boolean);
}

export const lastPointOf = (points, id) => points.findLast((point) => point.id === id) ?? null;

function isWorthRecording(credit, last) {
  if (credit.status !== "ok" || !credit.readAt) return false;
  if (!last) return true;
  const readAtMs = Date.parse(credit.readAt);
  const lastAtMs = Date.parse(last.at);
  if (readAtMs <= lastAtMs) return false;
  const hasChanged = last.amount !== credit.amount || last.currency !== credit.currency;
  return hasChanged || readAtMs - lastAtMs >= RECORD_EVERY_MS;
}

export async function recordReadings(historyFile, points, credits) {
  const fresh = credits
    .filter((credit) => isWorthRecording(credit, lastPointOf(points, credit.id)))
    .map((credit) => ({ at: credit.readAt, id: credit.id, amount: credit.amount, currency: credit.currency }));
  if (!fresh.length) return points;
  await mkdir(dirname(historyFile), { recursive: true });
  await appendFile(historyFile, fresh.map((point) => `${JSON.stringify(point)}\n`).join(""));
  return [...points, ...fresh];
}
