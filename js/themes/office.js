// The office: desks in a room, a door on the left wall, a window that follows the time, a wall clock.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/RoundedBoxGeometry.js";
import { baseLook, pick, shade, mix, vinyl, part, rounded } from "../figure.js";
import { paintSky, hourNow } from "../sky.js";

// x runs along the back wall, y runs out from it (toward the viewer's left), z is height.
// Three.js: X = x, Z = y, Y = z * ZS (heights squashed a little to keep the old proportions).
const ZS = 0.8, Yz = z => z * ZS, WALL_H = 2.6;
const P = {
  floorA: "#e3d8c6", floorB: "#dacdb8", wallL: "#cfd6e2", wallR: "#dde3ec", trim: "#aab4c4",
  desk: "#c19468", chair: "#4c566a", rug: "#a9b8d8", needs: "#f0a020",
};
const HOODIES = ["#e8655a", "#4f8fe8", "#45b07a", "#d9a43a", "#9b6ee0", "#e07bb0", "#3fb5c4", "#ef8a3c", "#f2efe6"];
const SKIRTS = ["#f2a7b8", "#b9c7f0", "#c8b3ea", "#f5c99b", "#a8dcc6", "#3d4660"];
const PANTS = ["#3d4660", "#2f3a4a", "#55607a", "#6b5544", "#3f5a4e"];

const SPACING = 2.8;
const DOOR = { x: 0.15, y: 0.8 }, AISLE_X = 0.8, LEAVE_X = 0.35;   // in and out aisles, well apart
// two sides of the doorway: in on the far side, out on the near side, so nobody meets head-on there
const DOOR_IN = { x: DOOR.x, y: DOOR.y + 0.18 }, DOOR_OUT = { x: DOOR.x, y: DOOR.y - 0.18 };

