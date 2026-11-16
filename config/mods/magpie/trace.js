import { exec } from "herdr";

export const GATEWAY = "http://127.0.0.1:3425";
export const HOST = GATEWAY.replace(/^https?:\/\//, "");
const REMOTE_TIMEOUT_MS = 40000;

async function gatewayJson(path, machine) {
  const url = `${GATEWAY}${path}`;
  if (machine) {
    const r = await exec("curl", ["-sS", "-f", url], { on: machine, timeout: REMOTE_TIMEOUT_MS });
    if (r.code !== 0) throw new Error(r.stderr.trim() || `curl exited ${r.code}`);
    return JSON.parse(r.stdout);
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${path} answered ${r.status}`);
  return r.json();
}

// `after` + `wait` holds the request until a route changes (the gateway answers within 25 s).
// The gateway answers only its own machine without a key, so another machine's trace is read there.
export const readTrace = (after, machine) =>
  gatewayJson(`/v1/magpie/trace${after === null ? "" : `?after=${after}&wait=1`}`, machine);

export async function readModels(machine) {
  const body = await gatewayJson("/v1/models", machine);
  return new Map((body.data ?? []).map((m) => [m.id, { name: m.display_name ?? m.id, price: Number(m.pricing?.completion) || 0 }]));
}

// No gateway route lists the groups' rules; jq keeps the file's provider keys out of the mod.
export async function readGroups(machine) {
  const r = await exec("sh", ["-c", `jq -c '[.groups[]? | {id, members, rules}]' "$HOME/.config/magpie/providers.json"`], { on: machine, timeout: REMOTE_TIMEOUT_MS });
  if (r.code !== 0) throw new Error(r.stderr.trim() || `jq exited ${r.code}`);
  return new Map(JSON.parse(r.stdout).map((g) => [g.id, g]));
}

export const lastTry = (route) => route.tries?.at(-1) ?? null;

export function seatOf(route, attempt) {
  const order = route.order ?? [];
  return order.find((o) => o.id === attempt.id && o.model === attempt.model)
    ?? order.find((o) => o.id === attempt.id)
    ?? { id: attempt.id, name: attempt.id };
}

export function seatKey(route) {
  const attempt = lastTry(route);
  return attempt ? `${attempt.id}/${attempt.model}` : null;
}

export function stateOf(route) {
  if (!route.done) return "live";
  return route.status >= 400 || route.error ? "failed" : "ok";
}

export const servedModel = (route) => route.served ?? lastTry(route)?.served ?? lastTry(route)?.model ?? "";

const reasoningOf = (r) => r.reasoning ?? (r.usage?.length ? r.usage.at(-1).reasoning || 0 : 0);

// Magpie's own rule (routing client.js decodeOf): a reply let go in one burst tells no speed.
export function tokensPerSecond(r) {
  const { ms, ttft, firstText, flow, firstReasoning } = r;
  if (r.reasoningHidden && !(firstText > 0)) return 0;
  const think = reasoningOf(r);
  const visible = think > 0 && !(firstText > 0) && firstReasoning >= ttft && flow > 0 && think <= r.out;
  const n = think > 0 && !visible ? r.out - think : r.out;
  const from = visible ? firstReasoning : think > 0 ? firstText : ttft;
  const w = ms - from;
  if (!(n > 0 && ttft > 0 && from > 0 && w >= 100 && n * 1000 <= 10000 * w)) return 0;
  if (flow > 0 && flow * 4 < w) return 0;
  if (w < 1000 && from > 4 * w) return 0;
  if (think > 0 && firstText > 0 && n * (firstText - ttft) > 20 * think * w) return 0;
  return Math.round(n / (w / 1000));
}

export const startedAt = (route) => Date.parse(route.time);
