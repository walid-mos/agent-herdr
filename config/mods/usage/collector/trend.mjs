const DAY_MS = 86_400_000;
const TREND_DAYS = 7;
const SPARK_DAYS = 14;
const MIN_RUNWAY_SPAN_DAYS = 1;
const CHANGE_PRECISION = 10_000;

const atMs = (point) => Date.parse(point.at);
const byTime = (a, b) => atMs(a) - atMs(b);

function dailyCloses(points, nowMs) {
  const fromMs = nowMs - SPARK_DAYS * DAY_MS;
  const closeByDay = new Map();
  for (const point of points.filter((p) => atMs(p) >= fromMs)) closeByDay.set(new Date(atMs(point)).toISOString().slice(0, 10), point.amount);
  return [...closeByDay].map(([day, amount]) => ({ day, amount }));
}

function referencePoint(points, nowMs) {
  const cutoffMs = nowMs - TREND_DAYS * DAY_MS;
  return points.findLast((point) => atMs(point) <= cutoffMs) ?? points[0];
}

export function trendOf(allPoints, id, currency, nowMs) {
  const points = allPoints.filter((point) => point.id === id && point.currency === currency).sort(byTime);
  const latest = points.at(-1);
  if (!latest) return null;
  const reference = referencePoint(points, nowMs);
  const spanDays = (atMs(latest) - atMs(reference)) / DAY_MS;
  const change = Math.round((latest.amount - reference.amount) * CHANGE_PRECISION) / CHANGE_PRECISION;
  const burnPerDay = spanDays >= MIN_RUNWAY_SPAN_DAYS && change < 0 ? -change / spanDays : null;
  return {
    since: reference.at,
    spanDays,
    change,
    runwayDays: burnPerDay && latest.amount > 0 ? latest.amount / burnPerDay : null,
    daily: dailyCloses(points, nowMs),
    latest: { at: latest.at, amount: latest.amount, currency },
  };
}
