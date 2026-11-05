// Who is where. Arrivals wait outside the entrance and come in one at a time, walk to their spot,
// sit (or just stand there), move when their spot changes, and walk out when the session closes.
// Plain logic with no 3D in it; the current theme supplies the layout:
//   theme.door()          -> { in: {x,y}, out: {x,y}, yaw }   where people appear and disappear
//   theme.assign(e, ents) -> gives a newcomer whatever the theme tracks (desk, battle slot...)
//   theme.layout(ents)    -> true when the layout changed size (the world gets rebuilt)
//   theme.home(e)         -> { x, y, yaw, seat, fwd, key }   seat: seat height (0 = stands); key changes = new spot
//   theme.pathHome(e)     -> waypoints from where e is to e.home
//   theme.pathOut(e)      -> waypoints from where e is to door().out
export const entities = new Map();
let ticket = 0, theme = null, hooks = { add() {}, layout() {} };

export function setCrowdTheme(t, h) { theme = t; hooks = h; }

const atHome = e => e.phase === "seated" || e.phase === "sitting" || e.phase === "standing";
export const isWalking = e => e.phase === "entering" || e.phase === "leaving";
const leavingSoon = e => e.phase === "leaving" || (e.phase === "standing" && e.next === "leave");

function goHome(e) {
  e.phase = "entering"; e.walkT = 0; e.path = theme.pathHome(e);
  if (Math.hypot(e.x - e.home.x, e.y - e.home.y) < 0.05) { e.path = []; e.x = e.home.x; e.y = e.home.y; }
}
function startLeaving(e) { e.phase = "leaving"; e.walkT = 0; e.path = theme.pathOut(e); }

export function syncEntities(sessions) {
  const seen = new Set();
  for (const s of sessions) {
    seen.add(s.id);
    let e = entities.get(s.id);
    if (!e) {
      const d = theme.door();
      e = { id: s.id, phase: "entering", path: null, x: d.in.x, y: d.in.y, sit: 0, walkT: 0, stride: 0,
            yaw: d.yaw, targetYaw: d.yaw, outside: true, ticket: ticket++, waitT: 0, waiting: false, ghostT: 0,
            home: null, next: null, data: s, t: {} };   // t: whatever the theme keeps per person
      theme.assign(e, entities);
      entities.set(s.id, e);
      hooks.add(e);
    } else if (e.phase === "standing" && e.next === "leave") {
      e.next = "stay";                                     // changed its mind on the way out
    } else if (e.phase === "leaving") {
      e.phase = "entering"; e.walkT = 0; e.path = null;    // came back while walking out
    }
    e.data = s;
  }
  for (const e of entities.values()) {
    if (seen.has(e.id) || leavingSoon(e)) continue;
    if (atHome(e)) { e.phase = "standing"; e.next = "leave"; }
    else startLeaving(e);
  }
  const resized = theme.layout(entities);
  for (const e of entities.values()) {
    if (e.phase === "leaving") { if (resized) e.path = theme.pathOut(e); continue; }
    if (leavingSoon(e)) continue;
    const h = theme.home(e), moved = !e.home || h.key !== e.home.key;
    e.home = h;
    if (atHome(e)) {
      if (moved) {
        if (e.sit > 0 || e.phase === "standing") { e.phase = "standing"; e.next = "move"; }
        else goHome(e);
      } else {
        if (e.phase === "standing" && e.next === "stay") e.phase = "sitting";   // staying after all
        if (resized) { e.x = h.x; e.y = h.y; }
      }
    } else if (moved || resized || !e.path) e.path = theme.pathHome(e);
  }
  if (resized) hooks.layout();
}

// Put everyone straight at their spot (used when the theme changes). People on their way out are dropped.
export function settleAll() {
  for (const e of [...entities.values()]) {
    if (leavingSoon(e)) { entities.delete(e.id); continue; }
    e.t = {};
  }
  for (const e of entities.values()) theme.assign(e, entities);
  theme.layout(entities);
  for (const e of entities.values()) {
    e.home = theme.home(e);
    Object.assign(e, { x: e.home.x, y: e.home.y, phase: "seated", outside: false, path: [], waiting: false,
                       sit: e.home.seat ? 1 : 0, yaw: e.home.yaw, targetYaw: e.home.yaw });
  }
}

