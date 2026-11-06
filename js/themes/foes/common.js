// Shared bits for the fantasy theme and its Foes (the single opponent the Party fights).
export const A0 = Math.PI / 4;           // the Party stands in front of the Foe, toward the viewer
export const DS = 1.25;                  // Foe scale
export const polar = (r, a) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
export const angOf = p => Math.atan2(p.y, p.x), radOf = p => Math.hypot(p.x, p.y);
export const yawTo = (from, to) => Math.atan2(to.x - from.x, to.y - from.y);
export const frac = v => v - Math.floor(v);
export const smooth = (a, b, v) => { const x = Math.min(1, Math.max(0, (v - a) / (b - a))); return x * x * (3 - 2 * x); };
export const lerp = (a, b, f) => a + (b - a) * f;
export const easeBy = k => (o, key, v) => { o[key] += (v - o[key]) * k; };   // move o[key] a fraction k toward v

// A Foe is made by make(kit) with kit = { own, mesh, mat, addFx, glowMat, GEO, rnd, group, reach } (the theme's
// helpers; reach() is how far out the Party stands) and returns
//   { root, head, zzzY (how high the "zzz" floats over head), timing: {windup, bigAttack, recover, taunt},
//     recoil: {stiff, damp, kick}, scenery(), animate(state), onHit?(at, dir) }.
// The theme runs the shared rhythm (Asleep / ready / windup → bigAttack → recover / taunt) and the hit recoil;
// the Foe poses itself from the state it is given: { t, dt, m, sleep, mode, modeT, dir, hit, fighters,
// flinch(test), reduceMotion }. Hit reactions are movement only, never a change in
// brightness: rapid hits must not strobe.
