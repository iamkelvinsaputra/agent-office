// Shared toy-figurine body used by every theme: chibi proportions, soft-vinyl finish.
// Themes pick the colours (the "look") and add their own clothes and props on top.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/RoundedBoxGeometry.js";

export const K = 1.25, LEG = 0.165, HR = 0.19;        // figure scale, standing hip height, head radius

// ---------- small helpers ----------
export function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
export const pick = (arr, h) => arr[h % arr.length];
export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex), c = v => Math.max(0, Math.min(255, Math.round(v * f)));
  return "#" + [c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, "0")).join("");
}
export function mix(hex, to, a) {
  const [r, g, b] = hexToRgb(hex), [r2, g2, b2] = hexToRgb(to), c = (u, v) => Math.round(u + (v - u) * a);
  return "#" + [c(r, r2), c(g, g2), c(b, b2)].map(v => v.toString(16).padStart(2, "0")).join("");
}

export const SKINS = ["#f6d7bf", "#f1c9a5", "#e0ac83", "#c68a5e", "#9a6440"];
export const HAIRS = ["#2b2220", "#5a3a22", "#8a4a2a", "#c9a25a", "#1c1c24", "#b8643a", "#e6dccb"];
export const WOMAN_HAIR = ["ponytail", "bun", "long", "bob"], MAN_HAIR = ["short", "swept", "curly"];

// The parts of a look every theme shares. Everything comes from the session id, so it never changes on reload.
export function baseLook(id) {
  const h = k => hash(id + "#" + k);
  const woman = ((hash(id) >>> 12) & 1) === 1;
  return {
    woman, skin: pick(SKINS, h(2)), hair: pick(HAIRS, h(3)), style: pick(woman ? WOMAN_HAIR : MAN_HAIR, h(4)),
    seed: (h(8) % 1000) / 1000, h,
  };
}

