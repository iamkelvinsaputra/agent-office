// Sky that follows your local time: dawn, day, dusk and night, with sun, moon, stars and drifting clouds.
// Painted on a small canvas that themes use as a texture (the office window, the fantasy backdrop).
import { mix } from "./figure.js";

const SKY = [[0, "#0b1430", "#1d2a52"], [4.8, "#0b1430", "#1d2a52"], [6, "#5b6fb8", "#f6b1a0"], [7.5, "#5fb0ea", "#c4e6fb"],
             [16.5, "#5fb0ea", "#c4e6fb"], [18.3, "#4a4f9a", "#f59a6a"], [19.6, "#0b1430", "#1d2a52"], [24, "#0b1430", "#1d2a52"]];
export function skyAt(hr) {
  let i = 0; while (i < SKY.length - 2 && SKY[i + 1][0] <= hr) i++;
  const [h0, a0, b0] = SKY[i], [h1, a1, b1] = SKY[i + 1], f = Math.min(1, Math.max(0, (hr - h0) / (h1 - h0)));
  return [mix(a0, a1, f), mix(b0, b1, f)];
}
export const nightness = hr => hr < 4.8 || hr > 19.6 ? 1 : hr < 6 ? 1 - (hr - 4.8) / 1.2 : hr > 18.3 ? (hr - 18.3) / 1.3 : 0;
export const hourNow = () => { const n = new Date(); return n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600; };

// opts.glare: the diagonal window reflection (office only). opts.stars: how many stars.
export function paintSky(c, hr, t, reduceMotion, opts = {}) {
  const W = c.canvas.width, H = c.canvas.height, m = reduceMotion ? 0 : 1;
  const [top, bot] = skyAt(hr), g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top); g.addColorStop(1, bot); c.fillStyle = g; c.fillRect(0, 0, W, H);
  const night = nightness(hr), stars = opts.stars || 14, sz = Math.max(1.4, W / 360);
  if (night > 0) for (let k = 0; k < stars; k++) {
    c.globalAlpha = night * (0.55 + 0.45 * Math.sin(t * 1.3 * m + k * 2.1));
    c.fillStyle = "#fff6d8"; c.beginPath();
    c.arc(((k * 0.379 + 0.07) % 1) * W, H * (1 - (0.35 + ((k * 0.537) % 1) * 0.6)), sz, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  const body = (p, r, col, glow) => {
    const u = (-0.06 + p * 1.12) * W, v = H - (0.05 + Math.sin(p * Math.PI) * 0.8) * H;
    const gg = c.createRadialGradient(u, v, 0, u, v, r * 3.2);
    gg.addColorStop(0, glow); gg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gg; c.beginPath(); c.arc(u, v, r * 3.2, 0, 7); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(u, v, r, 0, 7); c.fill();
    return [u, v];
  };
  const R = Math.min(W, H * 2), B = opts.bodies || 1;   // B: sun and moon size
  if (hr >= 5.6 && hr <= 18.8) {
    const p = (hr - 5.6) / 13.2, low = 1 - Math.sin(p * Math.PI);
    body(p, R * 0.06 * B, mix("#fff3b8", "#ffb070", low * 0.8), "rgba(255,236,170,0.55)");
  }
  if (hr >= 18.6 || hr <= 5.8) {
    const [u, v] = body(((hr - 18.6 + 24) % 24) / 11.2, R * 0.05 * B, "#f3f1e4", "rgba(220,225,255,0.35)");
    c.fillStyle = top; c.beginPath(); c.arc(u + R * 0.0225 * B, v - R * 0.015 * B, R * 0.044 * B, 0, 7); c.fill();
  }
  if (night < 1) {
    c.globalAlpha = 0.85 * (1 - night); c.fillStyle = "#ffffff";
    const n = opts.clouds || 2;
    for (let k = 0; k < n; k++) {
      const u = (((t * 0.012 * m + k * (1.1 / n) + 0.2) % 1.3) * 1.33 - 0.2) * W, v = H * (1 - (0.55 + (k * 0.22) % 0.4));
      const cw = R;
      for (const [dx, dy, rx, ry] of [[0, 0, 0.085, 0.065], [0.055, -0.035, 0.06, 0.06], [-0.05, -0.02, 0.05, 0.045]]) {
        c.beginPath(); c.ellipse(u + dx * cw, v + dy * cw / 2, rx * cw, ry * cw / 2, 0, 0, 7); c.fill();
      }
    }
    c.globalAlpha = 1;
  }
  if (opts.glare) {
    c.globalAlpha = 0.12; c.fillStyle = "#ffffff"; c.beginPath();
    c.moveTo(W * 0.08, H); c.lineTo(W * 0.2, H); c.lineTo(W * 0.42, 0); c.lineTo(W * 0.3, 0); c.closePath(); c.fill();
    c.globalAlpha = 1;
  }
}
