const pad = (n) => String(n).padStart(2, "0");

export function clock(at) {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function duration(ms) {
  if (!Number.isFinite(ms)) return "";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function tokens(n) {
  if (!n) return "";
  if (n < 1000) return `${n} tokens`;
  return n < 1e6 ? `${Math.round(n / 1000)}k tokens` : `${(n / 1e6).toFixed(1)}M tokens`;
}

export const count = (n) => String(Math.round(n ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const tries = (n) => (n === 1 ? "1 try" : `${n} tries`);
