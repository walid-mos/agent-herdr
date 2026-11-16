import { exec, appHome, readTextFile, setShared } from "herdr";
import { META, PRINCIPAL, meta, principalFolder, principalAgent } from "./state.js";
import { threads, principal, leaf } from "./threads.js";

const GIT_TIMEOUT_MS = 6000;
const SESSIONS_TIMEOUT_MS = 25000;
const HELPER = "mods/command-center/session-meta.py";

const lastLine = text => text.trim().split("\n").at(-1) || "no output";
const reasonOf = result => result.reason?.message ?? String(result.reason);
const kept = (result, key) => result.status === "fulfilled" ? { [key]: result.value } : {};

async function readGit({ machine, cwd }) {
  const result = await exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir", "--abbrev-ref", "HEAD"],
    { cwd, on: machine, timeout: GIT_TIMEOUT_MS });
  if (result.code !== 0) return null;
  const [root, common, branch] = result.stdout.trim().split("\n");
  const projectRoot = common.endsWith("/.git") ? common.slice(0, -"/.git".length) : common.replace(/\.git$/, "");
  return { project: leaf(projectRoot), branch: branch === "HEAD" ? "detached" : branch, isWorktree: common !== `${root}/.git` };
}

async function readAllGit(list) {
  const folders = [...new Map(list.filter(thread => thread.cwd).map(thread => [`${thread.machine ?? ""}:${thread.cwd}`, thread])).entries()];
  const entries = await Promise.all(folders.map(async ([key, thread]) => [key, await readGit(thread)]));
  return Object.fromEntries(entries.filter(([, git]) => git));
}

const sessionRequest = thread => ({
  machine: thread.machine, address: thread.address, app: thread.app, cwd: thread.cwd, titles: thread.nameHints,
  reference_ms: thread.state === "working" ? Date.now() : thread.since ?? Date.now(),
});

/** Principal's sessions have a folder of their own: other pi sessions started in its working folder must never be read as its own. */
function principalRequests() {
  const thread = principal();
  if (!thread) return [];
  return [{ ...sessionRequest(thread), app: PRINCIPAL.app, cwd: principalFolder(), directory: principalAgent().sessions }];
}

async function readMachineSessions(machine, requests, helper) {
  const result = await exec("python3", ["-c", helper, JSON.stringify(requests)], { on: machine, timeout: SESSIONS_TIMEOUT_MS });
  if (result.code !== 0) throw new Error(`Session files on ${machine ?? "this computer"}: ${lastLine(result.stderr)}`);
  return JSON.parse(result.stdout);
}

async function readAllSessions(list) {
  const requests = [...principalRequests(), ...list.map(sessionRequest)];
  const helper = await readTextFile(`${appHome()}/${HELPER}`);
  if (!helper) throw new Error(`${HELPER} is missing.`);
  const machines = [...new Set(requests.map(request => request.machine))];
  const records = await Promise.all(machines.map(machine => readMachineSessions(machine, requests.filter(request => request.machine === machine), helper)));
  return Object.fromEntries(records.flat().map(record => [record.address, record]));
}

/** Git and sessions keep their last good value when they fail, so one offline machine never blanks the rows. */
export async function refreshThreads() {
  const list = threads();
  const [git, sessions] = await Promise.allSettled([readAllGit(list), readAllSessions(list)]);
  const previous = meta();
  const next = {
    git: previous.git, sessions: previous.sessions, ...kept(git, "git"), ...kept(sessions, "sessions"),
    errors: [git, sessions].filter(result => result.status === "rejected").map(reasonOf),
  };
  if (JSON.stringify(next) !== JSON.stringify(previous)) setShared(META, next);
}
