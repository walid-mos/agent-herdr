const REQUEST_TIMEOUT_MS = 15_000;
const KEY_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function adapterProblem(adapter) {
  if (adapter.unavailable) return null;
  if (!KEY_NAME_PATTERN.test(adapter.key ?? "")) return "its key must name an exported variable, like DEEPSEEK_API_KEY";
  if (!String(adapter.url ?? "").startsWith("https://")) return "its url must be https";
  if (typeof adapter.read !== "function") return "it needs a read(body) function";
  return null;
}

function requestFailure(error) {
  if (error?.name === "TimeoutError") return `no answer within ${REQUEST_TIMEOUT_MS / 1000}s`;
  return `unreachable (${error?.cause?.code ?? error?.name ?? "error"})`;
}

async function fetchBody(adapter, key) {
  const response = await fetch(adapter.url, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return { failure: `HTTP ${response.status}` };
  return { body: await response.json().catch(() => null) };
}

function readAmount(adapter, body) {
  try {
    const { amount, currency } = adapter.read(body ?? {});
    return Number.isFinite(amount) && currency ? { amount, currency } : null;
  } catch {
    return null;
  }
}

export async function readProviderBalance(adapter, now) {
  const base = { id: adapter.id, name: adapter.name, readAt: now.toISOString() };
  if (adapter.unavailable) return { ...base, source: "no API", status: "unavailable", error: adapter.unavailable };
  const problem = adapterProblem(adapter);
  if (problem) return { ...base, source: "adapter", status: "failed", error: `adapter ${adapter.id}: ${problem}` };
  const source = new URL(adapter.url).host;
  const key = process.env[adapter.key];
  if (!key) return { ...base, source, status: "failed", error: `${adapter.key} is not exported here; run infisical-refresh` };
  try {
    const { body, failure } = await fetchBody(adapter, key);
    if (failure) return { ...base, source, status: "failed", error: failure };
    const money = readAmount(adapter, body);
    if (!money) return { ...base, source, status: "failed", error: "answered without an amount the adapter could read" };
    return { ...base, source, status: "ok", ...money };
  } catch (error) {
    return { ...base, source, status: "failed", error: requestFailure(error) };
  }
}
