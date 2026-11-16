import { layout, run, setShared, shared, terminals, focused, notify } from "herdr";
import { MOD, VIEW, SPLITS, currentView, liveTerminal } from "./state.js";
import { threads, ordered, needsYou } from "./threads.js";
import { startAuxiliaries } from "./lifecycle.js";
import { windowTerminal, selectWindowMode, isChangesOpen, changesContext } from "./window-modes.js";

export const MOTION = { duration: 220, easing: "ease-out" };
export const SHORTCUT_SLOTS = 9;
export const LAYOUT = "command-center";
const POTS_MOD = "pots";
const POTS_CELL = "pots";
const PREVIEW = "layouts/command-center.svg";
const TITLEBAR_PX = 38;
const HEADING_PX = 40;
const GAP_PX = 10;
const CARD = { background: "background", border: { width: 1, color: "border" }, radius: 10 };
const BODY = "center-body";
// Every split a person can drag, by node id, with the share it starts at. A column whose share differs by view carries the view in its id.
const WEIGHTS = {
  "principal-home": 3, overview: 1, "thread-list": 1.35, "thread-board": 1,
  "principal-thread": 0.55, "main-thread": 1,
  "principal-inspect": 0.5, "main-inspect": 1, inspector: 0.72, "monitor-card": 1.2, "shell-card": 1,
};
const WEIGHT_NOISE = 0.001;

const modBlock = (id, role, extra = {}) => ({ id, type: "block", content: { mod: MOD, props: { role } }, ...extra });
const heading = (id, role) => modBlock(id, role, { size: { px: HEADING_PX } });
const terminalBlock = (id, address) => ({ id, type: "block", content: { terminal: address } });
const sized = id => ({ id, size: { weight: shared(SPLITS)?.[id] ?? WEIGHTS[id] } });
const card = (id, children, extra = {}) => ({ ...sized(id), type: "column", children, resizable: false, ...CARD, ...extra });
const stackOf = (id, children, extra = {}) => ({ ...sized(id), type: "column", children, gap: GAP_PX, ...extra });
const nodesOf = node => [node, ...(node.children ?? []).flatMap(nodesOf)];
const findNode = (root, id) => nodesOf(root).find(node => node.id === id) ?? null;

const PRINCIPAL_PANES = {
  [LAYOUT]: {
    body: () => ({ id: "principal-pots", type: "block", content: { mod: POTS_MOD } }),
    isShown: root => Boolean(findNode(root, "principal-pots")),
    cell: () => POTS_CELL,
    focus: () => run(`${POTS_MOD}.focus`),
  },
};
const principalPane = () => PRINCIPAL_PANES[shared("layout")];
export const isPotsLayout = () => shared("layout") === LAYOUT;

function principalColumn(view) {
  return card(`principal-${view.mode}`, [heading("principal-heading", "principal"), principalPane().body()], { min: 300 });
}

function mainColumn(view) {
  if (view.mode === "home") return stackOf("overview", [
    modBlock("thread-list", "threads", { ...sized("thread-list"), ...CARD, min: 220 }),
    modBlock("thread-board", "board", { ...sized("thread-board"), ...CARD, min: 160 }),
  ], { min: 420 });
  return card(`main-${view.mode}`, [heading("thread-heading", "thread"), terminalBlock("thread-chat", windowTerminal(view.terminal))], { min: 360 });
}

function inspectorColumn(view) {
  return stackOf("inspector", [
    card("monitor-card", [heading("monitor-heading", "monitor"), terminalBlock("monitor-chat", view.monitor)]),
    card("shell-card", [heading("shell-heading", "shell"), terminalBlock("thread-shell", view.shell)]),
  ], { min: 320 });
}

function bodyFor(view) {
  const columns = [principalColumn(view), mainColumn(view)];
  if (view.mode === "inspect") columns.push(inspectorColumn(view));
  if (isChangesOpen()) columns.push({
    id: "window-changes", type: "block", size: { px: 360 }, min: 280, content: { mod: "command-center-changes", props: changesContext() },
  });
  return { id: BODY, type: "row", children: columns, gap: GAP_PX, padding: GAP_PX, resizable: true };
}

/** Herdr forgets a dragged size once its node leaves the layout, so each change of view saves the splits it is about to replace. */
function keepSplits(root) {
  const shown = nodesOf(root).filter(node => Object.hasOwn(WEIGHTS, node.id ?? "") && typeof node.size?.weight === "number");
  const saved = shared(SPLITS) ?? {};
  const hidden = Object.entries(saved).filter(([id]) => !shown.some(node => node.id === id));
  const dragged = shown.filter(node => Math.abs(node.size.weight - WEIGHTS[node.id]) > WEIGHT_NOISE).map(node => [node.id, node.size.weight]);
  const next = Object.fromEntries([...hidden, ...dragged]);
  if (JSON.stringify(next) !== JSON.stringify(saved)) setShared(SPLITS, next);
}

