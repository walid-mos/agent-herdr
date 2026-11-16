import { div, svg, PathBuilder } from "gpui-kit";
import { h_flex } from "gpui-base";
import { cable, comet } from "./flow.js";

export const ICONS = "mods/magpie";
export const OUT_MS = 1100;
export const BACK_MS = 1100;
export const AWAY_MS = 450;

const PAD_X = 12;
const PAD_Y = 14;
const NODE_H = 26;
const PITCH = 34;
const DOT = 7;
const WIRE = 1.25;
const GLOW = 3;
const PORT = 5;
const RING = { from: 5, to: 22 };
const BREATH_MS = 1800;

// The flier is drawn in Magpie's own units (x -32..11, y -21..9), scaled by S;
// the dot it carries sits at the tip of its beak.
const S = 0.8;
const BOX = { w: 43 * S, h: 30 * S };
const BEAK = { r: { x: 38.5 * S, y: 17.8 * S }, l: { x: 4.5 * S, y: 17.8 * S } };
const WING = { x: { r: 14 * S, l: 19 * S }, w: 10 * S, shoulder: 18.2 * S, up: 17.8 * S, down: 17.8 * 0.62 * S, fold: 0.6, beat: 420 };

const rowsHeight = (n) => n * PITCH - (PITCH - NODE_H);

export function geometry(width, agents, seats) {
  const height = rowsHeight(Math.max(agents.length, seats.length, 1)) + 2 * PAD_Y;
  const agentW = Math.min(124, Math.max(72, width * 0.24));
  const seatW = Math.min(200, Math.max(100, width * 0.52));
  const top = (n, i) => (height - rowsHeight(n)) / 2 + i * PITCH;
  const place = (list, x, w, end) => new Map(list.map((item, i) => {
    const y = top(list.length, i);
    return [item.key, { x, y, w, end, mid: y + NODE_H / 2 }];
  }));
  return {
    width,
    height,
    agent: place(agents, PAD_X, agentW, PAD_X + agentW),
    seat: place(seats, width - PAD_X - seatW, seatW, width - PAD_X - seatW),
  };
}

function wire(a, b, color, live) {
  const [start, c1, c2, end] = cable(a, b);
  const curve = (pen) => pen.move_to(start.x, start.y).cubic_bezier_to(end.x, end.y, c1.x, c1.y, c2.x, c2.y).build();
  const paint = (path, fill) => window.paint_path(path, fill).absolute().top(0).left(0).size_full();
  const dots = paint(curve(PathBuilder.stroke(WIRE).dash_array(live ? [1.5, 3.5] : [1.25, 5])), live ? color : `${color}66`);
  if (!live) return [dots];
  return [
    paint(curve(PathBuilder.stroke(GLOW)), `${color}1f`),
    dots.loop("opacity", { from: 0.55, to: 1, period: BREATH_MS }),
  ];
}

function port(t, id, x, y, color, live) {
  return div().id(id).absolute().left(x - PORT / 2).top(y - PORT / 2).size(PORT).rounded(PORT / 2)
    .border_1().border_color(live ? color : `${color}80`).bg(live ? color : t.surface);
}

function ring(t, leg, at, color) {
  const landed = leg.phase === "away";
  const size = landed ? RING.to : RING.from;
  const ease = { duration: AWAY_MS, easing: "ease-out" };
  return div().id(`ring-${leg.key}`).absolute().left(at.x - size / 2).top(at.y - size / 2).size(size).rounded(RING.to)
    .border_1().border_color(leg.kind === "err" ? t.blocked : color).opacity(landed ? 0 : 0.5)
    .transition("left", ease).transition("top", ease).transition("width", ease).transition("height", ease)
    .transition("opacity", ease);
}

const dot = (color) => div().flex_none().size(DOT).rounded(DOT / 2).bg(color);

// A request is filled with its agent's colour, an answer ringed with it, a failure ringed red.
function packet(t, kind, color) {
  const base = div().size(DOT).rounded(DOT / 2);
  if (kind === "req") return base.bg(color);
  return base.bg(kind === "err" ? color : t.surface).border_2().border_color(kind === "err" ? t.blocked : color);
}

function node(t, id, at, content) {
  return h_flex().id(id).absolute().left(at.x).top(at.y).w(at.w).h(NODE_H).px(8).gap(6).items_center()
    .rounded(7).border_1().border_color(t.border).bg(t.background).text_size(12).children(content);
}

