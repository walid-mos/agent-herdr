import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { isBalance, isSubscription, readMagpie, toMagpieCredit, toSubscription } from "./magpie.mjs";
import { readProviderBalance } from "./provider-balance.mjs";
import { lastPointOf, readHistory, recordReadings } from "./history.mjs";
import { trendOf } from "./trend.mjs";
import * as providers from "./providers/index.mjs";
import { mergeSameAccount } from "./same-account.mjs";
import { claudeAccountOf } from "./claude-account.mjs";

const STATE_DIR = join(homedir(), ".local", "state", "herdr-usage");
const HISTORY_FILE = join(STATE_DIR, "balances.jsonl");
const MAGPIE_FILE = join(STATE_DIR, "magpie-last.json");
const CLAUDE_ORGANIZATIONS_FILE = join(STATE_DIR, "claude-organizations.json");

function subscriptionAccounts() {
  const accountOfProvider = { claude: claudeAccountOf(CLAUDE_ORGANIZATIONS_FILE) };
  return async (subscription) => (await accountOfProvider[subscription.provider]?.(subscription)) ?? null;
}

async function readCredits(magpie, now) {
  const magpieCredits = magpie.entries.filter(isBalance).map(toMagpieCredit);
  const reported = new Set(magpieCredits.map((credit) => credit.id));
  const adapters = Object.values(providers).filter((adapter) => !reported.has(adapter.id));
  const adapterCredits = await Promise.all(adapters.map((adapter) => readProviderBalance(adapter, now)));
  return [...magpieCredits, ...adapterCredits];
}

function withTrend(credit, points, now) {
  const currency = credit.currency ?? lastPointOf(points, credit.id)?.currency;
  return { ...credit, trend: currency ? trendOf(points, credit.id, currency, now.getTime()) : null };
}

async function collect() {
  const now = new Date();
  const magpie = await readMagpie(MAGPIE_FILE, now);
  const credits = await readCredits(magpie, now);
  const points = await recordReadings(HISTORY_FILE, await readHistory(HISTORY_FILE), credits);
  return {
    at: now.toISOString(),
    host: hostname(),
    magpie: { ok: magpie.ok, at: magpie.at, error: magpie.error ?? null, savedAt: magpie.savedAt ?? null },
    subscriptions: await mergeSameAccount(magpie.entries.filter(isSubscription).map(toSubscription), subscriptionAccounts()),
    credits: credits.map((credit) => withTrend(credit, points, now)),
  };
}

try {
  process.stdout.write(JSON.stringify(await collect()));
} catch (error) {
  process.stderr.write(`usage collector failed: ${String(error?.message ?? error).split("\n")[0]}\n`);
  process.exitCode = 1;
}
