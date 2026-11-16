import { seatKey } from "./trace.js";

const EFFORT = "(?:none|minimal|low|medium|high|xhigh|max)";
const EFFORT_SUFFIX = new RegExp(`:${EFFORT}(?:\\+${EFFORT})*$`);
const GROUP = "group/";

export const modelKey = (ref) => ref.replace(EFFORT_SUFFIX, "");

function expand(ref, groups, seen = new Set()) {
  if (!ref.startsWith(GROUP)) return [modelKey(ref)];
  const id = ref.slice(GROUP.length);
  if (seen.has(id)) return [];
  seen.add(id);
  return (groups.get(id)?.members ?? []).flatMap((m) => expand(m, groups, seen));
}

// The models an intent rule names: at the same price, the one an intent picks ranks higher.
function intentPicks(groups) {
  return new Set([...groups.values()].flatMap((g) => (g.rules ?? [])
    .filter((r) => r.intent && !r.pause && !r.use.startsWith(GROUP))
    .map((r) => modelKey(r.use))));
}

// Every model a group can reach, plus any other that served a request, dearest output first.
export function roster(routes, groups, models) {
  const picks = intentPicks(groups);
  const keys = new Set([
    ...[...groups.keys()].flatMap((id) => expand(`${GROUP}${id}`, groups)),
    ...routes.flatMap((r) => (r.group?.members ?? []).map(modelKey)),
    ...routes.map(seatKey).filter(Boolean),
  ]);
  const price = (key) => models.get(key)?.price ?? 0;
  return [...keys].sort((a, b) => price(b) - price(a) || Number(picks.has(b)) - Number(picks.has(a)));
}

// A model is out when its allowance is used up, as the latest route that offered it says; a model
// no route offered takes its account's least-used figure.
export function exhausted(routes, keys) {
  const used = new Map();
  const account = new Map();
  for (const r of routes) {
    for (const o of r.order ?? []) {
      if (typeof o.used !== "number") continue;
      const key = `${o.id}/${o.model}`;
      if (!used.has(key)) used.set(key, o.used);
      account.set(o.id, Math.min(account.get(o.id) ?? Infinity, o.used));
    }
  }
  return new Set(keys.filter((key) => (used.get(key) ?? account.get(key.slice(0, key.indexOf("/"))) ?? 0) >= 100));
}
