// The earth golem Foe: mossy boulders with steady amber runes and a crystal heart. Its Big attack is a ground slam
// (a dust shockwave rolls out under the Party), it taunts by pounding its chest, and crouches into a mossy hill to sleep.
import * as THREE from "three";
import { A0, DS, polar, radOf, lerp, smooth, easeBy } from "./common.js";

const STONE = "#8f8478", STONE_D = "#766a60", MOSS = "#5f8a3a", MOSS_L = "#7aa349", DUST = "#c9b89a";
const WAVE_FROM = 1.3, WAVE_SPEED = 4.1;   // shockwave: starting radius (world units), how fast it rolls out

export function makeGolem(kit) {
  const { own, mesh, mat, addFx, GEO } = kit;
  const stone = own(new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.95, flatShading: true }));
  const stoneD = own(new THREE.MeshStandardMaterial({ color: STONE_D, roughness: 0.95, flatShading: true }));
  const moss = own(new THREE.MeshStandardMaterial({ color: MOSS, roughness: 1, flatShading: true }));
  const mossL = own(new THREE.MeshStandardMaterial({ color: MOSS_L, roughness: 1, flatShading: true }));
  // the glow is steady; it only fades slowly as the golem falls asleep and returns slowly as it wakes
  const rune = own(new THREE.MeshStandardMaterial({ color: "#6a4418", emissive: "#ffb040", emissiveIntensity: 1.1, roughness: 0.6 }));
  const core = own(new THREE.MeshPhysicalMaterial({ color: "#ffcf7a", emissive: "#ff9a2a", emissiveIntensity: 1.2, roughness: 0.15, clearcoat: 1, flatShading: true }));

  const rock = (r, m, parent, x, y, z, sx = 1, sy = 1, sz = 1, detail = 1) => {
    const o = mesh(new THREE.IcosahedronGeometry(r, detail), m, x, y, z, parent); o.scale.set(sx, sy, sz); return o;
  };
  // a glowing crack on an ellipsoid surface (radii rx, ry, rz), from (x0, y0) to (x1, y1) seen from the front
  const crack = (parent, rx, ry, rz, x0, y0, x1, y1, w = 0.035) => {
    const zOn = (x, y) => rz * Math.sqrt(Math.max(0.05, 1 - (x / rx) ** 2 - (y / ry) ** 2));
    const a = new THREE.Vector3(x0, y0, zOn(x0, y0)), b = new THREE.Vector3(x1, y1, zOn(x1, y1));
    const c = mesh(new THREE.BoxGeometry(w, a.distanceTo(b), w), rune, 0, 0, 0, parent);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    c.castShadow = false;
  };

  const root = new THREE.Group(); root.scale.setScalar(DS); root.rotation.y = A0;
  const body = new THREE.Group(); root.add(body);
  // long, thick legs: a shin and a thigh each, on broad flat feet
  for (const s of [-1, 1]) {
    rock(0.32, stone, body, s * 0.47, 0.1, 0.12, 1.15, 0.45, 1.35, 0);
    rock(0.36, stoneD, body, s * 0.43, 0.44, 0, 1.0, 1.05, 1.0);
    rock(0.34, stone, body, s * 0.4, 0.86, -0.03, 1.05, 1.0, 1.05);
  }
  // torso: separate stones stacked with small gaps, a wide hip stone, a narrow waist stone, then a broad chest stone
  // that leans forward and carries the shoulders; a dark core inside shows through the gaps
  const torso = new THREE.Group(); torso.position.set(0, 1.0, 0); body.add(torso);
  rock(0.32, stoneD, torso, 0, 0.5, 0, 1.05, 1.8, 0.9);    // core
  const layer = (y, z, tilt, r, sx, sy, sz, m = stone) => {   // a stone with its own frame, so cracks can sit on it
    const g = new THREE.Group(); g.position.set(0, y, z); g.rotation.x = tilt; torso.add(g);
    rock(r, m, g, 0, 0, 0, sx, sy, sz);
    return Object.assign(g, { R: [r * sx, r * sy, r * sz] });
  };
  const hips = layer(0, -0.02, 0, 0.4, 1.5, 0.43, 1.0, stoneD);
  const waist = layer(0.385, 0.04, 0.06, 0.38, 1.15, 0.47, 0.9);
  const chest = layer(1.0, 0.1, 0.15, 0.5, 1.7, 0.8, 1.2);
  rock(0.45, stoneD, chest, 0, 0.06, -0.5, 1.3, 0.75, 0.8);                    // back hump
  for (const [x, y, z, r] of [[-0.5, 0.3, -0.25, 0.26], [0.5, 0.28, -0.3, 0.24], [0, 0.34, -0.42, 0.28], [0.1, 0.22, -0.8, 0.24]]) rock(r, moss, chest, x, y, z, 1.2, 0.45, 1.1);
  for (const [g, x, y, z, r] of [[chest, -0.72, 0.18, 0.25, 0.15], [waist, 0.36, 0.1, 0.12, 0.12], [hips, -0.48, 0.08, 0.2, 0.12]]) rock(r, mossL, g, x, y, z, 1.3, 0.5, 1.2);
  const heart = mesh(new THREE.OctahedronGeometry(0.18), core, 0, -0.08, chest.R[2] - 0.04, chest); heart.scale.set(0.85, 1.25, 0.6);
  // jagged, uneven cracks: a couple run out from the heart, others split the stones on their own
  for (const [g, paths] of [
    [chest, [[[0.1, 0.04], [0.18, 0.16], [0.34, 0.2], [0.42, 0.34]], [[-0.12, -0.14], [-0.28, -0.08], [-0.36, -0.22], [-0.52, -0.26]], [[-0.4, 0.3], [-0.3, 0.18], [-0.36, 0.06]], [[0.56, 0.0], [0.64, -0.14], [0.56, -0.28]]]],
    [waist, [[[-0.08, 0.12], [0.02, 0.02], [0.14, -0.06], [0.1, -0.16]]]],
    [hips, [[[0.18, 0.08], [0.28, -0.02], [0.24, -0.12]], [[-0.3, 0.1], [-0.4, -0.04]]]]])
    for (const path of paths) for (let i = 1; i < path.length; i++) crack(g, ...g.R, ...path[i - 1], ...path[i], 0.03);
  // head: small, set low into the top of the chest, glowing eye slits under a heavy brow
  const head = new THREE.Group(); head.position.set(0, 1.4, 0.68); torso.add(head);
  rock(0.3, stone, head, 0, 0, 0, 1.15, 0.85, 1);
  const brow = mesh(new THREE.BoxGeometry(0.46, 0.09, 0.12), stoneD, 0, 0.09, 0.22, head); brow.rotation.x = 0.25;
  for (const s of [-1, 1]) { const e = mesh(new THREE.BoxGeometry(0.1, 0.035, 0.04), rune, s * 0.11, 0.015, 0.28, head); e.rotation.z = s * -0.18; e.castShadow = false; }   // eye slits
  rock(0.17, mossL, head, 0.04, 0.22, -0.04, 1.3, 0.5, 1.2);
  // long arms: shoulder boulder, upper arm, forearm, a big fist whose knuckles reach the ground
  const arms = [-1, 1].map(s => {
    const g = new THREE.Group(); g.position.set(s * 1.05, 1.92, 0.1); body.add(g);
    rock(0.44, stoneD, g, s * 0.05, 0.05, 0, 1, 0.9, 1);
    rock(0.22, moss, g, s * 0.05, 0.38, -0.05, 1.4, 0.45, 1.3);
    rock(0.28, stone, g, s * 0.06, -0.4, 0.04, 1, 1.25, 1);
    const fore = rock(0.3, stone, g, s * 0.04, -0.9, 0.12, 1, 1.3, 1);
    crack(fore, 0.3, 0.3, 0.3, -0.05, 0.12, 0.08, -0.14, 0.03);
    rock(0.36, stoneD, g, 0, -1.42, 0.2, 1.1, 0.95, 1.15);
    const fist = new THREE.Object3D(); fist.position.set(0, -1.5, 0.25); g.add(fist);
    return Object.assign(g, { s, fist });
  });

  // ---------- effects: dust, chips, rubble, the shockwave (all matte, none of it glows) ----------
  const dustMat = (col = DUST, op = 0.5) => new THREE.MeshStandardMaterial({ color: col, roughness: 1, transparent: true, opacity: op, depthWrite: false });
  function dust(p, size, dur = 0.7, rise = 0.25, col) {
    const b = new THREE.Mesh(GEO.ball, dustMat(col)), p0 = p.clone();
    addFx(b, dur, f => { b.position.copy(p0); b.position.y += rise * f; b.scale.setScalar(size * (0.4 + f)); b.material.opacity = 0.5 * (1 - f); });
  }
  function chunk(p, vel, size, dur = 0.8, col = STONE) {   // a rock thrown up that falls back down
    const c = new THREE.Mesh(GEO.chip, new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, flatShading: true, transparent: true }));
    const p0 = p.clone(), v = vel.clone(), spin = new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0);
    c.scale.setScalar(size); c.castShadow = true;
    addFx(c, dur, f => {
      const tt = f * dur;
      c.position.set(p0.x + v.x * tt, Math.max(0.03, p0.y + v.y * tt - 4.9 * tt * tt), p0.z + v.z * tt);
      c.rotation.set(spin.x * tt, spin.y * tt, 0);
      c.material.opacity = f < 0.75 ? 1 : 1 - (f - 0.75) / 0.25;
    });
  }
  function shockwave(to, dur) {
    const ring = new THREE.Mesh(GEO.flatRing, new THREE.MeshStandardMaterial({ color: DUST, roughness: 1, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    addFx(ring, dur, f => { ring.scale.setScalar(lerp(WAVE_FROM, to, f)); ring.material.opacity = 0.6 * (1 - f); });
    for (const a of fistsWorld()) {
      dust(a, 0.5, 0.9, 0.3);
      for (let i = 0; i < 4; i++) {
        const h = Math.random() * Math.PI * 2;
        chunk(a, new THREE.Vector3(Math.cos(h) * 1.2, 2.2 + Math.random(), Math.sin(h) * 1.2), 0.05 + Math.random() * 0.04, 0.9);
      }
    }
  }
  const fistsWorld = () => arms.map(a => a.fist.getWorldPosition(new THREE.Vector3()).setY(0.1));
  function pebbles() {   // shaken loose from the shoulders by a chest-pound
    for (const a of arms) {
      const p = a.getWorldPosition(new THREE.Vector3()); p.y += 0.4;
      for (let i = 0; i < 3; i++) chunk(p, new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8), 0.03 + Math.random() * 0.02, 1.0, i % 2 ? STONE : MOSS);
    }
  }

  const timing = { windup: 0.85, bigAttack: 1.9, recover: 0.8, taunt: 1.6 };
  let glow = null, waveAt = -1, wave = { to: 0, dur: 1 }, pounded = 0, lastMode = "", lastModeT = 0;
  return {
    root, head, zzzY: 0.85, timing,
    hit: new THREE.Vector3(0, 1.85, 0.6),          // front of the chest stone
    recoil: { stiff: 110, damp: 18, kick: 0.42 },    // heavy: a stiff jolt, hardly any wobble

    scenery() {   // standing stones and amber crystals behind it
      const rnd = kit.rnd;
      for (let i = 0; i < 5; i++) {
        const a = A0 + Math.PI + (i - 2) * 0.42 + (rnd() - 0.5) * 0.1, d = 2.05 + (i % 2) * 0.25, p = polar(d, a), h = 0.75 + rnd() * 0.45;
        const st = mesh(new THREE.BoxGeometry(0.3, h, 0.22, 1, 2, 1), mat(STONE, 0.95, true), p.x, h / 2 - 0.02, p.y);
        st.rotation.set((rnd() - 0.5) * 0.12, a + Math.PI / 2, (rnd() - 0.5) * 0.15);
        mesh(new THREE.IcosahedronGeometry(0.15, 0), mat(MOSS, 1, true), p.x, h - 0.02, p.y).scale.set(1.2, 0.4, 1);
      }
      const crystal = own(new THREE.MeshPhysicalMaterial({ color: "#ffd08a", emissive: "#ff9a2a", emissiveIntensity: 0.55, roughness: 0.15, clearcoat: 1, flatShading: true }));
      for (const [da, d, n] of [[0.55, 1.45, 4], [-0.65, 1.6, 3], [0.05, 2.6, 3]]) {
        const c = polar(d, A0 + Math.PI + da);
        for (let i = 0; i < n; i++) {
          const s = 0.07 + rnd() * 0.07, x = mesh(new THREE.OctahedronGeometry(1), crystal, c.x + (rnd() - 0.5) * 0.25, s * 1.6, c.y + (rnd() - 0.5) * 0.25);
          x.scale.set(s, s * 2.4, s); x.rotation.set((rnd() - 0.5) * 0.7, rnd() * 3, (rnd() - 0.5) * 0.7);
        }
        mesh(new THREE.IcosahedronGeometry(0.16, 0), mat(STONE_D, 0.95, true), c.x, 0.04, c.y).scale.set(1.4, 0.4, 1.4);
      }
    },

    onHit(at, dir) {   // a few stone chips and a puff of dust break off where the hit lands
      const back = dir.clone().multiplyScalar(-1);
      dust(at, 0.28, 0.6, 0.15);
      for (let i = 0; i < 3; i++) chunk(at, new THREE.Vector3(back.x * 0.9 + (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.8, back.z * 0.9 + (Math.random() - 0.5) * 0.8), 0.025 + Math.random() * 0.025, 0.7);
    },

    animate({ t, dt, m, sleep: s, mode, modeT, flinch, reduceMotion }) {
      if (mode !== lastMode || modeT < lastModeT) pounded = 0;
      lastMode = mode; lastModeT = modeT;
      let armX = [-0.12, -0.12], armZ = [0, 0], lean = 0.04 * Math.sin(t * 0.5) * m, crouch = 0;
      let headX = 0.04 * Math.sin(t * 0.7) * m, headY = 0.2 * Math.sin(t * 0.33) * m, fast = false;
      armX = armX.map((v, i) => v + 0.05 * Math.sin(t * 0.8 + i * 2) * m);
      if (mode === "windup") {   // both fists raised high
        const f = smooth(0, 1, modeT / timing.windup);
        armX = [-2.75 * f, -2.75 * f]; armZ = [0.25 * f, 0.25 * f]; lean = -0.22 * f; headX = -0.25 * f;
      }
      if (mode === "bigAttack") {   // slam: fists come down fast, a dust shockwave rolls out under the party
        armX = [-0.55, -0.55]; armZ = [0.12, 0.12]; lean = 0.42; crouch = 0.22; headX = 0.1; fast = modeT < 0.25;
        if (modeT >= 0.16 && waveAt < 0) {   // out to the far edge of the Party
          const to = kit.reach() + 0.4;
          waveAt = t; wave = { to, dur: (to - WAVE_FROM) / WAVE_SPEED };
          if (m) shockwave(wave.to, wave.dur);
        }
        if (modeT > 1.0) { const f = smooth(1.0, timing.bigAttack, modeT); lean = lerp(0.42, 0.15, f); crouch = lerp(0.22, 0.05, f); }
      }
      if (waveAt >= 0) {   // fighters flinch as the ring reaches them
        const R = lerp(WAVE_FROM, wave.to, (t - waveAt) / wave.dur);
        if (t - waveAt > wave.dur) waveAt = -1;
        else flinch(e => Math.abs(radOf(e) - R) < 0.4);
      }
      if (mode === "taunt") {   // chest-pound: rise up, pound twice (right, left), pebbles shake loose
        const f = modeT / timing.taunt, up = Math.sin(Math.min(1, f) * Math.PI);
        lean = -0.2 * up; headX = -0.35 * up; crouch = -0.06 * up;
        for (const [i, at] of [[1, 0.3], [0, 0.62]]) {
          const k = Math.max(0, 1 - Math.abs(f - at) / 0.16);
          armX[i] = lerp(-0.4 * up, -1.55, smooth(0, 1, k)); armZ[i] = lerp(0, 0.75, smooth(0, 1, k));
        }
        for (const due = (f >= 0.3) + (f >= 0.62); pounded < due; pounded++) if (m) pebbles();
      }
      // asleep: crouched into a mossy hill, arms folded on the ground, head down
      armX = armX.map(v => lerp(v, -0.75, s)); armZ = armZ.map(v => lerp(v, 0.42, s));
      lean = lerp(lean, 0.38, s); crouch = lerp(crouch, 0.38, s); headX = lerp(headX, 0.5, s); headY = lerp(headY, 0, s);
      const ap = easeBy(reduceMotion ? 1 : Math.min(1, dt * (fast ? 22 : 6)));
      arms.forEach((a, i) => { ap(a.rotation, "x", armX[i]); ap(a.rotation, "z", -a.s * armZ[i]); });
      ap(body.rotation, "x", lean); ap(body.position, "y", -crouch); ap(head.rotation, "x", headX); ap(head.rotation, "y", headY);
      const br = Math.sin(t * (s > 0.5 ? 0.9 : 1.5)) * m;
      torso.scale.set(1 + 0.01 * br, 1 + 0.015 * br, 1 + 0.01 * br);
      // runes, eyes and heart fade over about two seconds as it falls asleep, and come back as slowly
      if (glow === null) glow = s > 0.5 ? 0 : 1;   // built asleep: start dark
      glow += ((s > 0.5 ? 0 : 1) - glow) * Math.min(1, dt * 1.2);
      rune.emissiveIntensity = 1.1 * glow; core.emissiveIntensity = 1.2 * glow;
    },
  };
}
