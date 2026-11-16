import { View } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, nextCommand, notify } from "herdr";
import { currentView, principalChat } from "./state.js";
import {
  goHome, openThread, inspectThread, stepThread, openNextWaiting, openSlot, moveFocus, repairLayout, shownThread, showView, focusPrincipal, isPotsLayout,
} from "./navigation.js";
import { startPrincipal, namePrincipalSpace, sweepAuxiliaries } from "./lifecycle.js";
import { askToEnd, endConfirmed } from "./ending.js";
import { refreshThreads } from "./sessions.js";
import { titlebar, layoutReturn, principalHeader, threadHeader, monitorHeader, shellHeader, offlinePanel, BAR_INSET_PX } from "./headers.js";
import { UsageMenu } from "./usage-menu.js";
import { ThreadList } from "./list.js";
import { board } from "./board.js";
import { switchFocusedWindow } from "./window-switch.js";
import { sweepFinished } from "./autoclose.js";

const THREADS_POLL_MS = 15000;
// Herdr drops an ended terminal's block from the layout, so the window is checked every second, not at the next poll; nothing redraws unless it is broken.
const REPAIR_MS = 1000;
const CLOCK_MS = 60000;
const CLOCKED_ROLES = ["threads", "board", "thread"];
const NAVIGATION = {
  home: () => goHome("keyboard"),
  next: () => stepThread(1),
  previous: () => stepThread(-1),
  needs: () => openNextWaiting(),
  principal: () => focusPrincipal(),
  search: () => currentView().mode !== "home" && goHome("keyboard", "list"),
  end: () => askToEnd([shownThread()].filter(Boolean)),
  "end-confirmed": () => endConfirmed(),
};

function navigate(command) {
  if (command.startsWith("window-")) return switchFocusedWindow(command.slice("window-".length));
  if (command.startsWith("go-")) return moveFocus(command.slice("go-".length));
  if (command.startsWith("open-")) return openSlot(Number(command.slice("open-".length)));
  NAVIGATION[command]?.();
}

export default class CommandCenter extends View {
  init(_props, cx) {
    this.role = props()?.role ?? null;
    this.isBusy = false;
    this.refreshing = new Set();
    this.boardWidth = 0;
    this.actions = {
      open: (thread, intent, cx) => this.open(thread, intent, cx),
      toggleInspector: cx => this.toggleInspector("pointer", cx),
      end: list => askToEnd(list),
    };
    if (this.role === "threads" || !this.role) this.list = new ThreadList(this.actions);
    if (this.role === "titlebar" || !this.role) this.usageMenu = new UsageMenu(BAR_INSET_PX);
    if (this.role === "threads" && currentView().focus === "list") this.list.focus();
    if (CLOCKED_ROLES.includes(this.role)) cx.timer.every(CLOCK_MS, cx => cx.notify());
    if (this.role === "titlebar") {
      this.pollThreads(cx);
      cx.timer.every(THREADS_POLL_MS, cx => this.pollThreads(cx));
      cx.timer.every(REPAIR_MS, () => repairLayout());
    }
    cx.spawn(async cx => {
      for (;;) {
        this.onCommand(await nextCommand(), cx);
        cx.notify();
      }
    });
  }

  onCommand(command, cx) {
    if (this.role === "threads") return this.list.onCommand(command);
    if (this.role !== "titlebar") return;
    if (command === "inspect") return this.toggleInspector("keyboard", cx);
    if (command === "usage") return this.usageMenu.toggle();
    if (command === "refresh") return this.pollThreads(cx);
    if (command === "restart-principal") return this.startPrincipal(cx);
    if (command === "principal" && !isPotsLayout() && !principalChat()) return this.startPrincipal(cx);
    navigate(command);
  }

  pollThreads(cx) {
    namePrincipalSpace();
    sweepAuxiliaries();
    this.refresh("threads", cx, refreshThreads);
    this.refresh("lifecycle", cx, sweepFinished);
  }

  refresh(name, cx, task) {
    if (this.refreshing.has(name)) return;
    this.refreshing.add(name);
    cx.spawn(async () => {
      try { await task(); }
      finally { this.refreshing.delete(name); }
    });
  }

  runOnce(cx, failureTitle, task) {
    if (this.isBusy) return;
    this.isBusy = true;
    cx.notify();
    cx.spawn(async cx => {
      try { await task(); }
      catch (error) { notify({ title: failureTitle, body: error instanceof Error ? error.message : String(error), level: "error" }); }
      finally { this.isBusy = false; cx.notify(); }
    });
  }

  open(thread, { source, isInspecting }, cx) {
    if (!isInspecting) return openThread(thread, source);
    this.runOnce(cx, "Monitor and shell could not open", () => inspectThread(thread, source));
  }

  toggleInspector(source, cx) {
    const thread = shownThread();
    if (!thread) return;
    if (currentView().mode === "inspect") return showView({ mode: "thread", terminal: thread.address, source });
    this.runOnce(cx, "Monitor and shell could not open", () => inspectThread(thread, source));
  }

  startPrincipal(cx) {
    this.runOnce(cx, "Principal could not start", async () => {
      await startPrincipal();
      repairLayout();
    });
  }

  resizeBoard(size, cx) {
    if (size.width === this.boardWidth) return;
    this.boardWidth = size.width;
    cx.notify();
  }

  render() {
    const views = {
      titlebar: () => titlebar(this.usageMenu),
      return: () => layoutReturn(),
      principal: () => principalHeader(),
      thread: () => threadHeader(this.actions),
      monitor: () => monitorHeader(),
      shell: () => shellHeader(),
      offline: () => offlinePanel({ isStarting: this.isBusy, onStart: (_event, cx) => this.startPrincipal(cx) }),
      threads: () => this.list.render(),
      board: () => board(this.actions, { width: this.boardWidth, onResize: (size, cx) => this.resizeBoard(size, cx) }),
    };
    // Without a role (herdr-app check, mod.open) every view renders, so one check covers them all.
    if (!this.role) return v_flex().size_full().children(Object.values(views).map(view => view()));
    return views[this.role]();
  }
}
