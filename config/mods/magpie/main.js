import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, layout, settings, spaces, knownAgents, readTextFile, appHome } from "herdr";
import { HOST, readTrace, readModels, readGroups, lastTry, seatOf, seatKey, stateOf, servedModel, tokensPerSecond, startedAt } from "./trace.js";
import { roster, exhausted } from "./roster.js";
import { ICONS, OUT_MS, BACK_MS, AWAY_MS, geometry, stage, empty } from "./stage.js";
import { nextRoundMs } from "./flow.js";
import { clock, count, duration, tokens, tries } from "./format.js";

const MOD = "magpie";
// Pi's claude-code tool runs Claude Code through Magpie, so those requests arrive as agent `claude`.
const SHOWN_AGENTS = new Map([["pi", "pi"], ["claude", "pi"]]);
const LIVE = 4;
const STAGED_AGENTS = 4;
const BATCH_MS = 200;
const ARM_FALLBACK_MS = 400;
const RETRY_MS = 3000;
const MASK = "••••";

function contains(node, mod) {
  return node?.content?.mod === mod || (node?.children ?? []).some((c) => contains(c, mod));
}

function shownIn(node, mod) {
  if (!node || node.hidden) return false;
  if (node.content?.mod === mod) return true;
  const kids = node.children ?? [];
  if (node.type === "stack") return shownIn(kids.find((k) => k.id === node.active) ?? kids[0], mod);
  return kids.some((k) => shownIn(k, mod));
}

