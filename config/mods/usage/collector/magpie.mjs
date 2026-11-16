import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { parseMoney } from "./money.mjs";
import { isShownWindow } from "./windows.mjs";

const runFile = promisify(execFile);
const MAGPIE_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

async function askMagpie() {
  const { stdout } = await runFile("magpie", ["quota", "--json"], { timeout: MAGPIE_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES });
  const entries = JSON.parse(stdout);
  if (!Array.isArray(entries)) throw new Error("magpie quota --json answered something other than a list");
  return entries;
}

function failureText(error) {
  const firstLine = String(error?.stderr ?? "").trim().split("\n")[0];
  if (firstLine) return firstLine;
  if (error?.code === "ENOENT") return "magpie is not installed on this machine";
  if (error?.killed) return "magpie quota --json did not answer in time";
  return String(error?.message ?? error).split("\n")[0];
}

async function readSaved(savedFile) {
  const saved = JSON.parse(await readFile(savedFile, "utf8").catch(() => "null"));
  return Array.isArray(saved?.entries) ? saved : { at: null, entries: [] };
}

export async function readMagpie(savedFile, now) {
  try {
    const entries = await askMagpie();
    await mkdir(dirname(savedFile), { recursive: true });
    await writeFile(savedFile, JSON.stringify({ at: now.toISOString(), entries }));
    return { ok: true, at: now.toISOString(), entries };
  } catch (error) {
    const saved = await readSaved(savedFile);
    return { ok: false, at: now.toISOString(), error: failureText(error), savedAt: saved.at, entries: saved.entries };
  }
}

export const isSubscription = (entry) => entry.kind === "subscription";
export const isBalance = (entry) => entry.kind === "balance";

// Magpie names a window limited to one model "<period> · <model>", e.g. "7 days · Fable".
const MODEL_MARK = " · ";
const modelOf = (name) => (name.includes(MODEL_MARK) ? name.slice(name.indexOf(MODEL_MARK) + MODEL_MARK.length) : null);

const toWindow = (window) => ({ name: window.name, model: modelOf(window.name), left: window.remaining ?? null, resetsAt: window.resetsAt ?? null });

export function toSubscription(entry) {
  const windows = (entry.windows ?? []).map(toWindow).filter((window) => isShownWindow(entry.provider, window));
  return {
    provider: entry.provider,
    name: entry.name,
    plan: entry.plan ?? null,
    user: entry.user ?? null,
    until: entry.until ?? null,
    readAt: entry.readAt ?? null,
    error: entry.error ?? null,
    windows,
  };
}

export function toMagpieCredit(entry) {
  const money = parseMoney(entry.balance);
  const base = { id: entry.provider, name: entry.name, source: "Magpie", readAt: entry.readAt ?? null };
  if (entry.error) return { ...base, status: "failed", error: entry.error };
  if (!money) return { ...base, status: "failed", error: `Magpie gave no amount it could read (${entry.balance ?? "none"})` };
  return { ...base, status: "ok", ...money };
}
