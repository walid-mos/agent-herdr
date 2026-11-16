import { div } from "gpui-kit";

const TRAVEL_MS = 850;
const RISE_MS = 90;
const TAIL_MS = 120;
const SHRINK_MS = 320;
const PAUSE_MS = 100;
const RESET_MS = 120;
const SNAP = { duration: 1 };
const SPACING = 6;
const SPARK = 3.5;
const SAMPLES = 64;

export function cable(a, b) {
  const bend = (b.end - a.end) / 2;
  return [{ x: a.end, y: a.mid }, { x: a.end + bend, y: a.mid }, { x: b.end - bend, y: b.mid }, { x: b.end, y: b.mid }];
}

function pointAt([p0, p1, p2, p3], s) {
  const r = 1 - s;
  const mix = (k) => r * r * r * p0[k] + 3 * r * r * s * p1[k] + 3 * r * s * s * p2[k] + s * s * s * p3[k];
  return { x: mix("x"), y: mix("y") };
}

function evenlySpaced(points) {
  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => pointAt(points, i / SAMPLES));
  const placed = [];
  let walked = 0;
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i - 1], q = samples[i];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    while ((placed.length + 1) * SPACING < walked + length) {
      const s = ((placed.length + 1) * SPACING - walked) / length;
      placed.push({ x: p.x + (q.x - p.x) * s, y: p.y + (q.y - p.y) * s });
    }
    walked += length;
  }
  return placed;
}

// Odd rounds run a comet; even rounds snap every spark back to hidden and full size.
// A transition outlives the render that declared it, so the snap must be declared too.
const isRunning = (round) => round % 2 === 1;
export const nextRoundMs = (round) => (isRunning(round) ? TRAVEL_MS + TAIL_MS + SHRINK_MS + PAUSE_MS : RESET_MS);

export function comet(id, points, color, round) {
  const sparks = evenlySpaced(points);
  const step = TRAVEL_MS / Math.max(sparks.length, 1);
  const running = isRunning(round);
  const size = running ? 0 : SPARK;
  return sparks.map((p, i) => {
    const lead = (sparks.length - 1 - i) * step;
    const rise = running ? { duration: RISE_MS, delay: lead, easing: "ease-out" } : SNAP;
    const shrink = running ? { duration: SHRINK_MS, delay: lead + TAIL_MS, easing: "ease-in-out" } : SNAP;
    return div().id(`${id}-${i}`).absolute().left(p.x - size / 2).top(p.y - size / 2).size(size)
      .rounded(SPARK / 2).bg(color).opacity(running ? 1 : 0)
      .transition("opacity", rise)
      .transition("left", shrink).transition("top", shrink).transition("width", shrink).transition("height", shrink);
  });
}
