// Fantasy: the sessions are an adventuring party (warrior, mage, archer, priest) fighting a big red dragon
// on a floating island. Working = fighting, needs you = turns to you and waves, your turn = rests at the campfire.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/RoundedBoxGeometry.js";
import { baseLook, hash, pick, shade, mix, vinyl, metal, part, sphere, rounded, headShell, onHead, HR } from "../figure.js";
import { paintSky, hourNow, nightness } from "../sky.js";

const ZS = 0.8;
const A0 = Math.PI / 4;                  // the party stands in front of the dragon, toward the viewer
const RING = k => 2.9 + 0.95 * k;        // battle rings around the dragon: warriors in front, ranged behind
const STEP = 0.36;                      // angle between neighbours on a ring
const CAP = k => (k % 2 ? 6 : 5);        // how many fit on each ring
const SEAT_Z = 0.275;                    // log seat height
const FIRE = { x: 3.85 * Math.cos(A0 + 1.45), y: 3.85 * Math.sin(A0 + 1.45) };
const A_PORTAL = A0 - 1.3, A_CAMP = A0 + 1.12;
const DS = 1.25;                         // dragon scale

export const CLASSES = ["warrior", "mage", "archer", "priest"];
const classOf = id => pick(CLASSES, hash(id + "#class"));
const TABARDS = ["#c8423a", "#3a6fd8", "#2f9a5f", "#d89a2a", "#7a52c8"];
const ROBES = ["#5b3fb5", "#2b56b8", "#8a2f7a", "#1f7480", "#b33a3a"];
const ORBS = ["#5fe3ff", "#ff9a3a", "#d08cff"];
const CLOAKS = ["#3f7d3a", "#6b8f2e", "#7a5a32", "#2f6d5f"];
const TUNICS = ["#d8c7a0", "#b9cc9a", "#e0d2b0"];
const SASHES = ["#4f8fe8", "#e07bb0", "#45b07a", "#e3b341"];
const GOLD = "#e7b94a", SILVER = "#cfd5de", WOOD = "#8a5a36", LEATHER = "#5a4636", BOOTS = "#6b4a32";

const polar = (r, a) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
const angOf = p => Math.atan2(p.y, p.x), radOf = p => Math.hypot(p.x, p.y);
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.y - from.y);
const frac = v => v - Math.floor(v);
const smooth = (a, b, v) => { const x = Math.min(1, Math.max(0, (v - a) / (b - a))); return x * x * (3 - 2 * x); };
const lerp = (a, b, f) => a + (b - a) * f;