function hash(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const latestFirst = (a, b) => b.id - a.id;

const activeMachine = () => spaces().find((s) => s.active)?.machine ?? null;

function distinct(routes, keyOf, limit) {
  const seen = new Map();
  for (const r of routes) {
    const key = keyOf(r);
    if (key && !seen.has(key)) seen.set(key, r);
    if (seen.size === limit) break;
  }
  return seen;
}

export default class Magpie extends View {
  init(_props, cx) {
    this.gen = 0;
    this.legs = 0;
    this.round = 0;
    this.isStreaming = false;
    this.expanded = new Set();
    this.icons = new Map();
    this.width = 340;
    this.masked = localStorage.getItem("masked") !== "0";
    this.shown = this.visible();
    this.watch(activeMachine(), cx);
    cx.timer.every(1000, (cx) => this.tick(cx));
  }

  // The agents of the shown space route through the gateway of the machine that space lives on.
  watch(machine, cx) {
    const gen = ++this.gen;
    this.machine = machine;
    this.routes = new Map();
    this.seq = null;
    this.pid = null;
    this.totals = null;
    this.up = null;
    this.failure = null;
    this.plays = new Map();
    this.programs = new Map();
    this.groups = new Map();
    this.models = new Map();
    cx.spawn(async (cx) => this.follow(cx, gen));
    this.loadCatalog(cx);
    cx.spawn(async (cx) => {
      const programs = await knownAgents({ on: machine });
      if (gen !== this.gen) return;
      for (const p of programs) this.programs.set(p.key, p);
      cx.notify();
    });
    cx.notify();
  }

  // Groups and model names change only when Magpie's settings do: read on watch and on reload.
  loadCatalog(cx) {
    const gen = this.gen;
    const load = (read, key) => cx.spawn(async (cx) => {
      const value = await read(this.machine).catch(() => null);
      if (gen !== this.gen || !value) return;
      this[key] = value;
      cx.notify();
    });
    load(readGroups, "groups");
    load(readModels, "models");
  }

  place() {
    return this.machine ? `${HOST} on ${this.machine}` : HOST;
  }

  visible() {
    const root = layout();
    return contains(root, MOD) ? shownIn(root, MOD) : true;
  }

  async follow(cx, gen) {
    while (gen === this.gen) {
      const full = this.seq === null;
      try {
        const body = await readTrace(full ? null : this.seq, this.machine);
        if (gen !== this.gen) return;
        this.apply(body, full, cx);
        this.up = true;
        this.failure = null;
      } catch (error) {
        if (gen !== this.gen) return;
        this.up = false;
        this.failure = String(error?.message ?? error);
        this.seq = null;
        if (this.shown) cx.notify();
        await cx.sleep(RETRY_MS);
        continue;
      }
      if (this.shown) cx.notify();
      await cx.sleep(BATCH_MS);
    }
  }

  reload(cx) {
    const gen = this.gen;
    this.loadCatalog(cx);
    cx.spawn(async (cx) => {
      try {
        const body = await readTrace(null, this.machine);
        if (gen !== this.gen) return;
        this.apply(body, true, cx);
        this.up = true;
        this.failure = null;
      } catch (error) {
        if (gen !== this.gen) return;
        this.up = false;
        this.failure = String(error?.message ?? error);
      }
      cx.notify();
    });
  }

  apply(body, full, cx) {
    const fresh = full || body.pid !== this.pid;
    if (fresh) this.routes = new Map();
    const arrived = [];
    for (const r of body.routes ?? []) {
      const agent = SHOWN_AGENTS.get(r.agent);
      if (!agent) continue;
      r.agent = agent;
      if (!fresh && !this.routes.has(r.id)) arrived.push(r);
      this.routes.set(r.id, r);
    }
    const kept = new Set(body.ids ?? []);
    for (const id of [...this.routes.keys()]) if (!kept.has(id)) this.routes.delete(id);
    this.seq = body.seq;
    this.pid = body.pid;
    this.totals = body.totals;
    for (const r of arrived) this.launch(r, cx);
    if (fresh) for (const r of this.underWay()) this.launch(r, cx);
    for (const play of [...this.plays.values()]) this.advance(play, cx);
    for (const r of this.routes.values()) if (!this.programs.has(r.agent)) this.findIcon(r.agent, cx);
  }

  underWay() {
    return [...this.routes.values()].filter((r) => !r.done).sort((a, b) => a.id - b.id).slice(-LIVE);
  }

  tick(cx) {
    const machine = activeMachine();
    if (machine !== this.machine) this.watch(machine, cx);
    const shown = this.visible();
    if (shown !== this.shown) {
      this.shown = shown;
      if (shown) for (const r of this.underWay()) this.launch(r, cx);
      else this.plays.clear();
      cx.notify();
    } else if (shown && this.underWay().length) cx.notify();
  }

  // One magpie carries the request out to the account routing put it on and lets it go
  // there while it answers; another brings the answer back.
  launch(route, cx) {
    if (!this.shown || this.plays.has(route.id) || this.plays.size >= LIVE) return;
    const play = { id: route.id, agent: route.agent, seat: seatKey(route), held: false, waiting: true, finished: false, legs: [] };
    this.plays.set(route.id, play);
    this.advance(play, cx);
  }

  advance(play, cx) {
    const route = this.routes.get(play.id);
    const seat = route ? seatKey(route) : null;
    if (seat) play.seat = seat;
    if (play.waiting && play.seat) {
      play.waiting = false;
      this.fly(play, "r", "req", cx, (cx) => {
        play.held = true;
        this.stream(cx);
        this.advance(play, cx);
      });
      return;
    }
    if (play.waiting && route?.done) {
      this.plays.delete(play.id);
      return;
    }
    if (play.held && (!route || route.done)) {
      play.held = false;
      this.fly(play, "l", route && stateOf(route) === "failed" ? "err" : "ok", cx, () => {
        play.finished = true;
      });
    }
  }

  stream(cx) {
    if (this.isStreaming) return;
    this.isStreaming = true;
    const next = (cx) => {
      if (!this.shown || ![...this.plays.values()].some((p) => p.held)) {
        this.isStreaming = false;
        return;
      }
      this.round += 1;
      cx.notify();
      cx.timer.after(nextRoundMs(this.round), next);
    };
    cx.timer.after(ARM_FALLBACK_MS, next);
  }

  fly(play, dir, kind, cx, landed) {
    const leg = { key: `${play.id}-${++this.legs}`, dir, kind, phase: "start" };
    // A transition only animates from a drawn value: the stage arms the leg once the flier
    // is laid out at its start; the timer covers a flier that is never drawn.
    leg.arm = (cx) => {
      if (leg.phase !== "start") return;
      leg.phase = "fly";
      cx.notify();
      cx.timer.after(dir === "r" ? OUT_MS : BACK_MS, (cx) => {
        leg.phase = "away";
        landed(cx);
        cx.notify();
        cx.timer.after(AWAY_MS, (cx) => {
          play.legs = play.legs.filter((l) => l !== leg);
          if (play.finished && !play.legs.length) this.plays.delete(play.id);
          cx.notify();
        });
      });
    };
    play.legs.push(leg);
    cx.notify();
    cx.timer.after(ARM_FALLBACK_MS, (cx) => leg.arm(cx));
  }

  findIcon(key, cx) {
    if (!key || this.icons.has(key)) return;
    this.icons.set(key, null);
    cx.spawn(async (cx) => {
      const found = await readTextFile(`${appHome()}/icons/${key}.svg`).catch(() => null);
      if (!found) return;
      this.icons.set(key, `icons/${key}.svg`);
      cx.notify();
    });
  }

  agentName(key) {
    return this.programs.get(key)?.name ?? key ?? "unknown";
  }

  agentIcon(key, color, size = 13) {
    const program = this.programs.get(key);
    const path = program?.icon ?? this.icons.get(key) ?? "icons/agent.svg";
    if (program && !program.tint) return image(path).flex_none().size(size);
    return svg(path).flex_none().size(size).text_color(color);
  }

  hue(t, key) {
    const palette = [t.ansi6, t.ansi5, t.ansi4, t.ansi3, t.ansi2];
    return palette[hash(key ?? "") % palette.length];
  }

  seatLabel(seat) {
    if (!seat.who) return seat.name;
    return `${seat.name} · ${this.masked ? MASK : seat.who}`;
  }

  header(t, live) {
    return h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(svg(`${ICONS}/routing.svg`).flex_none().size(14).text_color(t.muted))
      .child(div().flex_none().font_semibold().child("Magpie"))
      .when(live > 0, (el) => el
        .child(div().flex_none().size(6).rounded(3).bg(t.working).loop("opacity", { from: 1, to: 0.4, period: 1600 }))
        .child(div().flex_none().text_size(12).text_color(t.working).child(`${live} live`)))
      .when(live === 0 && this.up !== false, (el) => el.child(div().flex_none().text_size(12).text_color(t.dim).child(this.up ? "idle" : "connecting…")))
      .when(this.up === false, (el) => el.child(div().flex_none().text_size(12).text_color(t.blocked).child("gateway down")));
  }

  stageView(t, list) {
    const live = list.filter((r) => !r.done);
    const pool = [...live, ...list.filter((r) => r.done)];
    const agentKeys = distinct(pool, (r) => r.agent, STAGED_AGENTS);
    const agents = [...agentKeys.keys()].sort().map((key) => ({ key, name: this.agentName(key) }));
    const keys = roster(list, this.groups, this.models);
    const out = exhausted(list, keys);
    const seats = keys.map((key) => ({
      key,
      label: this.models.get(key)?.name ?? key.slice(key.indexOf("/") + 1),
      out: out.has(key),
    }));
    const wires = new Map();
    for (const r of list) {
      const seat = seatKey(r);
      if (!seat || !agentKeys.has(r.agent)) continue;
      const key = `${r.agent}|${seat}`;
      const live = !r.done || wires.get(key)?.live;
      wires.set(key, { agent: r.agent, seat, live });
    }
    const g = geometry(this.width, agents, seats);
    const busySeats = new Set(live.map(seatKey).filter(Boolean));
    return div().id("magpie-stage").relative().w_full().h(g.height).rounded(10).border_1().border_color(t.border).bg(t.surface)
      .on_size_change((size, cx) => {
        const width = size.width / (Number(settings().zoom) || 1);
        if (Math.abs(width - this.width) < 1) return;
        this.width = width;
        cx.notify();
      })
      .when(!agents.length, (el) => el.child(empty(t, this.up === false ? `Nothing answers at ${this.place()}` : "No request yet")))
      .children(stage(t, g, {
        agents,
        seats,
        wires: [...wires.values()],
        plays: [...this.plays.values()],
        hue: (key) => this.hue(t, key),
        agentIcon: (key, color) => this.agentIcon(key, color),
        busySeats,
        round: this.round,
      }));
  }

  requestsHead(t) {
    return h_flex().h(30).flex_none().px(14).gap(8).items_center()
      .child(div().flex_1().text_size(10.5).font_medium().text_color(t.dim).child("REQUESTS"))
      .child(h_flex().id("magpie-mask").flex_none().h(22).px(6).gap(5).items_center().rounded(5).cursor_pointer()
        .text_size(11.5).text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(this.masked ? "Show account names" : "Hide account names")
        .on_click((_e, cx) => {
          this.masked = !this.masked;
          localStorage.setItem("masked", this.masked ? "1" : "0");
          cx.notify();
        })
        .child(svg(`${ICONS}/${this.masked ? "masked" : "unmasked"}.svg`).size(13))
        .child(this.masked ? "Masked" : "Shown"));
  }

  label(t, text, n) {
    return h_flex().h(24).px(14).pt(4).gap(6).items_center().text_size(10.5).font_medium().text_color(t.dim)
      .child(text).child(div().text_color(t.muted).child(String(n)));
  }

  stats(r, state) {
    const n = r.tries?.length ?? 0;
    const retried = n > 1 && tries(n);
    if (state === "live") return [retried, `${Math.floor((Date.now() - startedAt(r)) / 1000)}s…`].filter(Boolean).join(" · ");
    if (state === "failed") return [retried, r.status, duration(r.ms)].filter(Boolean).join(" · ");
    const rate = tokensPerSecond(r);
    return [retried, tokens(r.tokens), duration(r.ms), rate && `${rate} tok/s`].filter(Boolean).join(" · ");
  }

  details(t, r) {
    const lines = (r.tries ?? []).map((attempt, i) => {
      const seat = seatOf(r, attempt);
      const outcome = attempt.done ? `${attempt.status ?? ""}${attempt.fail ? ` ${attempt.fail}` : ""}` : "answering";
      return `${i + 1}. ${this.seatLabel(seat)} · ${attempt.model} · ${outcome} · ${duration(attempt.ms)}`;
    });
    const about = [r.group ? `${r.group.name} · ${r.group.routing || "order"}` : null, r.effort && `effort ${r.effort}`, r.folder && `~/${r.folder}`].filter(Boolean).join("  ·  ");
    return v_flex().pl(20).pt(2).gap(2).text_size(11).text_color(t.muted)
      .when(Boolean(about), (el) => el.child(div().truncate().child(about)))
      .children(lines.map((line, i) => div().id(`try-${r.id}-${i}`).truncate().child(line)));
  }

  row(t, r) {
    const state = stateOf(r);
    const color = state === "live" ? t.working : state === "ok" ? t.done : t.blocked;
    const attempt = lastTry(r);
    const seat = attempt ? seatOf(r, attempt) : null;
    const model = servedModel(r);
    const open = this.expanded.has(r.id);
    return v_flex().id(`req-${r.id}`).mx(6).px(8).py(6).gap(3).rounded(7).cursor_pointer()
      .when(open, (el) => el.bg(t.hover))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        if (open) this.expanded.delete(r.id);
        else this.expanded.add(r.id);
        cx.notify();
      })
      .child(h_flex().gap(7).items_center().min_w(0)
        .child(this.agentIcon(r.agent, t.muted))
        .child(div().flex_none().font_medium().child(this.agentName(r.agent)))
        .child(div().min_w(0).truncate().px(6).h(18).flex().items_center().rounded(5).border_1().border_color(t.border).bg(t.surface)
          .text_size(11).text_color(t.muted).child(r.model ?? ""))
        .child(div().flex_1())
        .when(state === "live", (el) => el.child(div().flex_none().size(6).rounded(3).bg(t.working)))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(clock(startedAt(r)))))
      .child(h_flex().pl(20).gap(5).items_center().min_w(0).text_size(12)
        .child(div().flex_none().text_color(t.dim).child("→"))
        .child(div().flex_none().size(6).rounded(3).bg(color))
        .child(div().flex_none().text_color(color).child(seat ? seat.name : "routing…"))
        .when(Boolean(seat?.who), (el) => el.child(div().min_w(0).truncate().text_color(t.dim).child(this.masked ? MASK : seat.who)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(model ? `· ${model}` : ""))
        .child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(this.stats(r, state))))
      .when(state === "failed" && Boolean(r.error), (el) => el.child(div().pl(20).text_size(11).text_color(t.blocked).truncate().child(String(r.error))))
      .when(open, (el) => el.child(this.details(t, r)));
  }

  footer(t) {
    const totals = this.totals ?? {};
    const facts = [this.place(), this.pid && `pid ${this.pid}`, this.totals && `${count(totals.requests)} calls`, this.totals && `${count(totals.rerouted)} retried`];
    const state = this.up === null ? t.dim : this.up ? t.done : t.blocked;
    return h_flex().h(30).flex_none().px(12).gap(7).items_center().border_t(1).border_color(t.border).text_size(11).text_color(t.dim)
      .child(div().flex_none().size(6).rounded(3).bg(state))
      .child(div().flex_1().min_w(0).truncate().child(this.up === false ? `${this.place()} · ${this.failure}` : facts.filter(Boolean).join(" · ")))
      .child(div().id("magpie-refresh").flex_none().p(4).rounded(5).cursor_pointer().text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("Reload the trace")
        .on_click((_e, cx) => this.reload(cx))
        .child(svg(`${ICONS}/refresh.svg`).size(12)));
  }

  render() {
    const t = theme();
    const list = [...this.routes.values()].sort(latestFirst);
    const live = list.filter((r) => !r.done);
    const recent = list.filter((r) => r.done);
    return v_flex().id("magpie").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(this.header(t, live.length))
      .child(div().flex_none().p(10).child(this.stageView(t, list)))
      .child(this.requestsHead(t))
      .child(v_flex().id("magpie-requests").flex_1().min_h(0).overflow_y_scrollbar().pb(8)
        .when(live.length > 0, (el) => el.child(this.label(t, "IN FLIGHT", live.length)).children(live.map((r) => this.row(t, r))))
        .child(this.label(t, "RECENT", recent.length))
        .children(recent.map((r) => this.row(t, r)))
        .when(!list.length, (el) => el.child(div().px(14).py(6).text_size(12).text_color(t.dim)
          .child(this.up === false ? "The trace is unavailable while the gateway is down." : "Requests through Magpie show up here as they happen."))))
      .child(this.footer(t));
  }
}
