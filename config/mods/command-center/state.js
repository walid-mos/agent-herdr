import { shared, terminals, home, appHome } from "herdr";

export const MOD = "command-center";
export const VIEW = "command-center.view";
export const META = "command-center.meta";
export const FILTER = "command-center.filter";
export const ENDING = "command-center.ending";
export const SPLITS = "command-center.splits";
export const POTS_STATUS = "pots.status";
export const PRINCIPAL = {
  title: "Principal", chatName: "principal-chat", app: "pi", folder: "Development", sessions: ".pi/agent/sessions/principal",
  space: "spprincipal", tab: "tbprincipal", brief: "mods/command-center/principal.md",
};

const EMPTY_META = { git: {}, sessions: {}, errors: [] };

export const currentView = () => shared(VIEW) ?? { mode: "home" };
export const meta = () => shared(META) ?? EMPTY_META;
export const statusFilter = () => shared(FILTER) ?? "all";
export const potsStatus = () => ({ state: "starting", model: "", bot: "", ...shared(POTS_STATUS) });
export const liveTerminal = address => terminals().find(terminal => terminal.address === address && terminal.state === "live");
export const principalFolder = () => `${home()}/${PRINCIPAL.folder}`;
export const principalTerminal = () => terminals().find(terminal => terminal.name === PRINCIPAL.chatName && terminal.state === "live") ?? null;

/** Herdr puts a bare shell in place of a pi lost to a reboot: Principal is offline then.
 *  A pi that is still loading reports no status either, and its pane must show. */
const isLostShell = terminal => !terminal.status && terminal.program?.key === "shell";

export function principalAgent() {
  const sessions = `${home()}/${PRINCIPAL.sessions}`;
  return { sessions, argv: ["pi", "--session-dir", sessions, "--continue", "--name", PRINCIPAL.title, "--append-system-prompt", `${appHome()}/${PRINCIPAL.brief}`] };
}

export function principalChat() {
  const terminal = principalTerminal();
  return terminal && !isLostShell(terminal) ? terminal.address : null;
}
