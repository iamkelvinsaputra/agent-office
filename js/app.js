// Agent Office page: one 3D scene (the current theme), the people in it, name tags, and the session list.
import * as THREE from "three";
import { K, LEG, HR, makeFigure, disposeFigure, bump, angleTo } from "./figure.js";
import { entities, isWalking, setCrowdTheme, syncEntities, settleAll, stepEntities } from "./crowd.js";
import { createOfficeTheme } from "./themes/office.js";
import { createFantasyTheme, FOES } from "./themes/fantasy.js";

const THEMES = { office: createOfficeTheme, fantasy: createFantasyTheme };
const STATE_LABEL = { needs_you: "needs you", working: "working", your_turn: "your turn" };
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const stage = document.getElementById("stage"), labelsEl = document.getElementById("labels");
const ZS = 0.8;

// ---------- 3D setup ----------
let gl = null, renderer, scene, camera, sun, hemi, amb;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  gl = renderer.getContext();
} catch (err) { console.warn("WebGL unavailable", err); }
if (!gl) document.getElementById("nogl").style.display = "block";

if (gl) {
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  stage.prepend(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  hemi = new THREE.HemisphereLight(0xffffff, 0xd9cbb6, 1.7);
  amb = new THREE.AmbientLight(0xffffff, 0.25);
  sun = new THREE.DirectionalLight(0xfff6ea, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
  scene.add(hemi, amb, sun, sun.target);
}
function resetLights() {
  hemi.color.set(0xffffff); hemi.groundColor.set(0xd9cbb6); hemi.intensity = 1.7;
  amb.intensity = 0.25; sun.color.set(0xfff6ea); sun.intensity = 2.1;
}

// ---------- camera: fixed dimetric view that frames the whole scene ----------
const CAM_DIR = (() => { const el = Math.PI / 6; return new THREE.Vector3(Math.cos(el) * Math.SQRT1_2, Math.sin(el), Math.cos(el) * Math.SQRT1_2); })();
let lastSize = "";
function frameCamera(force) {
  const r = stage.getBoundingClientRect(), size = r.width + "x" + r.height;
  if (!force && size === lastSize) return;
  lastSize = size;
  renderer.setSize(r.width, r.height, false);
  // the theme gives a box, or a list of points that must all be in view
  const b = theme.bounds(), pts = b.points || [];
  if (!b.points) for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const y of [b.y0, b.y1]) pts.push([x, y, z]);
  const center = new THREE.Vector3();
  for (const q of pts) center.add(new THREE.Vector3(...q));
  center.divideScalar(pts.length);
  camera.position.copy(center).addScaledVector(CAM_DIR, 60);
  camera.up.set(0, 1, 0); camera.lookAt(center); camera.updateMatrixWorld();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of pts) {
    const p = new THREE.Vector3(...q).applyMatrix4(camera.matrixWorldInverse);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const pad = 28, top = 26;   // extra room on top for name tags
  const s = Math.max((x1 - x0) / (r.width - pad * 2), (y1 - y0) / (r.height - pad * 2 - top));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + top * s / 2;
  Object.assign(camera, { left: cx - r.width * s / 2, right: cx + r.width * s / 2, top: cy + r.height * s / 2, bottom: cy - r.height * s / 2 });
  camera.updateProjectionMatrix();
}
// world point -> pixel position on the stage
const tmpV = new THREE.Vector3();
function toScreen(x, y, z) {
  const r = stage.getBoundingClientRect();
  tmpV.set(x, y, z).project(camera);
  return { x: (tmpV.x + 1) / 2 * r.width, y: (1 - tmpV.y) / 2 * r.height };
}

// ---------- themes ----------
const STORE_KEY = "agent-office-theme";
const serverDefault = document.documentElement.dataset.defaultTheme;
let theme = null;
function savedTheme() {
  try { const v = localStorage.getItem(STORE_KEY); if (THEMES[v]) return v; } catch {}
  return THEMES[serverDefault] ? serverDefault : "office";
}
// the Foe the fantasy party fights: picked in the header, remembered per browser; Random rolls once per page load
const FOE_KEY = "agent-office-foe", FOE_NAMES = Object.keys(FOES);
const randomFoe = FOE_NAMES[Math.floor(Math.random() * FOE_NAMES.length)];
let foeChoice = "random";
try { const v = localStorage.getItem(FOE_KEY); if (v === "random" || FOES[v]) foeChoice = v; } catch {}
const foeName = () => foeChoice === "random" ? randomFoe : foeChoice;
const foesEl = document.querySelector(".foes");
function showFoeChoice() {
  for (const b of foesEl.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.foe === foeChoice));
}
for (const b of foesEl.querySelectorAll("button")) b.addEventListener("click", () => {
  foeChoice = b.dataset.foe;
  try { localStorage.setItem(FOE_KEY, foeChoice); } catch {}
  showFoeChoice();
  if (theme && theme.setFoe) theme.setFoe(foeName());
});
showFoeChoice();