function flier(t, leg, from, to, color) {
  const sign = leg.dir === "r" ? 1 : -1;
  const beak = BEAK[leg.dir];
  const at = leg.phase === "start" ? from : leg.phase === "fly" ? to : { x: to.x + 14 * sign, y: to.y - 16 };
  const ms = leg.dir === "r" ? OUT_MS : BACK_MS;
  const flying = leg.phase !== "away";
  return div().id(`fl-${leg.key}`).absolute().w(BOX.w).h(BOX.h)
    .left(at.x - beak.x).top(at.y - beak.y).opacity(leg.phase === "fly" ? 1 : 0)
    .transition("left", flying ? { duration: ms, easing: "linear" } : { duration: AWAY_MS, easing: "ease-out" })
    .transition("top", flying ? { duration: ms, easing: "ease-in-out" } : { duration: AWAY_MS, easing: "ease-out" })
    .transition("opacity", flying ? 250 : AWAY_MS)
    .text_color(t.foreground)
    .when(leg.phase === "start", (el) => el.on_size_change((_size, cx) => leg.arm(cx)))
    .child(svg(`${ICONS}/bird-${leg.dir}.svg`).absolute().left(0).top(0).w(BOX.w).h(BOX.h))
    .child(svg(`${ICONS}/wing-up-${leg.dir}.svg`).absolute().left(WING.x[leg.dir]).w(WING.w)
      .top(WING.shoulder - WING.up).h(WING.up)
      .loop("height", { from: WING.up, to: WING.fold, period: WING.beat })
      .loop("top", { from: WING.shoulder - WING.up, to: WING.shoulder - WING.fold, period: WING.beat }))
    .child(svg(`${ICONS}/wing-down-${leg.dir}.svg`).absolute().left(WING.x[leg.dir]).w(WING.w)
      .top(WING.shoulder).h(WING.fold)
      .loop("height", { from: WING.fold, to: WING.down, period: WING.beat }))
    .when(flying, (el) => el.child(packet(t, leg.kind, color).absolute().left(beak.x - DOT / 2).top(beak.y - DOT / 2)));
}

// Where a flight starts and ends: the port at either end of its wire.
const seatPoint = (s) => ({ x: s.end, y: s.mid });
const agentPoint = (a) => ({ x: a.end, y: a.mid });

export function stage(t, g, { agents, seats, wires, plays, hue, agentIcon, busySeats, round }) {
  const layers = [];
  const answering = new Set(plays.filter((p) => p.held).map((p) => `${p.agent}|${p.seat}`));
  const ports = new Map();
  const plug = (id, x, y, color, live) => ports.set(id, { x, y, color, live: live || ports.get(id)?.live });
  for (const w of wires) {
    const a = g.agent.get(w.agent), s = g.seat.get(w.seat);
    if (!a || !s) continue;
    const color = hue(w.agent);
    layers.push(...wire(a, s, color, w.live));
    if (answering.has(`${w.agent}|${w.seat}`)) layers.push(...comet(`cm-${w.agent}-${w.seat}`, cable(a, s), color, round));
    plug(`pa-${w.agent}`, a.end, a.mid, color, w.live);
    plug(`ps-${w.agent}-${w.seat}`, s.end, s.mid, color, w.live);
  }
  for (const a of agents) {
    const at = g.agent.get(a.key);
    layers.push(node(t, `ag-${a.key}`, at, [agentIcon(a.key, hue(a.key)), div().min_w(0).truncate().text_color(t.foreground).child(a.name)]));
  }
  for (const s of seats) {
    const at = g.seat.get(s.key);
    const busy = busySeats.has(s.key);
    const mark = busy ? dot(t.working).loop("opacity", { from: 1, to: 0.5, period: 1400 }) : dot(s.out ? t.blocked : t.dim);
    layers.push(node(t, `st-${s.key}`, at, [
      mark,
      div().min_w(0).truncate().text_color(busy ? t.foreground : s.out ? t.dim : t.muted).child(s.label),
    ]).when(s.out, (el) => el.tooltip("Allowance used up")));
  }
  for (const [id, p] of ports) layers.push(port(t, id, p.x, p.y, p.color, p.live));
  for (const play of plays) {
    const a = g.agent.get(play.agent), s = play.seat && g.seat.get(play.seat);
    if (!a || !s) continue;
    const color = hue(play.agent);
    if (play.held) {
      const p = seatPoint(s);
      layers.push(packet(t, "req", color).id(`held-${play.id}`).absolute().left(p.x - DOT / 2).top(p.y - DOT / 2)
        .transition("left", 500).transition("top", 500)
        .loop("opacity", { from: 1, to: 0.6, period: 1400 }));
    }
    for (const leg of play.legs) {
      const [from, to] = leg.dir === "r" ? [agentPoint(a), seatPoint(s)] : [seatPoint(s), agentPoint(a)];
      if (leg.phase !== "start") layers.push(ring(t, leg, to, color));
      layers.push(flier(t, leg, from, to, color));
    }
  }
  return layers;
}

export const empty = (t, text) => div().absolute().left(0).top(0).size_full().flex().items_center().justify_center()
  .text_size(12).text_color(t.dim).child(text);
