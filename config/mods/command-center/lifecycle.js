import { hc, run, terminals, spaces } from "herdr";
import { PRINCIPAL, principalChat, principalTerminal, principalFolder, principalAgent } from "./state.js";
import { auxiliaryNames, isAuxiliary, isAuxiliaryOf, AUXILIARY_RUN } from "./threads.js";

const START_WAIT_SECONDS = 60;
// herdr-core runs from launchd without the login PATH, so agents start through a login shell that replaces itself.
// zsh when installed (every Mac), otherwise the account's own shell: SealSkin has no zsh.
const LOGIN_SHELL = 'shell=$(command -v zsh || echo "${SHELL:-/bin/sh}")';
export const LOGIN_EXEC = ["/bin/sh", "-c", `${LOGIN_SHELL}; exec "$shell" -lc 'exec "$0" "$@"' "$@"`, "sh"];
const LOGIN_SHELL_ARGV = ["/bin/sh", "-c", `${LOGIN_SHELL}; exec "$shell" -l`];
const MONITOR_BRIEF = address => `You are the read-only monitor for hc terminal ${address}. Read hc --skill, then hc read ${address}. `
  + "Summarize its state and any errors. Never edit files, interrupt the terminal, send it input, or delegate. Remain available for questions.";

const isLive = terminal => terminal.state === "live";
const end = terminal => run("terminal.kill", { terminal: terminal.address });

async function core(args, failure) {
  const result = await hc(args);
  if (result.code !== 0) throw new Error(result.stderr.trim() || failure);
  return result.stdout;
}

async function ensureTerminal(name, thread, command) {
  const existing = terminals().find(terminal => terminal.name === name && isLive(terminal) && isAuxiliaryOf(terminal, thread.address));
  if (existing) return existing.address;
  const machine = thread.machine ? ["--on", thread.machine] : [];
  const started = await core([...AUXILIARY_RUN, "--keep", ...machine, "--name", name, "--cwd", thread.cwd, "--", ...command],
    `Could not start ${name}.`);
  return JSON.parse(started).address;
}

export async function startAuxiliaries(thread) {
  const names = auxiliaryNames(thread.address);
  const watched = thread.address.split("/").at(-1);
  const [monitor, shell] = await Promise.all([
    ensureTerminal(names.monitor, thread, [...LOGIN_EXEC, "pi", MONITOR_BRIEF(watched)]),
    ensureTerminal(names.shell, thread, LOGIN_SHELL_ARGV),
  ]);
  return { monitor, shell };
}

/** A thread takes its monitor and shell with it. Its session file stays on disk, so the conversation can be resumed. */
export function endThreads(list) {
  const auxiliaries = terminals().filter(terminal => isLive(terminal) && list.some(thread => isAuxiliaryOf(terminal, thread.address)));
  [...auxiliaries, ...list].forEach(end);
}

/** Ends the monitors and shells whose thread terminal is gone: closed from Studio, crashed, or lost to a restart. */
export function sweepAuxiliaries() {
  const live = terminals().filter(isLive);
  live.filter(terminal => isAuxiliary(terminal) && !live.some(owner => isAuxiliaryOf(terminal, owner.address))).forEach(end);
}

// A --rm helper can end between the listing and the removal: its record is already gone, which is the wanted result.
async function removeRecord(address) {
  const result = await hc(["rm", address]);
  if (result.code === 0 || result.stderr.includes('"kind":"not_found"')) return;
  throw new Error(result.stderr.trim() || `Could not remove helper ${address}.`);
}

export async function removeFinishedAuxiliaries() {
  const snapshot = JSON.parse(await core(["ls", "--all", "--json"], "Could not list helper records."));
  const finished = snapshot.terminals.filter(terminal => terminal.state === "finished"
    && !terminal.address.includes("/") && isAuxiliary(terminal));
  await Promise.all(finished.map(terminal => removeRecord(terminal.address)));
}

/** Principal is an ordinary Herdr tab in a space of its own: Studio shows it too, and the worktree hand-off needs a caller that has a space.
 *  Its sessions have a folder of their own, so every start continues the latest one, whether /new or /resume made it. */
export async function startPrincipal() {
  const { argv } = principalAgent();
  const lost = principalTerminal();
  if (lost) await core(["kill", lost.address], "The shell left in Principal's place could not be closed.");
  const started = await core(["run", "--json", "--bg", "--no-parent", "--name", PRINCIPAL.chatName, "--cwd", principalFolder(),
    "--label", `herdr.space=${PRINCIPAL.space}`, "--label", `herdr.tab=${PRINCIPAL.tab}`, "--", ...LOGIN_EXEC, ...argv], "pi did not start.");
  await hc(["wait", JSON.parse(started).address, "--timeout", String(START_WAIT_SECONDS), "--json"]);
  if (!principalChat()) throw new Error(`The login shell did not reach pi within ${START_WAIT_SECONDS} seconds. Open the Principal tab in Studio to read its screen.`);
}

/** Herdr names an adopted space after its folder, and every start of Principal makes the space anew. */
export function namePrincipalSpace() {
  const isMisnamed = spaces().some(space => space.id === PRINCIPAL.space && space.name !== PRINCIPAL.title);
  if (isMisnamed) run("space.rename", { id: PRINCIPAL.space, name: PRINCIPAL.title });
}