export function focusPrincipal() {
  principalPane()?.focus();
}

function focusFor(view) {
  if (view.mode !== "home") return run("pane.focus", { terminal: windowTerminal(view.terminal) });
  if (view.focus !== "list") focusPrincipal();
}

/** Only ever rewrites its own layout: a copy opened from another layout must leave that one alone. */
export function showView(view) {
  if (!principalPane()) return;
  const root = layout();
  const mounts = (root.children ?? []).filter(node => node.id?.endsWith("-mount"));
  const titlebar = modBlock("center-titlebar", "titlebar", { size: { px: TITLEBAR_PX }, window_drag: true });
  keepSplits(root);
  setShared(VIEW, view);
  run("layout.set", { layout: { ...root, preview: PREVIEW, type: "column", children: [titlebar, bodyFor(view), ...mounts] } });
  focusFor(view);
}

/** Rebuilds the window when what it points at is gone: a restart, a dead Principal chat, a closed thread. */
export function repairLayout() {
  const pane = principalPane();
  if (!pane || !terminals().length) return;
  const view = currentView();
  const root = layout();
  const isThreadGone = view.mode !== "home" && !liveTerminal(view.terminal);
  const isInspectorGone = view.mode === "inspect" && !(liveTerminal(view.monitor) && liveTerminal(view.shell));
  const shownMain = findNode(root, "thread-chat")?.content?.terminal;
  const isMainBroken = view.mode !== "home" && shownMain !== windowTerminal(view.terminal);
  const isChangesGone = Boolean(findNode(root, "window-changes")) !== isChangesOpen();
  const isBroken = root.type !== "column" || !findNode(root, BODY) || !pane.isShown(root) || isMainBroken || isChangesGone;
  if (isThreadGone) return showView({ mode: "home" });
  if (isInspectorGone) return showView({ mode: "thread", terminal: view.terminal });
  if (isBroken) showView(view);
}

export function goHome(source, focus) {
  const view = currentView();
  showView({ mode: "home", source, focus, last: view.terminal ?? view.last });
}

export function openThread(thread, source) {
  showView({ mode: "thread", terminal: thread.address, source });
}

export async function inspectThread(thread, source) {
  await selectWindowMode(thread.address, "agent");
  const { monitor, shell } = await startAuxiliaries(thread);
  showView({ mode: "inspect", terminal: thread.address, monitor, shell, source });
}

export const shownThread = () => threads().find(thread => thread.address === currentView().terminal) ?? null;

export function stepThread(delta) {
  const list = ordered(threads());
  if (!list.length) return;
  const index = list.findIndex(thread => thread.address === (currentView().terminal ?? currentView().last));
  const start = index < 0 && delta < 0 ? 0 : index;
  openThread(list[(start + delta + list.length) % list.length], "keyboard");
}

export function openNextWaiting() {
  const list = ordered(threads());
  const index = list.findIndex(thread => thread.address === currentView().terminal);
  const next = [...list.slice(index + 1), ...list.slice(0, index + 1)].find(needsYou);
  if (next) return openThread(next, "keyboard");
  notify({ title: "Nothing needs you", body: "No thread is blocked.", level: "success", timeout: 2500 });
}

export function openSlot(slot) {
  const thread = ordered(threads())[slot - 1];
  if (thread) openThread(thread, "keyboard");
}

function focusGrid(view) {
  const main = view.mode === "home" ? "list" : windowTerminal(view.terminal);
  const grid = [[principalPane().cell()], [main]];
  if (view.mode === "inspect") grid.push([view.monitor, view.shell]);
  return grid;
}

export function moveFocus(direction) {
  const view = currentView();
  const grid = focusGrid(view);
  const current = focused()?.terminal ?? "list";
  const column = Math.max(0, grid.findIndex(cells => cells.includes(current)));
  const row = Math.max(0, grid[column].indexOf(current));
  const step = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[direction];
  const cells = grid[Math.min(grid.length - 1, Math.max(0, column + step[0]))];
  const target = cells[Math.min(cells.length - 1, Math.max(0, step[0] ? 0 : row + step[1]))];
  if (target === "list") return run(`${MOD}.search`);
  if (target === POTS_CELL) return focusPrincipal();
  if (target) run("pane.focus", { terminal: target });
}