export function createFantasyTheme(ctx) {
  const { scene, sun, hemi, amb, reduceMotion, labelsEl, toScreen } = ctx;
  hemi.color.set(0xfff0e6); hemi.groundColor.set(0x9a6a5a); hemi.intensity = 1.55;
  amb.intensity = 0.22; sun.color.set(0xffe6cc); sun.intensity = 2.2;

  let group = null, rMax = RING(1), seatRings = 1, layoutKey = "", isle = { x: 0, y: 0, r: 6 };
  const owned = [];
  const own = x => { owned.push(x); return x; };
  const fx = [];                 // live effects (fireballs, arrows, sparkles, breath)
  let dragon = null, fireLight = null, flames = [], portalDisc = null, lavaMat = null;

  // ---------- sky backdrop ----------
  const skyCv = document.createElement("canvas"); skyCv.width = skyCv.height = 512;
  const skyCtx = skyCv.getContext("2d"), skyTex = new THREE.CanvasTexture(skyCv); skyTex.colorSpace = THREE.SRGBColorSpace;
  function paintBackdrop(t) {
    paintSky(skyCtx, hourNow(), t, reduceMotion, { stars: 40, clouds: 3, bodies: 0.45 });
    const c = skyCtx, R = 256, g = c.createRadialGradient(R, R, R * 0.8, R, R, R);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.globalCompositeOperation = "destination-in"; c.fillStyle = g; c.fillRect(0, 0, 512, 512);
    c.globalCompositeOperation = "source-over";
    skyTex.needsUpdate = true;
  }

  // ---------- layout: battle spots, campfire seats, lanes ----------
  function spotOf(e) {
    let k, i;
    const j = e.t.slot, melee = e.t.cls === "warrior", base = melee ? 0 : 1;
    if (j < CAP(base)) { k = base; i = j; }
    else {
      let o = 2 * (j - CAP(base)) + (melee ? 0 : 1);
      k = 2; while (o >= CAP(k)) { o -= CAP(k); k++; }
      i = o;
    }
    // centre first, then alternate sides; odd rings sit in the gaps of the ring in front
    const n = k % 2 ? (i % 2 ? -1 : 1) * (Math.floor(i / 2) + 0.5) : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
    return { ring: k, a: A0 + n * STEP, r: RING(k) };
  }
  const walkR = () => (seatRings > 1 ? 1.78 : 1.28);
  function seatPos(i) {
    const inner = i < 6, n = inner ? 6 : 9, j = inner ? i : i - 6, r = inner ? 0.8 : 1.32;
    // fill the far side of the fire first, so resting people face you
    const order = [0, 1, -1, 2, -2, 3, -3, 4, -4][j] ?? j;
    const a = A0 + Math.PI + order * (Math.PI * 2 / n) + (inner ? 0 : Math.PI / n);
    return { x: FIRE.x + r * Math.cos(a), y: FIRE.y + r * Math.sin(a), a };
  }
  const rIn = () => rMax + 0.6, rOut = () => rMax + 1.0, rPortal = () => rMax + 1.35;
  function door() {
    const r = rPortal(), d = 0.2 / r;
    return { in: polar(r, A_PORTAL + d), out: polar(r, A_PORTAL - d), yaw: yawTo(polar(r, A_PORTAL), { x: 0, y: 0 }), r };
  }
  function arc(r, a0, a1) {   // waypoints along a circle around the dragon
    const out = [], n = Math.max(1, Math.ceil(Math.abs(a1 - a0) * r / 0.35));
    for (let i = 1; i <= n; i++) out.push(polar(r, a0 + (a1 - a0) * i / n));
    return out;
  }
  function fireArc(R, b0, b1) {   // waypoints around the campfire, the short way
    let d = Math.atan2(Math.sin(b1 - b0), Math.cos(b1 - b0));
    const out = [], n = Math.max(1, Math.ceil(Math.abs(d) * R / 0.35));
    for (let i = 1; i <= n; i++) { const b = b0 + d * i / n; out.push({ x: FIRE.x + R * Math.cos(b), y: FIRE.y + R * Math.sin(b) }); }
    return out;
  }
  const fireAng = p => Math.atan2(p.y - FIRE.y, p.x - FIRE.x);
  const atFire = p => Math.hypot(p.x - FIRE.x, p.y - FIRE.y) < walkR() + 0.15;
  const campPoint = r => polar(r, A_CAMP);
  // From wherever e is to the lane ring of radius r (around the fire first if resting there).
  function toLane(e, r) {
    const p = { x: e.x, y: e.y };
    if (atFire(p)) {
      const R = walkR(), Q = campPoint(r), b = fireAng(p);
      return { path: [{ x: FIRE.x + R * Math.cos(b), y: FIRE.y + R * Math.sin(b) }, ...fireArc(R, b, fireAng(Q)), Q], a: A_CAMP };
    }
    const a = angOf(p);
    return { path: [polar(r, a)], a };
  }

  function assign(e, ents) {
    if (e.t.slot != null) return;
    e.t.cls = classOf(e.id);
    const melee = e.t.cls === "warrior";
    const used = new Set([...ents.values()].filter(o => o.t.slot != null && (o.t.cls === "warrior") === melee).map(o => o.t.slot));
    let i = 0; while (used.has(i)) i++;
    e.t.slot = i;
  }
  function layout(ents) {
    // seats: held while resting (and while standing up to leave)
    const taken = new Set();
    for (const e of ents.values()) {
      const keep = e.phase !== "leaving" && (e.data.state === "your_turn" || (e.phase === "standing" && e.next === "leave"));
      if (!keep) e.t.seat = null;
      else if (e.t.seat != null) taken.add(e.t.seat);
    }
    for (const e of ents.values()) {
      if (e.t.seat != null || e.phase === "leaving" || e.data.state !== "your_turn") continue;
      let i = 0; while (taken.has(i)) i++;
      e.t.seat = i; taken.add(i);
    }
    let maxRing = 1;
    for (const e of ents.values()) if (e.t.slot != null) maxRing = Math.max(maxRing, spotOf(e).ring);
    rMax = RING(maxRing);
    seatRings = Math.max(0, ...taken) >= 6 ? 2 : 1;
    const key = rMax + "|" + seatRings, changed = key !== layoutKey;
    layoutKey = key;
    return changed;
  }
  function home(e) {
    if (e.t.seat != null && e.data.state === "your_turn") {
      const s = seatPos(e.t.seat);
      return { x: s.x, y: s.y, yaw: yawTo(s, FIRE), seat: SEAT_Z, fwd: 0, key: "f" + e.t.seat };
    }
    const s = spotOf(e), p = polar(s.r, s.a);
    const yaw = e.data.state === "needs_you" ? A0 : yawTo(p, { x: 0, y: 0 });
    return { x: p.x, y: p.y, yaw, seat: 0, fwd: 0, key: "b" + e.t.slot };
  }
  function pathHome(e) {
    const h = e.home, R = rIn();
    if (h.key[0] === "f") {   // to a campfire seat
      const b = Math.atan2(h.y - FIRE.y, h.x - FIRE.x), W = walkR();
      if (atFire(e)) { const b0 = fireAng(e); return [{ x: FIRE.x + W * Math.cos(b0), y: FIRE.y + W * Math.sin(b0) }, ...fireArc(W, b0, b), { x: h.x, y: h.y }]; }
      const a = angOf(e), Q = campPoint(R), bq = fireAng(Q);
      return [polar(R, a), ...arc(R, a, A_CAMP), { x: FIRE.x + W * Math.cos(bq), y: FIRE.y + W * Math.sin(bq) }, ...fireArc(W, bq, b), { x: h.x, y: h.y }];
    }
    const s = toLane(e, R), a1 = angOf(h);
    return [...s.path, ...arc(R, s.a, a1), { x: h.x, y: h.y }];
  }
  function pathOut(e) {
    const d = door(), s = toLane(e, rOut()), aOut = angOf(d.out);
    if (Math.hypot(e.x - d.out.x, e.y - d.out.y) < 0.6 || (!atFire(e) && radOf(e) > rOut() + 0.1)) return [{ ...d.out }];
    return [...s.path, ...arc(rOut(), s.a, aOut), { ...d.out }];
  }

  // ---------- people ----------
  function look(id) {
    const L = baseLook(id), h = L.h, cls = classOf(id);
    const common = { cls, legs: LEATHER, shoes: BOOTS, hat: true, seed: L.seed };
    if (cls === "warrior") {
      const tab = pick(TABARDS, h(11));
      return { ...L, ...common, tab, top: SILVER, sleeve: "#9aa3b0", bottom: L.woman ? tab : LEATHER };
    }
    if (cls === "mage") {
      const robe = pick(ROBES, h(11));
      return { ...L, ...common, robe: true, top: robe, bottom: robe, orb: pick(ORBS, h(12)) };
    }
    if (cls === "archer") {
      const tunic = pick(TUNICS, h(13));
      return { ...L, ...common, cloak: pick(CLOAKS, h(11)), top: tunic, bottom: L.woman ? "#7a5a3a" : LEATHER };
    }
    return { ...L, ...common, hat: false, robe: true, top: "#f6f3ea", bottom: "#f6f3ea", sash: pick(SASHES, h(11)), shoes: "#c9a26a" };
  }

  function dress(F, L) {
    const R = F.arms[0], Lf = F.arms[1];     // right and left arm
    const gold = metal(GOLD);
    let labelY = 0.03;
    const belt = (col) => { const b = part(new THREE.TorusGeometry(0.112, 0.014, 8, 28), vinyl(col), F.hips, 0, 0.035, 0); b.rotation.x = Math.PI / 2; b.scale.set(L.woman ? 1 : 1.1, 0.9, 1); };
    if (L.cls === "warrior") {
      const steel = metal(SILVER), tab = vinyl(L.tab);
      part(rounded(0.13, 0.17, 0.03, 0.012), tab, F.hips, 0, 0.11, 0.092);                 // tabard
      part(new THREE.CircleGeometry(0.025, 16), gold, F.hips, 0, 0.14, 0.108);              // emblem
      belt(LEATHER);
      for (const A of F.arms) part(sphere(0.058, 18, 12), steel, A.sh, A.s * 0.008, 0.012, 0).scale.set(1.15, 0.75, 1.15);
      const helm = part(new THREE.SphereGeometry(HR * 1.13, 32, 16, 0, Math.PI * 2, 0, 1.3), steel, F.skull);
      helm.rotation.x = -0.12;
      const band = part(new THREE.TorusGeometry(HR * 1.08, 0.012, 8, 36), gold, F.skull, 0, HR * 0.3, -0.02); band.rotation.x = Math.PI / 2 - 0.12;
      const plume = part(sphere(0.05, 16, 12), tab, F.skull, 0, HR * 1.18, -0.04); plume.scale.set(0.45, 0.9, 1.9);
      // sword in the right hand, shield on the left arm
      const sw = new THREE.Group(); sw.position.set(0, -0.1, 0); sw.rotation.x = 2.356; R.el.add(sw);
      part(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), vinyl(LEATHER), sw);
      part(sphere(0.018, 10, 8), gold, sw, 0, -0.045, 0);
      part(rounded(0.11, 0.018, 0.026, 0.006), gold, sw, 0, 0.04, 0);
      part(new THREE.BoxGeometry(0.01, 0.26, 0.036), steel, sw, 0, 0.18, 0);
      part(new THREE.ConeGeometry(0.0255, 0.05, 4), steel, sw, 0, 0.335, 0).scale.set(0.4, 1, 1);
      const sh = new THREE.Group(); sh.position.set(0.05, -0.06, 0.01); sh.rotation.z = Math.PI / 2; Lf.el.add(sh);
      part(new THREE.CylinderGeometry(0.12, 0.12, 0.022, 28), tab, sh);
      part(new THREE.TorusGeometry(0.12, 0.012, 8, 32), steel, sh).rotation.x = Math.PI / 2;
      part(sphere(0.032, 14, 10), steel, sh, 0, -0.014, 0).scale.y = 0.6;
      labelY = 0.08;
    } else if (L.cls === "mage") {
      const dark = vinyl(shade(L.top, 0.72));
      belt(GOLD);
      part(new THREE.CylinderGeometry(0.29, 0.29, 0.016, 36), dark, F.skull, 0, HR * 0.55, -0.01);                 // brim
      part(new THREE.CylinderGeometry(0.078, 0.17, 0.2, 28), dark, F.skull, 0, HR * 0.55 + 0.1, -0.01);           // crown
      part(new THREE.TorusGeometry(0.165, 0.014, 8, 32), gold, F.skull, 0, HR * 0.55 + 0.02, -0.01).rotation.x = Math.PI / 2;
      const tip = part(new THREE.ConeGeometry(0.08, 0.2, 24), dark, F.skull, 0, HR * 0.55 + 0.27, -0.05); tip.rotation.x = -0.55;
      part(sphere(0.022, 10, 8), gold, F.skull, 0, HR * 0.55 + 0.34, -0.12);
      const st = staff(R, L.orb, true); F.orb = st.top;
      labelY = 0.38;
    } else if (L.cls === "archer") {
      const cloak = vinyl(L.cloak, true);
      belt(LEATHER);
      headShell(F.skull, cloak, HR * 1.14, 1.75, 2.15);                                                       // hood
      const tipH = onHead(HR * 1.1, Math.PI, 0.9);
      const hoodTip = part(new THREE.ConeGeometry(0.06, 0.14, 16), cloak, F.skull, tipH.x, tipH.y, tipH.z); hoodTip.rotation.x = -1.9;
      const cape = part(new THREE.CylinderGeometry(0.12, 0.19, 0.3, 24, 1, true, Math.PI / 2 + 0.25, Math.PI - 0.5), cloak, F.hips, 0, 0.1, -0.012);
      cape.scale.z = 0.95;
      const q = new THREE.Group(); q.position.set(0.06, 0.18, -0.12); q.rotation.set(-0.15, 0, -0.45); F.hips.add(q);   // quiver
      part(new THREE.CylinderGeometry(0.035, 0.03, 0.17, 14), vinyl(WOOD), q);
      for (const [dx, col] of [[-0.016, "#f2efe6"], [0.0, "#e8655a"], [0.016, "#f2efe6"]]) part(new THREE.BoxGeometry(0.012, 0.05, 0.022), vinyl(col), q, dx, 0.1, 0);
      // bow in the left hand: its long axis runs along the forearm's z, tips curving back toward the archer
      const pts = []; for (let i = 0; i <= 8; i++) { const z = -0.26 + i * 0.065; pts.push(new THREE.Vector3(0, 0.09 * (z / 0.26) ** 2, z)); }
      const bow = new THREE.Group(); bow.position.set(0, -0.1, 0); Lf.el.add(bow);
      part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.013, 6), vinyl(WOOD), bow);
      const str = part(new THREE.CylinderGeometry(0.0025, 0.0025, 0.52, 4), vinyl("#f4f0e4"), bow, 0, 0.09, 0); str.rotation.x = Math.PI / 2;
      part(new THREE.CylinderGeometry(0.017, 0.017, 0.05, 10), vinyl(LEATHER), bow).rotation.x = Math.PI / 2;
      labelY = 0.07;
    } else {   // priest
      const g = vinyl(GOLD);
      belt(GOLD);
      part(rounded(0.05, 0.3, 0.02, 0.008), vinyl(L.sash), F.hips, 0, 0.06, 0.1);                              // stole
      part(new THREE.TorusGeometry(0.075, 0.014, 8, 24), g, F.hips, 0, 0.262, 0).rotation.x = Math.PI / 2;  // collar
      const circ = part(new THREE.TorusGeometry(HR * 1.1, 0.011, 8, 40), gold, F.skull, 0, HR * 0.42, 0); circ.rotation.x = Math.PI / 2 - 0.15;
      const gp = onHead(HR * 1.12, 0, 0.5); part(sphere(0.022, 12, 10), vinyl(L.sash, false, L.sash), F.skull, gp.x, gp.y, gp.z);
      const st = staff(R, "#fff4c0", false); F.orb = st.top;
      labelY = 0.05;
    }
    return { labelY };

    function staff(arm, glow, mage) {
      const g = new THREE.Group(); g.position.set(0, -0.1, 0); g.rotation.x = 0.6435; arm.el.add(g);
      part(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 8), mage ? vinyl(WOOD) : metal(GOLD), g, 0, 0.15, 0);
      const topY = 0.58;
      if (mage) { const ring = part(new THREE.TorusGeometry(0.045, 0.01, 6, 16), vinyl(WOOD), g, 0, topY - 0.02, 0); ring.rotation.x = Math.PI / 2; }
      else { part(new THREE.TorusGeometry(0.06, 0.011, 8, 24), metal(GOLD), g, 0, topY + 0.02, 0); }
      const top = part(sphere(mage ? 0.045 : 0.03, 16, 12), vinyl(glow, false, glow), g, 0, topY + (mage ? 0.02 : 0.02), 0);
      return { top };
    }
  }

  // pose for someone at their spot. p: { hx, hy, hz, lean, arm: { -1: right, 1: left } } with
  // ux (raise arm forward, negative), uz (out to the side), fx (bend elbow), fz.
  function pose(e, p, { st, t, tt, m }) {
    const R = p.arm[-1], Lh = p.arm[1], c = e.t.cls, seed = e.look.seed;
    if (st === "your_turn") {   // warming hands at the fire
      Object.assign(R, { ux: -0.85, uz: -0.18, fx: -0.55, fz: 0 }); Object.assign(Lh, { ux: -0.85, uz: 0.18, fx: -0.55, fz: 0 });
      p.hx = 0.12;
      return;
    }
    if (st === "needs_you") {
      Object.assign(R, { ux: 0, uz: -2.55, fx: 0, fz: -(0.3 + 0.45 * Math.sin(tt * 9) * m) });
      if (c === "archer") Object.assign(Lh, { ux: -0.3, uz: 0.15, fx: -0.2 });
      return;
    }
    if (st !== "working") return;
    const f = e.t.flinch || 0;
    if (c === "warrior") {
      const ph = frac((t + seed * 7) / 1.4);
      const ux = ph < 0.55 ? lerp(-0.4, -2.7, smooth(0, 0.55, ph)) : ph < 0.7 ? lerp(-2.7, -0.7, smooth(0.55, 0.7, ph)) : lerp(-0.7, -0.4, smooth(0.7, 1, ph));
      Object.assign(R, { ux: ux * m || -0.6, uz: -0.15, fx: -0.35, fz: 0 });
      Object.assign(Lh, { ux: -1.0, uz: 0.35, fx: -1.0, fz: 0.3 });
      p.lean = ph > 0.55 && ph < 0.8 ? 0.12 * m : 0;
    } else if (c === "mage") {
      const ph = frac((t + seed * 7) / 2.6), cast = smooth(0, 0.55, ph) * (1 - smooth(0.7, 1, ph));
      Object.assign(R, { ux: -0.65 - 0.4 * cast * m, uz: -0.12, fx: -0.1, fz: 0 });
      Object.assign(Lh, { ux: -0.5 - 1.05 * cast * m, uz: 0.2, fx: -0.2 + 0.2 * cast, fz: 0 });
      p.hx = -0.05;
    } else if (c === "archer") {
      const ph = frac((t + seed * 7) / 2.0), draw = smooth(0.1, 0.65, ph) * (1 - smooth(0.72, 0.8, ph));
      Object.assign(Lh, { ux: -1.5, uz: 0.05, fx: 0, fz: 0 });
      Object.assign(R, { ux: -1.45, uz: -0.35 + 0.1 * draw, fx: -0.3 - 1.6 * draw * m, fz: 0 });
      p.hy = 0.15;
    } else {
      const ph = frac((t + seed * 7) / 3.0), up = smooth(0, 0.45, ph) * (1 - smooth(0.6, 1, ph));
      Object.assign(R, { ux: -0.65 - 1.9 * up * m, uz: -0.12, fx: -0.1 + 0.1 * up, fz: 0 });
      Object.assign(Lh, { ux: -0.4 - 0.8 * up * m, uz: 0.45 * up + 0.12, fx: -0.2, fz: 0 });
      p.hx = -0.1 * up;
    }
    if (f > 0) {   // fire breath swept past: lean back, arms up
      p.lean = -0.3 * f;
      Object.assign(Lh, { ux: lerp(Lh.ux, -1.9, f), uz: lerp(Lh.uz, 0.5, f), fx: lerp(Lh.fx, -1.2, f) });
      p.hx = -0.2 * f;
    }
  }

  // ---------- world ----------
  const matCache = new Map();
  function mat(color, rough = 0.85, flat = false) {
    const k = color + rough + flat;
    if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: flat }));
    return matCache.get(k);
  }
  function mesh(geo, m, x = 0, y = 0, z = 0, parent = group) {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  function rng(seed) { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5 >>> 0) % 100000) / 100000; }

  function islandTexture(r, seed) {
    const S = 1024, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d"), e = document.createElement("canvas"); e.width = e.height = S;
    const ge = e.getContext("2d"), rnd = rng(seed), px = v => (v / (2 * r) + 0.5) * S;
    g.fillStyle = "#a99487"; g.fillRect(0, 0, S, S);
    ge.fillStyle = "#000"; ge.fillRect(0, 0, S, S);
    // flagstones
    for (let i = 0; i < 260; i++) {
      const x = rnd() * S, y = rnd() * S, w = 30 + rnd() * 60, h = 24 + rnd() * 50;
      g.fillStyle = mix("#b7a397", "#958177", rnd()); g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(x, y, w / 2, h / 2, rnd() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    // glowing lava cracks
    const cracks = [];
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = r * (0.25 + rnd() * 0.6);
      let x = d * Math.cos(a), y = d * Math.sin(a);
      const pts = [[x, y]];
      let h = rnd() * Math.PI * 2;
      for (let k = 0; k < 7; k++) { h += (rnd() - 0.5) * 1.4; x += Math.cos(h) * 0.35; y += Math.sin(h) * 0.35; pts.push([x, y]); }
      cracks.push(pts);
    }
    for (const [ctx2, col, w] of [[g, "#5a2a1e", 9], [g, "#ff8a2a", 4], [ge, "#ff6a1a", 7], [ge, "#ffd36a", 3]]) {
      ctx2.strokeStyle = col; ctx2.lineWidth = w; ctx2.lineCap = ctx2.lineJoin = "round";
      for (const pts of cracks) { ctx2.beginPath(); pts.forEach(([x, y], i) => i ? ctx2.lineTo(px(x), px(y)) : ctx2.moveTo(px(x), px(y))); ctx2.stroke(); }
    }
    const tex = own(new THREE.CanvasTexture(c)), emi = own(new THREE.CanvasTexture(e));
    tex.colorSpace = emi.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return { tex, emi };
  }

  function clear() {
    if (!group) return;
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const x of owned.splice(0)) x.dispose();
    for (const f of fx.splice(0)) f.done(true);
    group = null; dragon = null; flames = []; fireLight = null; portalDisc = null;
  }

  function computeIsland() {
    const pts = [];
    for (let i = 0; i < 24; i++) pts.push(polar(2.9, i / 24 * Math.PI * 2));
    for (let a = A0 - 1.0; a <= A_CAMP + 0.1; a += 0.08) pts.push(polar(rOut() + 0.45, a));
    for (let i = 0; i < 12; i++) { const c = polar(rPortal(), A_PORTAL), b = i / 12 * Math.PI * 2; pts.push({ x: c.x + 0.8 * Math.cos(b), y: c.y + 0.8 * Math.sin(b) }); }
    for (let i = 0; i < 16; i++) { const b = i / 16 * Math.PI * 2, R = walkR() + 0.5; pts.push({ x: FIRE.x + R * Math.cos(b), y: FIRE.y + R * Math.sin(b) }); }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // convex hull of everything that must stand on the island, then rounded off
    const P = pts.map(p => [p.x - cx, p.y - cy]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of P) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of [...P].reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    let hull = lo.slice(0, -1).concat(hi.slice(0, -1));
    for (let it = 0; it < 3; it++) {   // Chaikin corner cutting
      const out = [];
      hull.forEach((a, i) => { const b = hull[(i + 1) % hull.length]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); });
      hull = out;
    }
    hull = hull.map(([x, y]) => { const a = Math.atan2(y, x), k = 1 + 0.025 * Math.sin(a * 5 + 1) + 0.012 * Math.sin(a * 9); return [x * k, y * k]; });
    isle = { x: cx, y: cy, r: Math.max(...hull.map(([x, y]) => Math.hypot(x, y))), hull };
  }

  function build() {
    clear();
    group = new THREE.Group(); scene.add(group);
    computeIsland();
    const { x: ix, y: iy, r: Ri } = isle, rnd = rng(1234);

    // island: a slab with a wobbly edge, rocky underside
    const shape = new THREE.Shape(), hull = isle.hull;
    hull.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.08, bevelSegments: 2, curveSegments: 4 });
    slab.rotateX(Math.PI / 2);   // shape x,y -> world x,z; extrudes downward
    const { tex, emi } = islandTexture(Ri, 99);
    const topM = own(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9 }));
    lavaMat = topM;
    const map = t => { t.repeat.set(1 / (2 * Ri), 1 / (2 * Ri)); t.offset.set(0.5, 0.5); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; };
    map(tex); map(emi);
    const top = mesh(slab, [topM, mat("#7d6a62", 0.9)], ix, -0.06, iy); top.castShadow = false;
    // underside: jagged rock tapering to a point, following the island's outline
    const ring = [], step = Math.max(1, Math.floor(hull.length / 22));
    for (let i = 0; i < hull.length; i += step) ring.push(hull[i]);
    const levels = [[0.97, -0.42], [0.72, -Ri * 0.2], [0.4, -Ri * 0.33]], verts = [], idx = [], n = ring.length;
    levels.forEach(([k, y], l) => ring.forEach(([x, z], i) => {
      const j = l ? 1 + 0.12 * Math.sin(i * 12.9898 + l * 4.1) : 1;
      verts.push(x * k * j, y + (l ? 0.12 * Math.cos(i * 7.31 + l) : 0), z * k * j);
    }));
    verts.push(0, -Ri * 0.46, 0);
    for (let l = 0; l < levels.length - 1; l++) for (let i = 0; i < n; i++) {
      const a = l * n + i, b = l * n + (i + 1) % n, c = a + n, d = b + n;
      idx.push(a, c, b, b, c, d);
    }
    for (let i = 0; i < n; i++) idx.push((levels.length - 1) * n + i, n * levels.length, (levels.length - 1) * n + (i + 1) % n);
    const under = new THREE.BufferGeometry();
    under.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3)); under.setIndex(idx);
    const um = new THREE.MeshStandardMaterial({ color: "#8a746a", roughness: 0.95, flatShading: true, side: THREE.DoubleSide }); own(um);
    mesh(under.toNonIndexed(), um, ix, 0, iy).castShadow = false;
    under.dispose();
    for (let i = 0; i < 4; i++) {   // little floating rocks under the island
      const a = A0 + 1.9 + i * 1.3, d = Ri * (0.62 + 0.06 * i);
      mesh(new THREE.DodecahedronGeometry(0.18 + 0.08 * (i % 2)), mat("#6e5a54", 0.95, true), ix + d * Math.cos(a), -Ri * (0.12 + 0.04 * i), iy + d * Math.sin(a));
    }

    // boulders around the edge, away from the lanes and the campfire
    for (let i = 0; i < 26 && group.children.length < 60; i++) {
      const hp = hull[Math.floor(rnd() * hull.length)], k = 0.8 + rnd() * 0.12, p = { x: ix + hp[0] * k, y: iy + hp[1] * k };
      const ang = Math.atan2(Math.sin(angOf(p) - A0), Math.cos(angOf(p) - A0)), rr = radOf(p);
      if (rr < 2.5 || (ang > A_PORTAL - A0 - 0.35 && ang < A_CAMP - A0 + 0.5 && rr < rPortal() + 0.8) || Math.hypot(p.x - FIRE.x, p.y - FIRE.y) < walkR() + 0.6) continue;
      const s = 0.18 + rnd() * 0.28, b = mesh(new THREE.DodecahedronGeometry(s), mat(mix("#9a877d", "#7a675f", rnd()), 0.9, true), p.x, s * 0.55, p.y);
      b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); b.scale.y = 0.75;
    }

    // the dragon's hoard behind it
    const goldM = new THREE.MeshPhysicalMaterial({ color: GOLD, roughness: 0.3, metalness: 0.4, clearcoat: 0.6 }); own(goldM);
    for (let i = 0; i < 46; i++) {
      const a = A0 + Math.PI + (rnd() - 0.5) * 2.2, d = 1.1 + rnd() * 1.2, p = polar(d, a);
      const c = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 14), goldM, p.x, 0.02 + rnd() * 0.12 * (2.3 - d), p.y);
      c.rotation.set((rnd() - 0.5) * 1.2, 0, (rnd() - 0.5) * 1.2);
    }
    for (const [a, d, col] of [[0.6, 1.6, "#e2445c"], [-0.5, 1.9, "#46b4e8"], [0.1, 2.1, "#5ad08a"]]) {
      const p = polar(d, A0 + Math.PI + a);
      mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.15, clearcoat: 1 }), p.x, 0.12, p.y);
    }
    const chestP = polar(2.0, A0 + Math.PI - 0.95), chest = new THREE.Group();
    chest.position.set(chestP.x, 0, chestP.y); chest.rotation.y = yawTo(chestP, { x: 0, y: 0 }) + 0.4; group.add(chest);
    mesh(new RoundedBoxGeometry(0.5, 0.26, 0.34, 2, 0.03), mat("#8a5a36", 0.7), 0, 0.13, 0, chest);
    mesh(new RoundedBoxGeometry(0.52, 0.12, 0.36, 2, 0.05), mat("#9c6a40", 0.7), 0, 0.31, -0.02, chest).rotation.x = -0.35;
    for (const dx of [-0.17, 0.17]) mesh(new THREE.BoxGeometry(0.04, 0.27, 0.355), goldM, dx, 0.135, 0, chest);
    mesh(new THREE.SphereGeometry(0.14, 16, 10), goldM, 0, 0.3, 0.05, chest).scale.y = 0.5;

    // portal: a stone arch with a swirling glow; people come and go through it
    const pa = A_PORTAL, pp = polar(rPortal() + 0.12, pa), portal = new THREE.Group();
    portal.position.set(pp.x, 0, pp.y); portal.rotation.y = yawTo(pp, { x: 0, y: 0 }); group.add(portal);
    const stone = mat("#b8aca2", 0.8);
    for (const s of [-1, 1]) {
      mesh(new RoundedBoxGeometry(0.2, 1.1, 0.22, 2, 0.04), stone, s * 0.52, 0.55, 0, portal);
      mesh(new THREE.DodecahedronGeometry(0.16), mat("#9a8e86", 0.85, true), s * 0.52, 0.06, 0.02, portal).scale.y = 0.6;
    }
    mesh(new THREE.TorusGeometry(0.52, 0.1, 10, 24, Math.PI), stone, 0, 1.1, 0, portal);
    mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: "#a8f0ff" }), 0, 1.66, 0, portal);
    const pc = document.createElement("canvas"); pc.width = pc.height = 128;
    const g = pc.getContext("2d"), rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    rg.addColorStop(0, "rgba(240,250,255,1)"); rg.addColorStop(0.35, "rgba(120,200,255,0.9)"); rg.addColorStop(0.8, "rgba(150,90,255,0.75)"); rg.addColorStop(1, "rgba(150,90,255,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 4;
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let i = 0; i < 40; i++) { const a = k * 2.09 + i * 0.13, r = i * 1.4; g.lineTo(64 + r * Math.cos(a), 64 + r * Math.sin(a)); } g.stroke(); }
    const ptex = own(new THREE.CanvasTexture(pc)); ptex.colorSpace = THREE.SRGBColorSpace;
    portalDisc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 36), own(new THREE.MeshBasicMaterial({ map: ptex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })));
    portalDisc.position.set(0, 0.95, 0); portalDisc.scale.set(0.84, 1.55, 1); portal.add(portalDisc);

    // campfire: stones, logs, flames, warm light, and a log seat for each resting spot
    const camp = new THREE.Group(); camp.position.set(FIRE.x, 0, FIRE.y); group.add(camp);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; mesh(new THREE.DodecahedronGeometry(0.075), mat("#8f8a86", 0.9, true), 0.3 * Math.cos(a), 0.05, 0.3 * Math.sin(a), camp); }
    for (const a of [0.4, 0.4 + Math.PI / 2]) { const l = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.46, 10), mat("#6b4428", 0.9), 0, 0.06, 0, camp); l.rotation.set(0, a, Math.PI / 2); }
    flames = [["#ff7a2a", 0.17, 0.42], ["#ffb43a", 0.12, 0.32], ["#fff0a0", 0.065, 0.2]].map(([col, r, h], i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), own(new THREE.MeshBasicMaterial({ color: col, toneMapped: false })));
      f.position.set(0, 0.08 + h / 2, 0); camp.add(f); f.userData.h = h; f.userData.i = i; return f;
    });
    fireLight = new THREE.PointLight(0xff9a4a, 5, 5, 1.6); fireLight.position.set(0, 0.6, 0); camp.add(fireLight);
    const nSeats = seatRings > 1 ? 15 : 6;
    for (let i = 0; i < nSeats; i++) {
      const s = seatPos(i), log = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 12), mat("#8a5a36", 0.85), s.x - FIRE.x, SEAT_Z * ZS / 2, s.y - FIRE.y, camp);
      log.rotation.set(0, -s.a, Math.PI / 2);
      for (const e of [-1, 1]) mesh(new THREE.CircleGeometry(0.1, 12), mat("#d9b98a", 0.9), 0, e * 0.211, 0, log).rotation.x = e * -Math.PI / 2;
    }

    // sky backdrop: a round painting behind the island
    const sky = new THREE.Mesh(new THREE.CircleGeometry(1, 64), own(new THREE.MeshBasicMaterial({ map: skyTex, transparent: true, depthWrite: false, toneMapped: false })));
    const camDir = new THREE.Vector3(Math.cos(Math.PI / 6) * Math.SQRT1_2, Math.sin(Math.PI / 6), Math.cos(Math.PI / 6) * Math.SQRT1_2);
    const sc = new THREE.Vector3(ix, 1.4, iy).addScaledVector(camDir, -18);
    sky.position.copy(sc); sky.lookAt(sc.clone().add(camDir)); sky.scale.setScalar(Ri * 1.08); sky.renderOrder = -1;
    group.add(sky);

    dragon = makeDragon();
    group.add(dragon.root);

    // shadows cover the island
    const S = Ri * 1.2 + 2;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 0.5, far: 80 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.set(ix, 0, iy);
    sun.position.set(ix + 3, 14, iy + 9);
  }

  // ---------- the dragon ----------
  function makeDragon() {
    const root = new THREE.Group(); root.scale.setScalar(DS); root.rotation.y = A0;
    const body = new THREE.Group(); root.add(body);
    const red = new THREE.MeshPhysicalMaterial({ color: "#d8392b", roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.35, emissive: "#ff2a10", emissiveIntensity: 0 });
    own(red);
    const belly = vinyl("#f4c68a"), horn = vinyl("#f3e7c9"), spike = vinyl("#f59a3a"), dark = vinyl("#3a1410");
    const memb = new THREE.MeshPhysicalMaterial({ color: "#ee6a45", roughness: 0.55, clearcoat: 0.2, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
    own(memb);
    const P = (geo, m, parent, x, y, z) => part(geo, m, parent, x, y, z);

    P(sphere(1.0, 40, 30), red, body, 0, 1.0, 0).scale.set(1.0, 1.12, 0.92);
    P(sphere(0.8, 36, 26), belly, body, 0, 0.98, 0.4).scale.set(0.84, 1.04, 0.56);
    for (let i = 0; i < 4; i++) { const r = P(new THREE.TorusGeometry(0.5 - Math.abs(i - 1.5) * 0.06, 0.018, 6, 30, Math.PI), vinyl("#e3ab6e"), body, 0, 0.55 + i * 0.27, 0.78 - Math.abs(i - 1.5) * 0.04); r.rotation.set(Math.PI / 2 - 0.15, 0, 0); r.scale.set(1, 0.55, 1); }
    for (const s of [-1, 1]) {
      P(sphere(0.5, 28, 20), red, body, s * 0.72, 0.45, 0.02).scale.set(0.85, 0.85, 1.15);           // haunch
      const foot = P(sphere(0.3, 20, 14), red, body, s * 0.8, 0.13, 0.48); foot.scale.set(1, 0.55, 1.35);
      for (let c = -1; c <= 1; c++) { const cl = P(new THREE.ConeGeometry(0.05, 0.13, 10), horn, body, s * 0.8 + c * 0.12, 0.08, 0.86); cl.rotation.x = Math.PI / 2; }
    }
    const arms = [-1, 1].map(s => {
      const g = new THREE.Group(); g.position.set(s * 0.6, 1.45, 0.42); body.add(g);
      const a = P(new THREE.CapsuleGeometry(0.15, 0.32, 6, 14), red, g, 0, -0.2, 0.08); a.rotation.x = 0.45;
      P(sphere(0.17, 16, 12), red, g, 0, -0.42, 0.2);
      for (let c = -1; c <= 1; c++) { const cl = P(new THREE.ConeGeometry(0.035, 0.1, 8), horn, g, c * 0.08, -0.5, 0.33); cl.rotation.x = 1.9; }
      g.rotation.z = s * -0.15;
      return g;
    });
    // back and tail spikes
    for (let i = 0; i < 5; i++) {
      const a = 0.3 + i * 0.32, y = 1.0 + 1.06 * Math.cos(a), z = -0.88 * Math.sin(a);
      const sp = P(new THREE.ConeGeometry(0.11 - i * 0.008, 0.26, 12), spike, body, 0, y, z); sp.rotation.x = -a;
    }
    // tail: a tapering chain curling around the right side
    const tail = new THREE.Group(); tail.position.set(0, 0.4, -0.7); body.add(tail);
    const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0.55, -0.15, -0.5], [1.25, -0.22, -0.35], [1.62, -0.24, 0.25], [1.45, -0.25, 0.85], [1.05, -0.24, 1.15]].map(v => new THREE.Vector3(...v)));
    for (let i = 0; i <= 18; i++) {
      const u = i / 18, p = curve.getPoint(u), r = 0.36 * (1 - u) + 0.07;
      P(sphere(r, 18, 12), red, tail, p.x, p.y + r * 0.4, p.z);
      if (i % 4 === 2 && i < 16) { const sp = P(new THREE.ConeGeometry(r * 0.35, r * 0.8, 10), spike, tail, p.x, p.y + r * 1.25, p.z); }
    }
    const tipP = curve.getPoint(1), tip = P(new THREE.OctahedronGeometry(0.17), spike, tail, tipP.x - 0.12, tipP.y + 0.08, tipP.z + 0.05);
    tip.scale.set(1.3, 0.35, 1);
    // neck and head
    const neck = new THREE.Group(); neck.position.set(0, 1.8, 0.08); body.add(neck);
    P(new THREE.CapsuleGeometry(0.35, 0.5, 8, 20), red, neck, 0, 0.42, 0.1).rotation.x = 0.28;
    P(new THREE.CapsuleGeometry(0.22, 0.48, 8, 16), belly, neck, 0, 0.36, 0.33).rotation.x = 0.28;
    const head = new THREE.Group(); head.position.set(0, 0.98, 0.28); neck.add(head);
    P(sphere(0.6, 36, 28), red, head, 0, 0, 0).scale.set(1.05, 0.92, 1.0);
    P(sphere(0.42, 30, 22), red, head, 0, -0.14, 0.5).scale.set(0.92, 0.62, 1.05);
    for (const s of [-1, 1]) {
      P(sphere(0.045, 10, 8), dark, head, s * 0.12, -0.02, 0.92);
      const eye = P(sphere(0.15, 20, 16), vinyl("#ffd84a", false, "#ffb000"), head, s * 0.29, 0.12, 0.42); eye.scale.set(1, 1, 0.62);
      const pupil = P(sphere(0.055, 12, 10), dark, head, s * 0.31, 0.12, 0.5); pupil.scale.set(0.35, 1.25, 0.5);
      P(sphere(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: "#fff" }), head, s * 0.27, 0.19, 0.52).userData.shine = true;
      const lid = P(new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), red, head, s * 0.29, 0.12, 0.42);
      lid.scale.set(1, 1, 0.66); lid.rotation.x = -1.45;
      const brow = P(new THREE.CapsuleGeometry(0.045, 0.16, 4, 10), red, head, s * 0.27, 0.3, 0.38); brow.rotation.set(0, 0, s * 1.2);
      const h1 = P(new THREE.ConeGeometry(0.12, 0.55, 16), horn, head, s * 0.3, 0.42, -0.2); h1.rotation.set(-0.95, 0, s * -0.3);
      const h2 = P(new THREE.ConeGeometry(0.07, 0.28, 12), horn, head, s * 0.46, 0.2, -0.32); h2.rotation.set(-1.2, 0, s * -0.9);
      const fr = P(new THREE.ConeGeometry(0.08, 0.24, 10), spike, head, s * 0.58, -0.06, -0.08); fr.rotation.set(-0.6, 0, s * -1.5);
      P(new THREE.ConeGeometry(0.03, 0.08, 8), horn, head, s * 0.2, -0.33, 0.78).rotation.x = Math.PI;
    }
    head.userData.lids = head.children.filter(c => c.geometry && c.geometry.type === "SphereGeometry" && c.geometry.parameters.thetaLength === Math.PI / 2);
    head.userData.shines = head.children.filter(c => c.userData.shine);
    for (let i = 0; i < 3; i++) P(new THREE.ConeGeometry(0.07, 0.18, 10), spike, head, 0, 0.5 - i * 0.04, 0.05 - i * 0.2).rotation.x = -0.5 - i * 0.2;
    const jaw = new THREE.Group(); jaw.position.set(0, -0.24, 0.12); head.add(jaw);
    P(sphere(0.36, 26, 18), belly, jaw, 0, -0.06, 0.4).scale.set(0.82, 0.38, 1.0);
    P(sphere(0.3, 20, 14), vinyl("#8a1f1a"), head, 0, -0.27, 0.5).scale.set(0.75, 0.25, 0.95);
    const mouth = new THREE.Object3D(); mouth.position.set(0, -0.28, 0.9); head.add(mouth);
    // wings
    const wings = [-1, 1].map(s => {
      const w = new THREE.Group(); w.position.set(s * 0.5, 1.62, -0.5); body.add(w);
      const inner = new THREE.Group(); inner.scale.x = s; w.add(inner);
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(0.5, 0.95); sh.lineTo(1.05, 1.55); sh.lineTo(2.05, 1.45);
      sh.quadraticCurveTo(1.6, 1.12, 1.95, 0.62); sh.quadraticCurveTo(1.45, 0.5, 1.45, 0.0);
      sh.quadraticCurveTo(0.9, 0.15, 0.25, -0.35); sh.lineTo(0, 0);
      const m = part(new THREE.ShapeGeometry(sh, 8), memb, inner); m.castShadow = true;
      const bone = (a, b, r) => {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
        const c = part(new THREE.CapsuleGeometry(r, len, 4, 10), red, inner);
        c.position.copy(A).add(B).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
      };
      bone([0, 0, 0], [0.5, 0.95, 0], 0.07); bone([0.5, 0.95, 0], [1.05, 1.55, 0], 0.055);
      bone([1.05, 1.55, 0], [2.05, 1.45, 0], 0.035); bone([1.05, 1.55, 0], [1.95, 0.62, 0], 0.03); bone([1.05, 1.55, 0], [1.45, 0.0, 0], 0.03);
      P(new THREE.ConeGeometry(0.05, 0.16, 8), horn, inner, 1.05, 1.66, 0);
      return w;
    });
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { root, body, neck, head, jaw, arms, wings, tail, mouth, red, sleep: 1, mode: "idle", modeT: 0, nextAt: 4, flash: 0, wasAwake: false, sweep: 0 };
  }

  // ---------- effects ----------
  const GEO = {
    ball: new THREE.SphereGeometry(1, 14, 10), cone: new THREE.ConeGeometry(1, 1, 8), shaft: new THREE.CylinderGeometry(0.008, 0.008, 0.32, 5),
    ring: new THREE.TorusGeometry(1, 0.06, 6, 32), arcG: new THREE.TorusGeometry(0.34, 0.025, 6, 20, 2.2),
  };
  const glowMat = col => new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  function addFx(obj, dur, update, onEnd) {
    group.add(obj);
    const f = { t: 0, dur, update, done(quiet) { group && group.remove(obj); obj.traverse(o => o.material && o.material.dispose()); if (onEnd && !quiet) onEnd(); } };
    fx.push(f);
    return f;
  }
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  const chest = () => new THREE.Vector3(0.75 * Math.cos(A0), 1.5, 0.75 * Math.sin(A0));
  function burst(p, col, size, dur = 0.35) {
    const b = new THREE.Mesh(GEO.ball, glowMat(col)); b.position.copy(p);
    addFx(b, dur, f => { b.scale.setScalar(size * (0.3 + f)); b.material.opacity = 1 - f; });
  }
  function fireball(from, glow) {
    const g = new THREE.Group(), core = new THREE.Mesh(GEO.ball, glowMat("#fff1b0")), halo = new THREE.Mesh(GEO.ball, glowMat(glow));
    core.scale.setScalar(0.07); halo.scale.setScalar(0.15); halo.material.opacity = 0.7; g.add(core, halo);
    const to = chest().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.3) * 0.6, (Math.random() - 0.5) * 0.6));
    const p0 = from.clone();
    addFx(g, 0.8, f => { g.position.lerpVectors(p0, to, f); g.position.y += Math.sin(f * Math.PI) * 0.6; halo.scale.setScalar(0.15 + 0.03 * Math.sin(f * 40)); },
      () => { burst(to, glow, 0.45); if (dragon) dragon.flash = 1; });
  }
  function arrow(from) {
    const g = new THREE.Group(), shaftM = new THREE.MeshStandardMaterial({ color: WOOD }), tipM = new THREE.MeshStandardMaterial({ color: "#d9dde4", metalness: 0.3 });
    const s = new THREE.Mesh(GEO.shaft, shaftM); s.rotation.x = Math.PI / 2; g.add(s);
    const tip = new THREE.Mesh(GEO.cone, tipM); tip.scale.set(0.022, 0.06, 0.022); tip.rotation.x = Math.PI / 2; tip.position.z = 0.18; g.add(tip);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.035, 0.06), new THREE.MeshStandardMaterial({ color: "#f2efe6" })); fl.position.z = -0.15; g.add(fl);
    const to = chest().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.4) * 0.6, (Math.random() - 0.5) * 0.7));
    const p0 = from.clone();
    addFx(g, 0.55, f => {
      tv.lerpVectors(p0, to, f); tv.y += Math.sin(f * Math.PI) * 0.35;
      tv2.lerpVectors(p0, to, Math.min(1, f + 0.02)); tv2.y += Math.sin(Math.min(1, f + 0.02) * Math.PI) * 0.35;
      g.position.copy(tv); g.lookAt(tv2);
    }, () => { fl.geometry.dispose(); burst(to, "#fff3c0", 0.22, 0.25); if (dragon) dragon.flash = Math.max(dragon.flash, 0.6); });
  }
  function slash(e) {
    const a = new THREE.Mesh(GEO.arcG, glowMat("#ffffff"));
    const d = Math.hypot(e.x, e.y), ux = -e.x / d, uy = -e.y / d;
    a.position.set(e.x + ux * 0.62, 0.7, e.y + uy * 0.62); a.rotation.set(0, Math.atan2(ux, uy) + Math.PI / 2, 0.4);
    addFx(a, 0.25, f => { a.material.opacity = 1 - f; a.scale.setScalar(0.8 + f * 0.6); }, () => { if (dragon) dragon.flash = Math.max(dragon.flash, 0.5); });
  }
  function heal(target, from) {
    if (from) burst(from, "#fff4c0", 0.2, 0.4);
    const ring = new THREE.Mesh(GEO.ring, glowMat("#9cf5b0")); ring.rotation.x = Math.PI / 2; ring.position.set(target.x, 0.05, target.y);
    addFx(ring, 1.1, f => { ring.scale.setScalar(0.3 + 0.25 * f); ring.material.opacity = (1 - f) * 0.9; });
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Mesh(GEO.ball, glowMat(i % 2 ? "#fff1a0" : "#a8ffc0")), a = i / 7 * Math.PI * 2, r = 0.28;
      addFx(sp, 1.1 + i * 0.05, f => { sp.position.set(target.x + r * Math.cos(a + f * 2), 0.1 + f * 1.2, target.y + r * Math.sin(a + f * 2)); sp.scale.setScalar(0.035 * (1 - f * 0.5)); sp.material.opacity = 1 - f; });
    }
  }
  function breathPuff(from, to) {
    const b = new THREE.Mesh(GEO.ball, glowMat("#ffd36a")), p0 = from.clone(), jitter = new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.2, (Math.random() - 0.5) * 0.5);
    const c1 = new THREE.Color("#fff0a0"), c2 = new THREE.Color("#ff6a1a"), c3 = new THREE.Color("#a0201a");
    addFx(b, 0.7, f => {
      b.position.lerpVectors(p0, to, Math.min(1, f * 1.15)).addScaledVector(jitter, f);
      if (f > 0.8) b.position.y += (f - 0.8) * 1.5;
      b.scale.setScalar(0.1 + f * 0.38);
      b.material.color.copy(f < 0.4 ? c1.clone().lerp(c2, f / 0.4) : c2.clone().lerp(c3, (f - 0.4) / 0.6));
      b.material.opacity = f < 0.1 ? f * 10 : 1 - (f - 0.1) / 0.9;
    });
  }

  // ---------- per-frame ----------
  const handPos = (e, i) => e.fig.arms[i].hand.getWorldPosition(new THREE.Vector3());
  function update(t, dt, ents) {
    paintBackdrop(t);
    if (!group) return;
    const m = reduceMotion ? 0 : 1;
    // world bits
    if (portalDisc) portalDisc.rotation.z = -t * 1.2 * m;
    flames.forEach(f => { const k = 1 + (0.12 * Math.sin(t * 13 + f.userData.i * 2) + 0.08 * Math.sin(t * 23 + f.userData.i)) * m; f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k)); f.position.y = 0.08 + f.userData.h * k / 2; });
    if (fireLight) fireLight.intensity = (4.2 + 0.8 * Math.sin(t * 11) * m) * (1 + 0.6 * nightness(hourNow()));
    if (lavaMat) lavaMat.emissiveIntensity = 0.75 + 0.25 * Math.sin(t * 1.7) * m;

    // fighters
    const fighters = [...ents.values()].filter(e => e.fig && e.phase === "seated" && e.data.state === "working" && !e.outside);
    for (const e of ents.values()) if (e.t.flinch) e.t.flinch = Math.max(0, e.t.flinch - dt * 1.6);
    if (m) for (const e of fighters) {
      const c = e.t.cls, seed = e.look.seed, per = { warrior: 1.4, mage: 2.6, archer: 2.0, priest: 3.0 }[c], rel = { warrior: 0.62, mage: 0.6, archer: 0.75, priest: 0.45 }[c];
      const n = Math.floor((t + seed * 7) / per - rel);
      if (e.t.fxN !== undefined && n !== e.t.fxN) {
        if (c === "warrior") slash(e);
        else if (c === "mage") fireball(handPos(e, 1), e.look.orb);
        else if (c === "archer") arrow(handPos(e, 1));
        else { const tg = fighters[Math.floor(Math.random() * fighters.length)]; heal(tg, e.fig.orb.getWorldPosition(new THREE.Vector3())); }
      }
      e.t.fxN = n;
    }
    for (const f of [...fx]) {
      f.t += dt; const k = Math.min(1, f.t / f.dur);
      f.update(k);
      if (k >= 1) { fx.splice(fx.indexOf(f), 1); f.done(); }
    }
    animateDragon(t, dt, m, fighters, ents);
  }

  function animateDragon(t, dt, m, fighters, ents) {
    const D = dragon; if (!D) return;
    const awake = fighters.length > 0;
    if (awake) D.lastBusy = t;
    const wantSleep = !awake && t - (D.lastBusy ?? -99) > 4;
    D.sleep += ((wantSleep ? 1 : 0) - D.sleep) * Math.min(1, dt * (wantSleep ? 0.8 : 2.5));
    if (reduceMotion) D.sleep = wantSleep ? 1 : 0;
    D.modeT += dt;
    if (m && awake && !D.wasAwake && D.sleep > 0.3) { D.mode = "roar"; D.modeT = 0; }
    D.wasAwake = awake;
    if (m && awake && D.mode === "idle" && D.sleep < 0.2 && t > D.nextAt) {
      D.mode = Math.random() < 0.75 ? "windup" : "roar"; D.modeT = 0; D.sweepDir = Math.random() < 0.5 ? 1 : -1;
    }
    if (!awake && D.mode !== "idle" && D.mode !== "recover") { D.mode = "recover"; D.modeT = 0; }
    // targets
    let neckX = 0.04 * Math.sin(t * 0.8) * m, headX = 0.05 * Math.sin(t * 0.9 + 1) * m, jaw = 0.04 + 0.03 * Math.sin(t * 0.7) * m;
    let headY = 0.18 * Math.sin(t * 0.33) * m, spread = 0, flap = 0.07 * Math.sin(t * 1.4) * m, armUp = 0;
    const dur = { windup: 0.7, breath: 2.0, recover: 0.7, roar: 1.6 }[D.mode];
    if (D.mode === "windup") { neckX = -0.3; headX = -0.25; jaw = 0.25; headY = 0.55 * D.sweepDir; armUp = 0.3; }
    if (D.mode === "breath") {
      const f = D.modeT / 2.0;
      neckX = 0.32; headX = 0.38; jaw = 0.62; headY = lerp(0.55, -0.55, smooth(0, 1, f)) * D.sweepDir; armUp = 0.2;
      // puffs from the mouth to the ground just in front of the warriors
      D.sweep = A0 - headY;
      const to = new THREE.Vector3(2.25 * Math.cos(D.sweep), 0.15, 2.25 * Math.sin(D.sweep));
      const from = D.mouth.getWorldPosition(new THREE.Vector3());
      D.acc = (D.acc || 0) + dt * 55;
      while (D.acc > 1) { D.acc--; breathPuff(from, to); }
      for (const e of ents.values()) {
        if (!e.fig || e.phase !== "seated" || e.data.state !== "working") continue;
        const da = Math.atan2(Math.sin(angOf(e) - D.sweep), Math.cos(angOf(e) - D.sweep));
        if (Math.abs(da) < 0.22) e.t.flinch = 1;
      }
    }
    if (D.mode === "roar") { const f = D.modeT / 1.6, k = Math.sin(Math.min(1, f) * Math.PI); neckX = -0.35 * k; headX = -0.5 * k; jaw = 0.75 * k; spread = 0.45 * k; flap = 0.25 * Math.sin(t * 9) * k; armUp = 0.6 * k; headY = 0.1 * Math.sin(t * 20) * k; }
    if (dur && D.modeT >= dur) {
      D.mode = D.mode === "windup" ? "breath" : D.mode === "breath" ? "recover" : "idle"; D.modeT = 0;
      if (D.mode === "idle") D.nextAt = t + 7 + Math.random() * 6;
    }
    // asleep: head down, wings folded, eyes shut, slow breathing
    const s = D.sleep;
    neckX = lerp(neckX, 0.42, s); headX = lerp(headX, 0.32, s); jaw = lerp(jaw, 0, s); headY = lerp(headY, 0.25, s);
    spread = lerp(spread, -1.1, s); flap *= 1 - s; armUp *= 1 - s;
    const k = reduceMotion ? 1 : Math.min(1, dt * 6), ap = (o, key, v) => { o[key] += (v - o[key]) * k; };
    ap(D.neck.rotation, "x", neckX); ap(D.head.rotation, "x", headX); ap(D.head.rotation, "y", headY); ap(D.jaw.rotation, "x", jaw);
    D.wings.forEach((w, i) => { const sg = i ? 1 : -1; ap(w.rotation, "y", sg * (0.55 - spread * 0.6)); ap(w.rotation, "z", sg * (-0.15 + spread * 0.6 + flap)); });
    D.arms.forEach((a, i) => ap(a.rotation, "x", -armUp * 1.2));
    D.tail.rotation.y = 0.08 * Math.sin(t * 0.9) * m * (1 - s * 0.7);
    const br = Math.sin(t * (s > 0.5 ? 1.1 : 1.9)) * m;
    D.body.scale.set(1 + 0.012 * br, 1 + 0.02 * br, 1 + 0.012 * br);
    D.body.position.y = -0.08 * s;
    const shut = Math.max(s > 0.6 ? 1 : 0, (t % 5.3) < 0.15 && m ? 1 : 0);
    for (const lid of D.head.userData.lids) lid.rotation.x = lerp(-1.45, 0.05, shut);
    for (const sh of D.head.userData.shines) sh.visible = !shut;
    D.flash = Math.max(0, D.flash - dt * 5);
    D.red.emissiveIntensity = D.flash * 0.35;
  }

  // "z z Z" over the dragon's head while it sleeps
  const zzz = document.createElement("div"); zzz.className = "zzz"; zzz.innerHTML = "<span>z</span><span>z</span><span>Z</span>";
  labelsEl.appendChild(zzz);
  function overlay() {
    if (!dragon) { zzz.style.display = "none"; return; }
    zzz.style.display = dragon.sleep > 0.6 ? "" : "none";
    const p = dragon.head.getWorldPosition(new THREE.Vector3()), q = toScreen(p.x, p.y + 0.9, p.z);
    zzz.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
  }

  return {
    name: "fantasy",
    look, dress, assign, layout, door, home, pathHome, pathOut, pose,
    build, update, overlay,
    bounds() {
      const pts = [], { x, y, r } = isle;
      for (const [hx, hy] of isle.hull || []) pts.push([x + hx, 0.3, y + hy], [x + hx * 0.4, -r * 0.4, y + hy * 0.4]);
      for (const s of [-1, 1]) pts.push([s * 2.4 * Math.cos(A0 + Math.PI / 2), 4.4, s * 2.4 * Math.sin(A0 + Math.PI / 2)]);
      pts.push([0, 4.6, 0]);
      return { points: pts };
    },
    dispose() {
      clear(); zzz.remove(); skyTex.dispose();
      for (const g of Object.values(GEO)) g.dispose();
      for (const m of matCache.values()) m.dispose();
    },
  };
}
