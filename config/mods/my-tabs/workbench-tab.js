import { exec, focused, notify, panes, spaces } from "herdr";

const MONITOR_MODEL = ["--provider", "magpie", "--model", "group/think"];

async function appCommand(name, args) {
  const result = await exec("herdr-app", ["do", name, JSON.stringify(args)]);
  if (result.code !== 0) throw new Error(`${name}: ${result.stderr || result.stdout}`);
  const response = JSON.parse(result.stdout);
  if (response.error) throw new Error(`${name}: ${response.error}`);
  return response;
}

function shellCommand(argv) {
  return argv.map(argument => `'${argument.replace(/'/g, `'"'"'`)}'`).join(" ");
}

async function sendCommand(terminal, argv) {
  const result = await exec("herdr-core", ["send", terminal, shellCommand(argv)]);
  if (result.code !== 0) throw new Error(`Could not start ${argv[0]} in ${terminal}: ${result.stderr || result.stdout}`);
}

function monitorPrompt(terminal) {
  const address = terminal.split("/").at(-1);
  return [
    `Watch herdr terminal ${address}, the free shell in this tab where I run my commands, with the terminal-watch skill for as long as this session stays open.`,
    `Start the watcher now, then audit each alert it sends. Report causes here and leave fixes to the main Pi on the left unless I ask you.`,
  ].join(" ");
}

async function findPane(tabId, terminal) {
  const listing = await exec("herdr-app", ["ls"]);
  if (listing.code !== 0) throw new Error(listing.stderr || listing.stdout);
  const tab = JSON.parse(listing.stdout).spaces.flatMap(space => space.tabs).find(candidate => candidate.id === tabId);
  const pane = tab?.terminals.find(candidate => candidate.terminal === terminal)?.pane;
  if (!pane) throw new Error("The new tab's first pane was not found.");
  return pane;
}

export default async function createWorkbenchTab() {
  const space = spaces().find(candidate => candidate.active);
  const activeTab = space?.tabs.find(tab => tab.active);
  const folder = focused()?.cwd ?? panes().find(pane => pane.tab === activeTab?.id)?.cwd ?? space?.folder;
  let createdTab;
  try {
    createdTab = await appCommand("tab.new", { space: space?.id, folder });
    const mainPane = await findPane(createdTab.tab, createdTab.terminal);
    const shell = await appCommand("pane.split", { pane: mainPane, direction: "right" });
    const monitor = await appCommand("pane.split", { pane: shell.pane, direction: "down" });
    await appCommand("pane.swap", { pane: shell.pane, target: monitor.pane });
    await sendCommand(createdTab.terminal, ["pi"]);
    await sendCommand(monitor.terminal, ["pi", ...MONITOR_MODEL, monitorPrompt(shell.terminal)]);
    await appCommand("pane.focus", { pane: mainPane });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    notify({ title: "Could not finish the workbench tab", body: `${detail}${createdTab ? " The partially created tab was kept." : ""}`, level: "error" });
  }
}