function heading(e) {   // unit direction toward the next waypoint
  const n = e.path && e.path[0];
  if (!n) return null;
  const dx = n.x - e.x, dy = n.y - e.y, d = Math.hypot(dx, dy);
  return d < 1e-6 ? null : [dx / d, dy / d];
}
function blockerOf(e) {   // someone just ahead of e, in its way
  const h = heading(e);
  if (!h) return null;
  for (const o of entities.values()) {
    if (o === e || o.outside || !isWalking(o)) continue;
    const rx = o.x - e.x, ry = o.y - e.y, along = rx * h[0] + ry * h[1], side = Math.abs(rx * h[1] - ry * h[0]);
    if (along > 0.02 && along < 0.6 && side < 0.24) return o;
  }
  return null;
}
// When two people are in each other's way (paths crossing), one goes first:
// whoever is leaving, then whoever arrived earlier.
const priority = e => (e.phase === "leaving" ? 1e9 : 0) - e.ticket;
function mustWait(e) {
  // Follow who-waits-for-whom. If it loops back to e, the people in the loop would wait forever,
  // so the one with the highest priority in it goes first.
  const chain = [e];
  for (let b = blockerOf(e); b; b = blockerOf(b)) {
    if (b === e) return chain.some(o => priority(o) > priority(e));
    if (chain.includes(b) || chain.length > 12) return true;   // a jam further ahead; it resolves itself
    chain.push(b);
  }
  return chain.length > 1;
}

const SPEED = 1.9;      // tiles per second at full stride
const SIT_SPEED = 2.2;  // sit-down / stand-up transitions per second
export function stepEntities(dt, reduceMotion, onGone) {
  for (const e of [...entities.values()]) {
    const seatT = e.home && e.home.seat ? 1 : 0;
    if (e.phase === "seated") { e.sit = seatT; e.targetYaw = e.home.yaw; continue; }
    if (e.phase === "sitting") {
      e.sit = reduceMotion ? seatT : Math.min(seatT, e.sit + dt * SIT_SPEED);
      e.targetYaw = e.home.yaw;
      if (e.sit >= seatT) e.phase = "seated";
      continue;
    }
    if (e.phase === "standing") {
      e.sit = reduceMotion ? 0 : Math.max(0, e.sit - dt * SIT_SPEED);
      if (e.sit <= 0) e.next === "leave" ? startLeaving(e) : goHome(e);
      continue;
    }
    // waiting outside: come in one at a time, once the entrance is clear
    if (e.outside) {
      const din = theme.door().in;
      const first = ![...entities.values()].some(o => o.outside && o.ticket < e.ticket);
      const clear = ![...entities.values()].some(o => o !== e && !o.outside && isWalking(o) && Math.hypot(o.x - din.x, o.y - din.y) < 0.6);
      if (!(first && clear)) continue;
      e.outside = false; e.walkT = 0;
    }
    // queue: wait behind anyone just ahead. If that ever lasts 4 seconds, walk on regardless
    // for a moment (brushing past) so nobody can get stuck.
    if (e.ghostT > 0) e.ghostT -= dt;
    e.waiting = e.ghostT <= 0 && mustWait(e);
    if (e.waiting) {
      e.waitT += dt; e.walkT = 0;
      if (e.waitT < 4) continue;
      e.waiting = false; e.ghostT = 1.5;
    }
    e.waitT = 0;
    // walking: ease in at the start of a trip and ease out on arrival
    e.walkT += dt;
    let remain = 0, px = e.x, py = e.y;
    for (const p of e.path || []) { remain += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y; }
    const ease = Math.min(1, 0.3 + e.walkT * 1.6) * Math.min(1, 0.3 + remain * 1.4);
    let left = SPEED * ease * dt;
    const ox = e.x, oy = e.y;
    while (left > 0 && e.path && e.path.length) {
      const t = e.path[0], dx = t.x - e.x, dy = t.y - e.y, dist = Math.hypot(dx, dy);
      if (dist <= left) { e.x = t.x; e.y = t.y; e.path.shift(); left -= dist; }
      else { e.x += dx / dist * left; e.y += dy / dist * left; left = 0; }
    }
    const mx = e.x - ox, my = e.y - oy, len = Math.hypot(mx, my);
    if (len > 1e-6) { e.stride += len * 9; e.targetYaw = Math.atan2(mx, my); }
    if (e.path && !e.path.length) {
      if (e.phase === "entering") { e.phase = "sitting"; e.sit = 0; }
      else if (e.phase === "leaving") { entities.delete(e.id); onGone(e); }
    }
  }
}