const crowdHooks = {
  add(e) { if (gl) addFigure(e); },
  layout() { if (gl) { theme.build(); frameCamera(true); } },
};
function setTheme(name) {
  if (!THEMES[name] || (theme && theme.name === name)) return;
  for (const b of document.querySelectorAll(".themes button[data-theme]")) b.setAttribute("aria-pressed", String(b.dataset.theme === name));
  foesEl.hidden = name !== "fantasy";
  if (!gl) return;
  const first = !theme;
  if (theme) { for (const e of entities.values()) removeFigure(e); theme.dispose(); }
  resetLights();
  theme = THEMES[name]({ scene, sun, hemi, amb, reduceMotion, labelsEl, toScreen, foe: foeName() });
  setCrowdTheme(theme, crowdHooks);
  if (!first) settleAll();
  theme.layout(entities);
  theme.build();
  for (const e of entities.values()) addFigure(e);
  frameCamera(true);
}
for (const b of document.querySelectorAll(".themes button[data-theme]")) b.addEventListener("click", () => {
  try { localStorage.setItem(STORE_KEY, b.dataset.theme); } catch {}
  setTheme(b.dataset.theme);
});

// ---------- people ----------
function addFigure(e) {
  e.look = theme.look(e.id);
  e.fig = makeFigure(e.look);
  e.labelY = theme.dress(e.fig, e.look).labelY;
  scene.add(e.fig.root);
  const el = document.createElement("div"); el.className = "lbl";
  el.innerHTML = `<div class="bubble"></div><div class="tag"><span class="dot"></span><span class="nm"></span></div>`;
  labelsEl.appendChild(el);
  e.label = { el, bubble: el.firstChild, dot: el.querySelector(".tag .dot"), nm: el.querySelector(".nm"), key: "" };
}
function removeFigure(e) {
  if (!e.fig) return;
  scene.remove(e.fig.root);
  disposeFigure(e.fig);
  e.label.el.remove();
  e.fig = e.label = null;
}

function animateFigure(e, t, dt) {
  const F = e.fig, L = e.look, m = reduceMotion ? 0 : 1, tt = t + L.seed * 10;
  const k = reduceMotion ? 1 : Math.min(1, dt * 9);                 // smoothing toward each pose
  const ap = (obj, key, v) => { obj[key] += (v - obj[key]) * k; };
  const walking = isWalking(e) && !e.waiting;
  const st = e.phase === "seated" ? e.data.state : null, sit = e.sit, home = e.home || {};
  F.root.visible = !e.outside;
  const seatHip = (home.seat || 0.38) * ZS / K + 0.012, fwd = (home.fwd || 0) * sit;

  e.yaw = reduceMotion ? e.targetYaw : angleTo(e.yaw, e.targetYaw, Math.min(1, dt * 7));
  F.root.position.set(e.x + Math.sin(e.yaw) * fwd, 0, e.y + Math.cos(e.yaw) * fwd);
  F.root.rotation.y = e.yaw;
  F.hips.position.y = LEG + (seatHip - LEG) * sit + (walking ? Math.abs(Math.sin(e.stride)) * 0.03 * m : 0);

  const sw = walking ? Math.sin(e.stride) * 0.6 * m : 0;
  F.legs.forEach((g, i) => { g.rotation.x = (i ? sw : -sw) * (1 - sit) - 1.5 * sit; });
  F.torso.scale.y = 1 + 0.025 * Math.sin(tt * 2.1) * m;
  const blink = m && (tt % 3.7) < 0.13;
  for (const eye of F.eyes) eye.scale.y = blink ? 0.15 : 1.2;

  // default pose: arms swing while walking, rest on the lap when seated; the theme adds what each state does
  const p = { hx: 0, hy: 0, hz: 0.12 * bump(tt, 8.5, 1.5) * m, lean: 0, arm: {} };
  for (const s of [-1, 1]) {
    p.arm[s] = { ux: 0, uz: s * 0.12, fx: -0.15, fz: 0 };
    if (walking) Object.assign(p.arm[s], { ux: (s > 0 ? sw : -sw) * 0.9, fx: -0.3 });
    else if (sit > 0.5) Object.assign(p.arm[s], { ux: -0.4, uz: s * 0.1, fx: -0.9 });
  }
  if (st) theme.pose(e, p, { st, t, tt, m, sit });
  ap(F.head.rotation, "x", p.hx); ap(F.head.rotation, "y", p.hy); ap(F.head.rotation, "z", p.hz);
  ap(F.hips.rotation, "x", p.lean);
  for (const A of F.arms) {
    const a = p.arm[A.s];
    ap(A.sh.rotation, "x", a.ux); ap(A.sh.rotation, "z", a.uz); ap(A.el.rotation, "x", a.fx); ap(A.el.rotation, "z", a.fz);
  }
  if (F.ponyPivot) {
    F.ponyPivot.rotation.x = 0.15 + (0.08 * Math.sin(tt * 2.2) + (walking ? 0.12 * Math.sin(e.stride) : 0)) * m;
    F.ponyPivot.rotation.z = 0.08 * Math.sin(tt * 1.7) * m;
  }
}

