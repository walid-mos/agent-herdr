import { hc, terminals, shared, setShared } from "herdr";
import { liveTerminal } from "./state.js";
import { LOGIN_EXEC } from "./lifecycle.js";
import { auxiliaryNames, isAuxiliary, isAuxiliaryOf, AUXILIARY_RUN } from "./threads.js";

const WINDOWS = "command-center.windows";
const CHANGES = "command-center.changes";
const EDITOR = [...LOGIN_EXEC, "nvim", "."];
// hc run answers before the app lists the new terminal: until it does, for a few seconds at most, the window shows the address hc gave.
// An ended terminal leaves the list, so an address kept after its listing, or for good, would point the window at a dead terminal.
const LISTING_GRACE_MS = 5000;
const justStarted = new Map();
const starting = new Map();

function helperAddress(address, mode) {
  const key = `${address}:${mode}`;
  const name = auxiliaryNames(address)[mode];
  const listed = terminals().find(terminal => terminal.name === name && terminal.state === "live" && isAuxiliaryOf(terminal, address));
  if (listed) {
    justStarted.delete(key);
    return listed.address;
  }
  const started = justStarted.get(key);
  return started && Date.now() - started.at < LISTING_GRACE_MS ? started.address : null;
}

/** A mode whose shell or nvim has ended falls back to the agent, so the window never shows a dead terminal for long. */
export function windowMode(address) {
  const mode = shared(WINDOWS)?.[address] ?? "agent";
  return mode !== "agent" && helperAddress(address, mode) ? mode : "agent";
}

export function windowTerminal(address) {
  const mode = windowMode(address);
  return mode === "agent" ? address : helperAddress(address, mode);
}

/** The agent a terminal belongs to: itself, or the agent whose shell, nvim or monitor it is. */
export function ownerOf(address) {
  const terminal = terminals().find(item => item.address === address);
  if (!terminal || !isAuxiliary(terminal)) return terminal?.address ?? null;
  const owner = terminals().find(item => item.state === "live" && isAuxiliaryOf(terminal, item.address));
  return owner?.address ?? null;
}

export const changesContext = () => shared(CHANGES);
export const isChangesOpen = () => Boolean(changesContext()?.owner && liveTerminal(changesContext().owner));
export const isShowingChanges = address => isChangesOpen() && changesContext().owner === address;

export async function toggleChanges(address) {
  if (isShowingChanges(address)) return setShared(CHANGES, null);
  const location = await agentLocation(address);
  setShared(CHANGES, { owner: address, ...location });
}

async function core(args, failure) {
  const result = await hc(args);
  if (result.code !== 0) throw new Error(result.stderr.trim() || failure);
  return JSON.parse(result.stdout);
}

async function agentLocation(address) {
  const agent = await core(["get", address, "--json"], `hc could not read ${address}.`);
  if (agent.state !== "live") throw new Error("This agent has ended.");
  return { cwd: agent.foreground?.cwd || agent.cwd, on: address.includes("/") ? address.split("/")[0] : null };
}

// Detached helpers cannot hold an agent's `hc wait --children all` open.
async function startHelper(address, mode) {
  const location = await agentLocation(address);
  const name = auxiliaryNames(address)[mode];
  const machine = location.on ? ["--on", location.on] : [];
  const program = mode === "nvim" ? ["--", ...EDITOR] : [];
  const started = await core([...AUXILIARY_RUN, ...machine, "--name", name,
    "--cwd", location.cwd, ...program], `${name} did not start.`);
  justStarted.set(`${address}:${mode}`, { address: started.address, at: Date.now() });
}

async function ensureHelper(address, mode) {
  if (helperAddress(address, mode)) return;
  const key = `${address}:${mode}`;
  if (!starting.has(key)) starting.set(key, startHelper(address, mode).finally(() => starting.delete(key)));
  await starting.get(key);
}

/** Choosing the mode a window already shows takes it back to its agent. */
export async function selectWindowMode(address, mode) {
  const next = mode === windowMode(address) ? "agent" : mode;
  if (next !== "agent") await ensureHelper(address, next);
  const others = Object.entries(shared(WINDOWS) ?? {}).filter(([owner]) => owner !== address && liveTerminal(owner));
  setShared(WINDOWS, Object.fromEntries(next === "agent" ? others : [...others, [address, next]]));
}
