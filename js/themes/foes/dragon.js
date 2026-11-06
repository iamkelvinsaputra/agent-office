// The red dragon Foe: its Big attack is a sweep of fire across the Party, it taunts with a roar, sleeps on its gold hoard.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/RoundedBoxGeometry.js";
import { vinyl, part, sphere } from "../../figure.js";
import { A0, DS, polar, angOf, yawTo, lerp, smooth, easeBy } from "./common.js";

const GOLD = "#e7b94a";

export function makeDragon(kit) {
  const { own, mesh, mat, addFx, glowMat, GEO } = kit;
  const root = new THREE.Group(); root.scale.setScalar(DS); root.rotation.y = A0;
  const body = new THREE.Group(); root.add(body);
  const red = own(new THREE.MeshPhysicalMaterial({ color: "#d8392b", roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.35 }));
  const belly = vinyl("#f4c68a"), horn = vinyl("#f3e7c9"), spike = vinyl("#f59a3a"), dark = vinyl("#3a1410");
  const memb = own(new THREE.MeshPhysicalMaterial({ color: "#ee6a45", roughness: 0.55, clearcoat: 0.2, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }));
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
    if (i % 4 === 2 && i < 16) P(new THREE.ConeGeometry(r * 0.35, r * 0.8, 10), spike, tail, p.x, p.y + r * 1.25, p.z);
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
  const lids = [], shines = [];
  for (const s of [-1, 1]) {
    P(sphere(0.045, 10, 8), dark, head, s * 0.12, -0.02, 0.92);
    const eye = P(sphere(0.15, 20, 16), vinyl("#ffd84a", false, "#ffb000"), head, s * 0.29, 0.12, 0.42); eye.scale.set(1, 1, 0.62);
    const pupil = P(sphere(0.055, 12, 10), dark, head, s * 0.31, 0.12, 0.5); pupil.scale.set(0.35, 1.25, 0.5);
    shines.push(P(sphere(0.02, 8, 6), own(new THREE.MeshBasicMaterial({ color: "#fff" })), head, s * 0.27, 0.19, 0.52));
    const lid = P(new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), red, head, s * 0.29, 0.12, 0.42);
    lid.scale.set(1, 1, 0.66); lid.rotation.x = -1.45; lids.push(lid);
    const brow = P(new THREE.CapsuleGeometry(0.045, 0.16, 4, 10), red, head, s * 0.27, 0.3, 0.38); brow.rotation.set(0, 0, s * 1.2);
    const h1 = P(new THREE.ConeGeometry(0.12, 0.55, 16), horn, head, s * 0.3, 0.42, -0.2); h1.rotation.set(-0.95, 0, s * -0.3);
    const h2 = P(new THREE.ConeGeometry(0.07, 0.28, 12), horn, head, s * 0.46, 0.2, -0.32); h2.rotation.set(-1.2, 0, s * -0.9);
    const fr = P(new THREE.ConeGeometry(0.08, 0.24, 10), spike, head, s * 0.58, -0.06, -0.08); fr.rotation.set(-0.6, 0, s * -1.5);
    P(new THREE.ConeGeometry(0.03, 0.08, 8), horn, head, s * 0.2, -0.33, 0.78).rotation.x = Math.PI;
  }
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
    part(new THREE.ShapeGeometry(sh, 8), memb, inner);
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

  const timing = { windup: 0.7, bigAttack: 2.0, recover: 0.7, taunt: 1.6 };
  let acc = 0;
  return {
    root, head, zzzY: 0.9, timing,
    recoil: { stiff: 55, damp: 5, kick: 0.5 },      // springy: it wobbles back into place

    scenery() {   // the hoard behind it
      const rnd = kit.rnd;
      const goldM = own(new THREE.MeshPhysicalMaterial({ color: GOLD, roughness: 0.3, metalness: 0.4, clearcoat: 0.6 }));
      for (let i = 0; i < 46; i++) {
        const a = A0 + Math.PI + (rnd() - 0.5) * 2.2, d = 1.1 + rnd() * 1.2, p = polar(d, a);
        const c = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 14), goldM, p.x, 0.02 + rnd() * 0.12 * (2.3 - d), p.y);
        c.rotation.set((rnd() - 0.5) * 1.2, 0, (rnd() - 0.5) * 1.2);
      }
      for (const [a, d, col] of [[0.6, 1.6, "#e2445c"], [-0.5, 1.9, "#46b4e8"], [0.1, 2.1, "#5ad08a"]]) {
        const p = polar(d, A0 + Math.PI + a);
        mesh(new THREE.OctahedronGeometry(0.09), own(new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.15, clearcoat: 1 })), p.x, 0.12, p.y);
      }
      const chestP = polar(2.0, A0 + Math.PI - 0.95), chest = new THREE.Group();
      chest.position.set(chestP.x, 0, chestP.y); chest.rotation.y = yawTo(chestP, { x: 0, y: 0 }) + 0.4; kit.group.add(chest);
      mesh(new RoundedBoxGeometry(0.5, 0.26, 0.34, 2, 0.03), mat("#8a5a36", 0.7), 0, 0.13, 0, chest);
      mesh(new RoundedBoxGeometry(0.52, 0.12, 0.36, 2, 0.05), mat("#9c6a40", 0.7), 0, 0.31, -0.02, chest).rotation.x = -0.35;
      for (const dx of [-0.17, 0.17]) mesh(new THREE.BoxGeometry(0.04, 0.27, 0.355), goldM, dx, 0.135, 0, chest);
      mesh(new THREE.SphereGeometry(0.14, 16, 10), goldM, 0, 0.3, 0.05, chest).scale.y = 0.5;
    },

    animate({ t, dt, m, sleep: s, mode, modeT, dir, hit, flinch, reduceMotion }) {
      let neckX = 0.04 * Math.sin(t * 0.8) * m, headX = 0.05 * Math.sin(t * 0.9 + 1) * m, jawX = 0.04 + 0.03 * Math.sin(t * 0.7) * m;
      let headY = 0.18 * Math.sin(t * 0.33) * m, spread = 0, flap = 0.07 * Math.sin(t * 1.4) * m, armUp = 0;
      if (mode === "windup") { neckX = -0.3; headX = -0.25; jawX = 0.25; headY = 0.55 * dir; armUp = 0.3; }
      if (mode === "bigAttack") {   // fire breath: puffs from the mouth to the ground just in front of the warriors
        const f = modeT / timing.bigAttack;
        neckX = 0.32; headX = 0.38; jawX = 0.62; headY = lerp(0.55, -0.55, smooth(0, 1, f)) * dir; armUp = 0.2;
        const sweep = A0 - headY;
        const to = new THREE.Vector3(2.25 * Math.cos(sweep), 0.15, 2.25 * Math.sin(sweep));
        const from = mouth.getWorldPosition(new THREE.Vector3());
        acc += dt * 55;
        while (acc > 1) { acc--; breathPuff(from, to); }
        flinch(e => Math.abs(Math.atan2(Math.sin(angOf(e) - sweep), Math.cos(angOf(e) - sweep))) < 0.22);
      }
      // taunt: a roar
      if (mode === "taunt") { const k = Math.sin(Math.min(1, modeT / timing.taunt) * Math.PI); neckX = -0.35 * k; headX = -0.5 * k; jawX = 0.75 * k; spread = 0.45 * k; flap = 0.25 * Math.sin(t * 9) * k; armUp = 0.6 * k; headY = 0.1 * Math.sin(t * 20) * k; }
      // asleep: head down, wings folded, eyes shut, slow breathing
      neckX = lerp(neckX, 0.42, s); headX = lerp(headX, 0.32, s); jawX = lerp(jawX, 0, s); headY = lerp(headY, 0.25, s);
      spread = lerp(spread, -1.1, s); flap *= 1 - s; armUp *= 1 - s;
      // hit: the head jerks back a little (the body recoil is done by the theme)
      headX -= 0.3 * hit; neckX -= 0.1 * hit;
      const ap = easeBy(reduceMotion ? 1 : Math.min(1, dt * 6));
      ap(neck.rotation, "x", neckX); ap(head.rotation, "x", headX); ap(head.rotation, "y", headY); ap(jaw.rotation, "x", jawX);
      wings.forEach((w, i) => { const sg = i ? 1 : -1; ap(w.rotation, "y", sg * (0.55 - spread * 0.6)); ap(w.rotation, "z", sg * (-0.15 + spread * 0.6 + flap)); });
      arms.forEach(a => ap(a.rotation, "x", -armUp * 1.2));
      tail.rotation.y = 0.08 * Math.sin(t * 0.9) * m * (1 - s * 0.7);
      const br = Math.sin(t * (s > 0.5 ? 1.1 : 1.9)) * m;
      body.scale.set(1 + 0.012 * br, 1 + 0.02 * br, 1 + 0.012 * br);
      body.position.y = -0.08 * s;
      // eyes: shut while asleep, an occasional blink, and a squint while being hit
      const shut = Math.max(s > 0.6 ? 1 : 0, (t % 5.3) < 0.15 && m ? 1 : 0);
      const lidK = Math.max(shut, 0.55 * hit);
      for (const lid of lids) lid.rotation.x = lerp(-1.45, 0.05, lidK);
      for (const sh of shines) sh.visible = !shut;
    },
  };
}