// ---------- labels ----------
function placeLabels() {
  for (const e of entities.values()) {
    if (!e.label) continue;
    e.label.el.style.display = e.outside ? "none" : "";
    const F = e.fig;
    const { x, y } = toScreen(F.root.position.x, (F.hips.position.y + 0.28 + 0.17 + HR + e.labelY) * K, F.root.position.z);
    e.label.el.style.transform = `translate(${x.toFixed(1)}px, ${(y - 8).toFixed(1)}px) translate(-50%, -100%)`;
    const s = e.data, st = e.phase === "seated" ? s.state : "";
    const name = s.name.length > 28 ? s.name.slice(0, 27) + "…" : s.name, key = st + "|" + name;
    if (key !== e.label.key) {
      e.label.key = key;
      e.label.bubble.className = "bubble " + st;
      e.label.bubble.style.visibility = st ? "visible" : "hidden";
      e.label.bubble.textContent = { needs_you: "!", working: "…", your_turn: "✓" }[st] || "";
      e.label.dot.className = "dot " + st;
      e.label.nm.textContent = name;
    }
  }
}

// ---------- render loop: 60 fps while you're on this tab, about 30 fps in the background, paused when hidden ----------
let lastFrame = performance.now(), lastDraw = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  if (document.hidden || nowMs - lastDraw < (document.hasFocus() ? 15 : 32)) return;
  const dt = Math.min(0.1, (nowMs - lastFrame) / 1000); lastFrame = nowMs; lastDraw = nowMs;
  const t = nowMs / 1000;
  try {
    stepEntities(dt, reduceMotion, removeFigure);
    frameCamera(false);
    theme.update(t, dt, entities);
    for (const e of entities.values()) if (e.fig) animateFigure(e, t, dt);
    renderer.render(scene, camera);
    placeLabels();
    if (theme.overlay) theme.overlay(t);
  } catch (err) { console.error(err); }
}

// ---------- data ----------
const listEl = document.getElementById("list");
let lastData = { now: 0, sessions: [] }, fetchedAt = 0;
function fmtAge(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m";
  return Math.floor(sec / 3600) + "h " + Math.floor(sec % 3600 / 60) + "m";
}
function prettyTool(d) {
  const m = /^mcp__(.+?)__(.+)$/.exec(d || "");
  return m ? m[1].replace(/^plugin_[^_]+_/, "") + ": " + m[2].replace(/_/g, " ") : (d || "");
}
function esc(s) { return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function renderList() {
  const nowSec = lastData.now + (Date.now() - fetchedAt) / 1000;
  const ss = lastData.sessions;
  const n = st => ss.filter(s => s.state === st).length;
  document.getElementById("c-needs").textContent = n("needs_you");
  document.getElementById("c-working").textContent = n("working");
  document.getElementById("c-turn").textContent = n("your_turn");
  document.title = n("needs_you") ? `⚠ ${n("needs_you")} · Agent Office` : "Agent Office";
  document.getElementById("quiet").style.display = gl && !ss.length ? "block" : "none";
  listEl.innerHTML = ss.length ? ss.map(s => `
    <div class="row ${s.state}">
      <div class="name"><span class="dot"></span>${esc(s.name)}</div>
      <div class="meta">${STATE_LABEL[s.state]} · ${esc(prettyTool(s.detail))} · ${fmtAge(nowSec - s.since)}</div>
      <div class="meta">${esc(s.cwd)}</div>
    </div>`).join("") : `<div class="empty">No live sessions.</div>`;
}
async function poll() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    lastData = await r.json(); fetchedAt = Date.now();
    document.getElementById("offline").style.display = "none";
    if (gl) syncEntities(lastData.sessions);
  } catch {
    document.getElementById("offline").style.display = "inline";
  }
  renderList();
}
window.agentOffice = { entities, get theme() { return theme; } };   // handy for poking at from the browser console
setTheme(savedTheme());
if (gl) requestAnimationFrame(frame);
poll(); setInterval(poll, 1000);