export function createOfficeTheme(ctx) {
  const { scene, sun, reduceMotion } = ctx;
  let layout = { cols: 2, rows: 1, W: 0, D: 0 }, group = null, screens = [];
  const owned = [];   // per-build materials and textures to free on rebuild
  const own = x => { owned.push(x); return x; };

  const sky = document.createElement("canvas"); sky.width = 256; sky.height = 128;
  const skyCtx = sky.getContext("2d"), skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
  const clk = document.createElement("canvas"); clk.width = clk.height = 256;
  const clockCtx = clk.getContext("2d"), clockTex = new THREE.CanvasTexture(clk); clockTex.colorSpace = THREE.SRGBColorSpace;

  function computeLayout(slotsNeeded) {
    const n = Math.max(2, slotsNeeded);
    const cols = n <= 2 ? 2 : n <= 6 ? 3 : 4;
    const rows = Math.max(1, Math.ceil(n / cols));
    layout = { cols, rows, W: 1.0 + cols * SPACING + 1.4, D: 1.6 + rows * SPACING + 0.2 };
  }
  const deskPos = slot => {
    const col = slot % layout.cols, row = Math.floor(slot / layout.cols);
    return { x: 1.4 + col * SPACING, y: 1.4 + row * SPACING };
  };
  const chairPos = slot => { const d = deskPos(slot); return { x: d.x + 0.8, y: d.y + 1.15 }; };
  // Walk along a lane just behind the row of chairs so nobody walks through a seated colleague.
  const laneY = slot => chairPos(slot).y + 0.7;
  computeLayout(2);

  // ---------- room ----------
  const matCache = new Map();
  function roomMat(color, rough = 0.8) {
    const k = color + "|" + rough;
    if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough }));
    return matCache.get(k);
  }
  // Rounded box with its far corner at (x, y, z) in room units.
  function rbox(x, y, z, w, d, h, color, r = 0.035, opts = {}) {
    const H = Yz(h), rr = Math.min(r, w / 2 - 0.002, d / 2 - 0.002, H / 2 - 0.002);
    const geo = rr > 0.004 ? new RoundedBoxGeometry(w, H, d, 3, rr) : new THREE.BoxGeometry(w, H, d);
    const mesh = new THREE.Mesh(geo, roomMat(color, opts.rough));
    mesh.position.set(x + w / 2, Yz(z) + H / 2, y + d / 2);
    mesh.castShadow = opts.cast !== false; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function cyl(x, y, z, rTop, rBot, h, color, seg = 24) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, Yz(h), seg), roomMat(color, 0.6));
    mesh.position.set(x, Yz(z) + Yz(h) / 2, y);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function floorTexture(W, D) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = P.floorB; x.fillRect(0, 0, 128, 128);
    x.fillStyle = P.floorA; x.fillRect(0, 0, 64, 64); x.fillRect(64, 64, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(W / 2, D / 2); t.anisotropy = 4;
    return t;
  }
  function clear() {
    if (!group) return;
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const x of owned.splice(0)) x.dispose();
    group = null;
  }

  function build() {
    clear();
    group = new THREE.Group(); scene.add(group);
    const { W, D } = layout;

    // floor slab, chequered on top
    const side = roomMat(P.trim);
    const top = own(new THREE.MeshStandardMaterial({ map: own(floorTexture(W, D)), roughness: 0.85 }));
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 0.15, 0.14, D + 0.15), [side, side, top, side, side, side]);
    floor.position.set((W - 0.15) / 2, -0.07, (D - 0.15) / 2); floor.receiveShadow = true; group.add(floor);
    rbox(1.1, 1.1, 0, W - 2.4, D - 1.4, 0.02, P.rug, 0.01, { cast: false });

    // walls, top trim and skirting
    rbox(-0.15, -0.15, 0, 0.15, D + 0.15, WALL_H, P.wallL, 0.02);
    rbox(0, -0.15, 0, W, 0.15, WALL_H, P.wallR, 0.02);
    rbox(-0.18, -0.18, WALL_H, 0.21, D + 0.18, 0.06, P.trim, 0.02);
    rbox(0, -0.18, WALL_H, W, 0.21, 0.06, P.trim, 0.02);
    rbox(0, 0, 0, 0.035, D, 0.12, P.trim, 0.01, { cast: false });
    rbox(0, 0, 0, W, 0.035, 0.12, P.trim, 0.01, { cast: false });

    // door on the left wall
    rbox(0, DOOR.y - 0.45, 0, 0.04, 0.9, 1.75, shade(P.desk, 0.7), 0.02);
    rbox(0.02, DOOR.y - 0.38, 0, 0.04, 0.76, 1.68, shade(P.desk, 0.85), 0.02);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), roomMat("#d8c27a", 0.35));
    knob.position.set(0.08, Yz(0.85), DOOR.y + 0.28); knob.castShadow = true; group.add(knob);

    // window on the back wall; the sky inside follows your local time
    const wx = Math.max(2.2, W * 0.5), ww = Math.min(2.4, W - wx - 0.6);
    rbox(wx - 0.08, 0, 0.92, ww + 0.16, 0.04, 1.26, P.trim, 0.02);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, Yz(1.1)), own(new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false })));
    glass.position.set(wx + ww / 2, Yz(1.55), 0.045); group.add(glass);
    rbox(wx + ww / 2 - 0.03, 0.04, 1.0, 0.06, 0.03, 1.1, P.trim, 0.01);
    rbox(wx - 0.12, 0, 0.86, ww + 0.24, 0.14, 0.06, mix(P.trim, "#ffffff", 0.3), 0.02);

    // wall clock, flat on the wall
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 48), roomMat(P.trim, 0.5));
    rim.rotation.x = Math.PI / 2; rim.position.set(1.3, Yz(1.8), 0.03); rim.castShadow = true; group.add(rim);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.29, 48), own(new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.4 })));
    face.position.set(1.3, Yz(1.8), 0.062); group.add(face);

    // desks, monitors, chairs
    screens = [];
    for (let s = 0; s < layout.cols * layout.rows; s++) {
      const { x, y } = deskPos(s), c = chairPos(s), leg = shade(P.desk, 0.7);
      for (const [lx, ly] of [[0, 0], [1.52, 0], [0, 0.62], [1.52, 0.62]]) rbox(x + lx, y + ly, 0, 0.08, 0.08, 0.52, leg, 0.02);
      rbox(x, y, 0.52, 1.6, 0.7, 0.06, P.desk, 0.025);
      rbox(x + 0.75, y + 0.18, 0.58, 0.1, 0.08, 0.14, "#2a2e38", 0.02);
      rbox(x + 0.4, y + 0.14, 0.72, 0.8, 0.08, 0.5, "#2a2e38", 0.025);
      const sc = document.createElement("canvas"); sc.width = 128; sc.height = 80;
      const tex = own(new THREE.CanvasTexture(sc)); tex.colorSpace = THREE.SRGBColorSpace;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.72, Yz(0.42)), own(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
      scr.position.set(x + 0.8, Yz(0.97), y + 0.222); group.add(scr);
      screens[s] = { ctx: sc.getContext("2d"), tex, key: "" };
      rbox(x + 0.5, y + 0.42, 0.58, 0.6, 0.18, 0.025, "#3a3f4c", 0.01);
      cyl(x + 1.32, y + 0.37, 0.58, 0.065, 0.06, 0.14, "#f2efe9");
      cyl(x + 1.32, y + 0.37, 0.71, 0.055, 0.055, 0.012, "#6b4a2e");
      // chair
      cyl(c.x, c.y, 0, 0.035, 0.035, 0.3, "#20242c", 12);
      rbox(c.x - 0.22, c.y - 0.04, 0.0, 0.44, 0.08, 0.04, "#20242c", 0.015);
      rbox(c.x - 0.04, c.y - 0.22, 0.0, 0.08, 0.44, 0.04, "#20242c", 0.015);
      rbox(c.x - 0.28, c.y - 0.22, 0.3, 0.56, 0.5, 0.08, P.chair, 0.04);
      rbox(c.x - 0.28, c.y + 0.24, 0.38, 0.56, 0.07, 0.34, shade(P.chair, 1.1), 0.03);
    }

    // plant, water cooler, bookshelf
    cyl(W - 0.58, 0.48, 0, 0.2, 0.16, 0.4, "#b5674a");
    const leafA = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), roomMat("#3f9a5a", 0.7));
    leafA.position.set(W - 0.58, Yz(0.4) + 0.24, 0.48); leafA.scale.set(1, 0.85, 1);
    const leafB = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), roomMat("#4fb46a", 0.7));
    leafB.position.set(W - 0.55, Yz(0.4) + 0.5, 0.5);
    for (const l of [leafA, leafB]) { l.castShadow = true; l.receiveShadow = true; group.add(l); }
    rbox(W - 0.8, 1.35, 0, 0.4, 0.4, 0.75, "#e9edf2", 0.05);
    cyl(W - 0.6, 1.55, 0.75, 0.14, 0.15, 0.4, "#8cc8f0");
    rbox(0.05, D - 1.3, 0, 0.35, 1.0, 1.5, shade(P.desk, 0.75), 0.03);
    const books = ["#d9534f", "#4f8fe8", "#e3b341", "#45b07a", "#9b6ee0"];
    for (let s = 0; s < 3; s++) for (let b = 0; b < 5; b++)
      rbox(0.32, D - 1.25 + b * 0.18, 0.12 + s * 0.48, 0.09, 0.14, 0.3 + ((b + s) % 3) * 0.04, books[(b + s) % 5], 0.015);

    // the sun's shadow camera covers the whole room
    const S = Math.max(W, D) * 0.85;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 0.5, far: 60 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.set(W / 2, 0, D / 2);
    sun.position.set(W / 2 + 3, 14, D / 2 + 9);
  }

  // ---------- painted canvases ----------
  function paintClock(c, now) {
    const S = c.canvas.width, r = S / 2;
    c.setTransform(1, 0, 0, 1, r, r);
    const g = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#e9e7e0");
    c.fillStyle = g; c.fillRect(-r, -r, S, S);
    c.lineCap = "round"; c.strokeStyle = "#4a4f5c";
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, r0 = i % 3 ? 0.78 : 0.66;
      c.lineWidth = i % 3 ? 5 : 10;
      c.beginPath(); c.moveTo(Math.sin(a) * r0 * r, -Math.cos(a) * r0 * r); c.lineTo(Math.sin(a) * 0.9 * r, -Math.cos(a) * 0.9 * r); c.stroke();
    }
    const s = now.getSeconds() + (reduceMotion ? 0 : now.getMilliseconds() / 1000), mi = now.getMinutes() + s / 60, h = (now.getHours() % 12) + mi / 60;
    const hand = (frac, len, w, col) => {
      const a = frac * Math.PI * 2; c.lineWidth = w; c.strokeStyle = col;
      c.beginPath(); c.moveTo(-Math.sin(a) * 0.12 * r, Math.cos(a) * 0.12 * r); c.lineTo(Math.sin(a) * len * r, -Math.cos(a) * len * r); c.stroke();
    };
    hand(h / 12, 0.5, 13, "#2b2f3a"); hand(mi / 60, 0.74, 9, "#2b2f3a"); hand(s / 60, 0.82, 3.5, "#e0503c");
    c.fillStyle = "#2b2f3a"; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill();
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  function paintScreen(scr, slot, st, t) {
    const tick = st === "working" ? Math.floor(t * 2) : st === "needs_you" ? (Math.sin(t * 6) > 0 ? 1 : 0) : 0;
    const key = st + ":" + tick;
    if (scr.key === key) return;
    scr.key = key;
    const c = scr.ctx, W = c.canvas.width, H = c.canvas.height;
    c.textAlign = "center"; c.textBaseline = "middle";
    if (st === "working") {
      c.fillStyle = "#e3eeff"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#5a7bb5";
      for (let k = 0; k < 6; k++) {
        const lw = 0.2 + ((k * 0.31 + slot * 0.17 + tick * 0.13) % 1) * 0.55;
        c.fillRect(W * (0.08 + (k % 3 === 1 ? 0.06 : 0)), H * (0.12 + k * 0.13), W * lw * 0.8, H * 0.06);
      }
    } else if (st === "needs_you") {
      c.fillStyle = tick ? P.needs : shade(P.needs, 0.7); c.fillRect(0, 0, W, H);
      c.fillStyle = "#ffffff"; c.font = `800 ${H * 0.6}px -apple-system, sans-serif`; c.fillText("!", W / 2, H / 2 + 2);
    } else if (st === "your_turn") {
      c.fillStyle = "#2f6b52"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#bff0d6"; c.font = `800 ${H * 0.5}px -apple-system, sans-serif`; c.fillText("✓", W / 2, H / 2 + 2);
    } else { c.fillStyle = "#2b3242"; c.fillRect(0, 0, W, H); }
    scr.tex.needsUpdate = true;
  }

  const white = "#f5f2ea";
  return {
    name: "office",

    // ---------- people ----------
    look(id) {
      const L = baseLook(id), top = pick(HOODIES, L.h(1)), bottom = pick(L.woman ? SKIRTS : PANTS, L.h(5));
      return { ...L, top, bottom, legs: L.woman ? L.skin : bottom, shoes: L.woman ? "#f7f3ee" : "#3a3f4c" };
    },
    dress(F, L) {   // hoodie: hood, pocket and drawstrings
      const dark = vinyl(shade(L.top, 0.8));
      part(new THREE.SphereGeometry(0.1, 20, 14), dark, F.hips, 0, 0.262, -0.085).scale.set(1.25, 0.6, 0.6);
      part(rounded(0.13, 0.055, 0.03, 0.012), dark, F.hips, 0, 0.06, 0.095);
      for (const s of [-1, 1]) part(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), vinyl(white), F.hips, s * 0.03, 0.2, 0.1);
      return { labelY: 0.02 };
    },
    assign(e, ents) {
      if (e.t.desk != null) return;
      const used = new Set([...ents.values()].map(o => o.t.desk));
      let i = 0; while (used.has(i)) i++;
      e.t.desk = i;
    },
    layout(ents) {
      const maxSlot = Math.max(-1, ...[...ents.values()].map(e => e.t.desk ?? -1));
      const before = layout.cols + "x" + layout.rows;
      computeLayout(maxSlot + 1);
      return layout.cols + "x" + layout.rows !== before;
    },
    door: () => ({ in: DOOR_IN, out: DOOR_OUT, yaw: Math.PI / 2 }),
    home(e) { const c = chairPos(e.t.desk); return { x: c.x, y: c.y, yaw: Math.PI, seat: 0.38, fwd: 0.1, key: "d" + e.t.desk }; },
    pathHome(e) {
      const c = chairPos(e.t.desk), lane = laneY(e.t.desk);
      if (Math.abs(e.y - lane) < 0.05) return [{ x: c.x, y: lane }, c];
      return [{ x: AISLE_X, y: e.y }, { x: AISLE_X, y: lane }, { x: c.x, y: lane }, c];
    },
    pathOut(e) {
      // leave along a lane of their own, so nobody meets someone coming in head-on
      const out = laneY(e.t.desk) + 0.35, home = [{ x: LEAVE_X, y: DOOR_OUT.y }, { ...DOOR_OUT }];
      if (e.x < 1.1) return [{ x: LEAVE_X, y: e.y }, ...home];     // still in the aisles: turn straight back
      return [{ x: e.x, y: out }, { x: LEAVE_X, y: out }, ...home];
    },

    // what a seated person does in each state
    pose(e, p, { st, tt, m }) {
      if (st === "working") {   // typing, eyes on the screen
        p.hx = 0.12 + Math.sin(tt * 5) * 0.035 * m;
        for (const s of [-1, 1]) Object.assign(p.arm[s], { ux: -0.55, uz: s * 0.4, fx: -1.0 + Math.sin(tt * 13 + (s > 0 ? Math.PI : 0)) * 0.15 * m, fz: 0 });
      } else if (st === "needs_you") {   // looks over the shoulder at you and waves
        p.hy = -0.95; p.hz = 0.08;
        Object.assign(p.arm[-1], { ux: 0, uz: -2.55, fx: 0, fz: -(0.3 + 0.45 * Math.sin(tt * 9) * m) });
      }
    },

    // ---------- world ----------
    build,
    bounds() {
      const { W, D } = layout;
      return { x0: -0.2, x1: W, z0: -0.2, z1: D, y0: -0.15, y1: Yz(WALL_H) + 0.1 };
    },
    update(t, dt, ents) {
      paintSky(skyCtx, hourNow(), t, reduceMotion, { glare: true }); skyTex.needsUpdate = true;
      paintClock(clockCtx, new Date()); clockTex.needsUpdate = true;
      const byDesk = new Map([...ents.values()].map(e => [e.t.desk, e]));
      screens.forEach((scr, slot) => { const e = byDesk.get(slot); paintScreen(scr, slot, e && e.phase === "seated" ? e.data.state : "", t); });
    },
    dispose() { clear(); skyTex.dispose(); clockTex.dispose(); for (const m of matCache.values()) m.dispose(); },
  };
}

