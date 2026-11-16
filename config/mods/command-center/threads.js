import { agents, terminals } from "herdr";
import { meta, liveTerminal, principalChat, PRINCIPAL } from "./state.js";

const AUXILIARY_KINDS = ["monitor", "shell", "nvim"];
const AUXILIARY_NAME = new RegExp(`^(${AUXILIARY_KINDS.join("|")})-`);
/** An auxiliary leaves no trace: the core removes its record the moment it ends. */
export const AUXILIARY_RUN = ["run", "--json", "--bg", "--no-parent", "--rm"];
const UNNAMED_TAB = /^\d+$/;
const NEEDS_YOU = ["blocked"];
const IDLE_STATES = ["idle", "done"];
const STATE_RANK = { blocked: 0, working: 1, done: 2, idle: 3, new: 4 };

export const COLUMNS = [
  { id: "todo", title: "Not started", states: ["new"], glyph: "new", empty: "Nothing queued" },
  { id: "working", title: "Working", states: ["working"], glyph: "working", empty: "No agent is running" },
  { id: "needs", title: "Needs you", states: NEEDS_YOU, glyph: "blocked", empty: "You are all caught up" },
  { id: "done", states: IDLE_STATES, isEndable: true, sections: [
    { id: "idle", title: "Idle", states: ["idle"], glyph: "idle", empty: "No idle threads" },
    { id: "finished", title: "Done", states: ["done"], glyph: "done", empty: "Nothing finished yet" },
  ] },
];

export const FILTERS = [
  { id: "all", title: "All", states: null },
  { id: "needs", title: "Needs you", states: NEEDS_YOU },
  { id: "working", title: "Working", states: ["working"] },
  { id: "idle", title: "Idle", states: [...IDLE_STATES, "new"] },
];

export const leaf = path => path.replace(/\/$/, "").split("/").at(-1) ?? "";
export const needsYou = thread => NEEDS_YOU.includes(thread.state);
export const isAuxiliary = terminal => AUXILIARY_NAME.test(terminal.name ?? "");

/** A thread's monitor and shell are found by these names, never by a stored address. */
export function auxiliaryNames(address) {
  const slug = address.split("/").at(-1).replace(/[^a-z0-9]/g, "-");
  return Object.fromEntries(AUXILIARY_KINDS.map(kind => [kind, `${kind}-${slug}`]));
}

export function isAuxiliaryOf(terminal, address) {
  const machineOf = value => value.includes("/") ? value.split("/")[0] : null;
  return machineOf(terminal.address) === machineOf(address) && Object.values(auxiliaryNames(address)).includes(terminal.name);
}

function threadState(status, turn) {
  if (status === "working" || status === "blocked" || status === "done") return status;
  return turn > 0 ? "idle" : "new";
}

function threadTitle(terminal, agent, session) {
  const tabName = agent?.tab_name && !UNNAMED_TAB.test(agent.tab_name) ? agent.tab_name : "";
  return terminal.labels?.["agent.title"] || tabName || session?.name || terminal.report?.msg
    || `New ${terminal.program?.name ?? "agent"} session`;
}

const threadColumn = state => COLUMNS.find(column => column.states.includes(state)).id;

function toThread(terminal, agent, store) {
  const machine = terminal.address.includes("/") ? terminal.address.split("/")[0] : null;
  const cwd = terminal.foreground?.cwd || terminal.cwd || "";
  const git = store.git[`${machine ?? ""}:${cwd}`];
  const session = store.sessions[terminal.address];
  const turn = terminal.turn ?? 0;
  const state = threadState(agent?.status ?? terminal.status, turn);
  return {
    address: terminal.address, machine, cwd, turn, state, parent: terminal.parent ?? null,
    app: terminal.report?.app ?? agent?.app ?? null, program: terminal.program ?? null,
    title: threadTitle(terminal, agent, session), since: terminal.status_ms ?? terminal.created_ms ?? null,
    project: git?.project || leaf(cwd) || "No folder", branch: git?.branch ?? "", isWorktree: Boolean(git?.isWorktree),
    model: session?.model ?? "", effort: session?.effort ?? "", tokens: session?.tokens ?? 0,
    preview: session?.preview ?? "", column: threadColumn(state),
    nameHints: [terminal.labels?.["agent.title"], terminal.report?.msg, terminal.title].filter(Boolean),
  };
}

const isThread = terminal => terminal.state === "live" && terminal.status
  && terminal.name !== PRINCIPAL.chatName && !isAuxiliary(terminal);

export function threads() {
  const store = meta();
  const agentsByAddress = new Map(agents().map(agent => [agent.address, agent]));
  return terminals().filter(isThread).map(terminal => toThread(terminal, agentsByAddress.get(terminal.address), store));
}

/** Principal has a thread's shape so its header reads the same fields, and it never joins the list. */
export function principal() {
  const terminal = liveTerminal(principalChat());
  return terminal ? toThread(terminal, null, meta()) : null;
}

const byUrgency = (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (a.since ?? 0) - (b.since ?? 0);
const byActivity = (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (b.since ?? 0) - (a.since ?? 0);

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
}

function withChildren(parents, childrenOf) {
  return parents.flatMap(thread => [thread, ...(childrenOf.get(thread.address) ?? []).map(child => ({ ...child, isChild: true }))]);
}

function projectGroups(list) {
  const addresses = new Set(list.map(thread => thread.address));
  const childrenOf = groupBy(list.filter(thread => addresses.has(thread.parent)), thread => thread.parent);
  const roots = list.filter(thread => !addresses.has(thread.parent)).sort(byActivity);
  return [...groupBy(roots, thread => `${thread.machine ?? ""}:${thread.project}`).values()]
    .map(members => ({ project: members[0].project, machine: members[0].machine, threads: withChildren(members, childrenOf) }))
    .sort((a, b) => a.project.localeCompare(b.project));
}

/** One ordering for the list, the keyboard and previous/next: what needs the person, then each project. */
export function sections(list) {
  const waiting = list.filter(needsYou).sort(byUrgency);
  return { waiting, groups: projectGroups(list.filter(thread => !needsYou(thread))) };
}

export function ordered(list) {
  const { waiting, groups } = sections(list);
  return [...waiting, ...groups.flatMap(group => group.threads)];
}

export function matching(list, statusId, query) {
  const states = FILTERS.find(filter => filter.id === statusId)?.states;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(thread => {
    if (states && !states.includes(thread.state)) return false;
    const haystack = `${thread.title} ${thread.project} ${thread.branch} ${thread.model}`.toLowerCase();
    return words.every(word => haystack.includes(word));
  });
}

export function columnThreads(list, column) {
  return list.filter(thread => thread.column === column.id).sort(column.id === "needs" ? byUrgency : byActivity);
}

export function counts(list) {
  return { needs: list.filter(needsYou).length, working: list.filter(thread => thread.state === "working").length, total: list.length };
}