// ---------- materials and parts ----------
const vinylCache = new Map();
export function vinyl(color, double = false, glow = null) {   // soft-vinyl toy finish
  const k = color + double + glow;
  if (!vinylCache.has(k)) vinylCache.set(k, new THREE.MeshPhysicalMaterial({
    color, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.45, side: double ? THREE.DoubleSide : THREE.FrontSide,
    emissive: glow || "#000000", emissiveIntensity: glow ? 0.9 : 0,
    shadowSide: THREE.BackSide }));   // back-face shadows avoid striped acne on thin shells
  return vinylCache.get(k);
}
export function metal(color) {   // painted-metal toy finish: a bit shinier than vinyl
  const k = "metal" + color;
  if (!vinylCache.has(k)) vinylCache.set(k, new THREE.MeshPhysicalMaterial({
    color, roughness: 0.3, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, shadowSide: THREE.BackSide }));
  return vinylCache.get(k);
}
const FLAT = {};
export function flat(name, make) { return FLAT[name] || (FLAT[name] = make()); }
export function part(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
export const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
export const rounded = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
export const onHead = (r, a, b) => new THREE.Vector3(r * Math.cos(b) * Math.sin(a), r * Math.sin(b), r * Math.cos(b) * Math.cos(a));
export const faceOut = (m, a, b) => m.rotation.set(-b, a, 0, "YXZ");   // point a mesh's +Z along a head normal
// A partial sphere shell over the back and sides of the head, open at the face.
export function headShell(parent, mat, r, open, theta, sx = 1) {
  const m = part(new THREE.SphereGeometry(r, 40, 22, Math.PI / 2 + open / 2, Math.PI * 2 - open, 0, theta), mat, parent);
  m.scale.x = sx; return m;
}

// ---------- the figure ----------
// L: { woman, skin, hair, style, top, sleeve?, bottom, legs, shoes, robe?, hat?, seed }
// The figure faces +Z. Arm s = -1 is its right arm, s = +1 its left.
export function makeFigure(L) {
  const root = new THREE.Group(); root.scale.setScalar(K);
  const hips = new THREE.Group(); root.add(hips);
  const top = vinyl(L.top), sleeve = vinyl(L.sleeve || L.top), skin = vinyl(L.skin), bottom = vinyl(L.bottom);
  const hairM = vinyl(L.hair, true);

  // body
  const torso = part(new THREE.CapsuleGeometry(0.115, 0.1, 6, 20), top, hips, 0, 0.13, 0);
  torso.scale.set(L.woman ? 1.0 : 1.12, 1, 0.88);
  if (L.robe) part(new THREE.CylinderGeometry(0.108, 0.175, 0.15, 28), bottom, hips, 0, -0.045, 0);
  else if (L.woman) part(new THREE.CylinderGeometry(0.105, 0.16, 0.11, 28), bottom, hips, 0, -0.025, 0);
  else part(new THREE.CylinderGeometry(0.105, 0.1, 0.06, 20), bottom, hips, 0, 0, 0);

  const legs = [-1, 1].map(s => {
    const g = new THREE.Group(); g.position.set(s * 0.05, 0, 0); hips.add(g);
    part(new THREE.CapsuleGeometry(L.woman ? 0.034 : 0.042, 0.07, 4, 10), vinyl(L.legs), g, 0, -0.07, 0);
    part(sphere(0.05), vinyl(L.shoes), g, 0, -0.135, 0.02).scale.set(0.9, 0.6, 1.3);
    return g;
  });
  const shX = L.woman ? 0.118 : 0.135;
  const arms = [-1, 1].map(s => {
    const sh = new THREE.Group(); sh.position.set(s * shX, 0.235, 0); hips.add(sh);
    part(new THREE.CapsuleGeometry(0.036, 0.06, 4, 10), sleeve, sh, 0, -0.05, 0);
    const el = new THREE.Group(); el.position.y = -0.1; sh.add(el);
    part(new THREE.CapsuleGeometry(0.034, 0.05, 4, 10), sleeve, el, 0, -0.045, 0);
    const hand = part(sphere(0.037), skin, el, 0, -0.1, 0);
    sh.rotation.z = s * 0.12;
    return { s, sh, el, hand };
  });

  // head
  const head = new THREE.Group(); head.position.y = 0.28; hips.add(head);
  const skull = new THREE.Group(); skull.position.y = 0.17; head.add(skull);
  part(sphere(HR, 36, 28), skin, skull);
  for (const s of [-1, 1]) { const p = onHead(HR * 0.96, s * Math.PI / 2, -0.25); part(sphere(0.036), skin, skull, p.x, p.y, p.z); }
  const eyeM = flat("eye", () => new THREE.MeshStandardMaterial({ color: "#2b2230", roughness: 0.25 }));
  const shineM = flat("shine", () => new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const blushM = flat("blush", () => new THREE.MeshBasicMaterial({ color: "#ff8a9a", transparent: true, opacity: 0.45, depthWrite: false }));
  const mouthM = flat("mouth", () => new THREE.MeshStandardMaterial({ color: "#7a4a44", roughness: 0.6 }));
  const eyes = [-1, 1].map(s => {
    const a = s * 0.36, b = -0.12, p = onHead(HR * 0.985, a, b);
    const eye = part(sphere(0.026, 14, 10), eyeM, skull, p.x, p.y, p.z); faceOut(eye, a, b); eye.scale.set(0.8, 1.2, 0.45);
    const q = onHead(HR * 1.005, a + 0.05, b + 0.05); part(sphere(0.008, 8, 6), shineM, skull, q.x, q.y, q.z);
    const c = onHead(HR * 1.004, s * 0.62, -0.3);
    const blush = part(new THREE.CircleGeometry(0.032, 18), blushM, skull, c.x, c.y, c.z); faceOut(blush, s * 0.62, -0.3);
    blush.castShadow = false;
    return eye;
  });
  const mp = onHead(HR * 0.995, 0, -0.34);
  const mouth = part(new THREE.TorusGeometry(0.016, 0.0045, 6, 14, Math.PI), mouthM, skull, mp.x, mp.y, mp.z);
  mouth.rotation.set(0.34, 0, Math.PI, "YXZ");

  // hair: a shell over the back and sides (open at the face) plus a fringe cap.
  // Under a hat or helmet, anything that would poke through the top is left out.
  part(new THREE.SphereGeometry(HR * 1.045, 40, 12, 0, Math.PI * 2, 0, 1.05), hairM, skull).rotation.x = 0.38;
  let ponyPivot = null;
  const R1 = HR * 1.05;
  if (L.style === "short" || L.style === "swept" || L.style === "curly") headShell(skull, hairM, R1, 2.0, 1.95);
  if (L.style === "swept" && !L.hat) {   // a little volume on top, combed to one side
    const t = part(sphere(0.13, 28, 18), hairM, skull, 0.035, 0.13, 0.05);
    t.scale.set(1.35, 0.5, 1.25); t.rotation.z = -0.22;
  }
  if (L.style === "curly") {
    for (let i = 0; i < (L.hat ? 8 : 16); i++) {
      const a = Math.PI * 0.3 + (i % 8) * (Math.PI * 1.4 / 7), b = i < 8 ? 0.25 : 0.85;
      const p = onHead(R1, a, b); part(sphere(0.06), hairM, skull, p.x, p.y, p.z);
    }
    if (!L.hat) { const p = onHead(R1, 0, 1.25); part(sphere(0.07), hairM, skull, p.x, p.y, p.z); }
  }
  if (L.style === "bob") headShell(skull, hairM, HR * 1.08, 1.5, 2.35, 1.05);
  if (L.style === "long") {
    headShell(skull, hairM, HR * 1.07, 1.6, 2.4);
    part(sphere(HR, 28, 20), hairM, skull, 0, -0.2, -0.1).scale.set(1.0, 1.45, 0.45);
  }
  if (L.style === "ponytail" || L.style === "bun") headShell(skull, hairM, R1, 1.9, 2.0);
  if (L.style === "ponytail") {
    const p = onHead(R1, Math.PI, 0.15);
    part(sphere(0.035), vinyl(L.top), skull, p.x, p.y, p.z);
    ponyPivot = new THREE.Group(); ponyPivot.position.copy(p); skull.add(ponyPivot);
    part(sphere(0.075, 20, 16), hairM, ponyPivot, 0, -0.12, -0.03).scale.set(0.75, 1.7, 0.75);
  }
  if (L.style === "bun") { const p = onHead(R1, Math.PI, L.hat ? 0.25 : 0.75); part(sphere(0.085), hairM, skull, p.x, p.y, p.z); }

  return { root, hips, torso, legs, arms, head, skull, eyes, ponyPivot };
}

export function disposeFigure(F) {
  F.root.traverse(o => o.geometry && o.geometry.dispose());
}

// ---------- animation ----------
export const bump = (t, period, dur) => { const p = ((t % period) + period) % period; return p < dur ? Math.sin(p / dur * Math.PI) : 0; };
export function angleTo(a, b, k) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * k; }
