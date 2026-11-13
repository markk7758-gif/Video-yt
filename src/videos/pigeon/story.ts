// "Cher Ami": timeline of the shots, timed to the voice word onsets
// (videos/cher_ami/audio/words.json), the places, and the camera grammar of the template: hard cuts on big
// jumps, smootherstep glides, every hold creeps in, flip-sign impact kicks over 7 f, small rolls on punch words.
import { LightName } from "./lights";
export const FPS = 30;
export const VOICE_END = 65.08;
export const TOTAL = Math.round(VOICE_END * FPS);
export const D0 = 0; // ground level (build.ts helpers read it)
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;

// ---------------- places ----------------
/** the pocket (the trapped men) at the origin; the German line in the trees at z 16; our gun; the loft; the room */
export const GERZ = 16;
export const GUN: V3 = [-60, 0, 0];
export const LOFT: V3 = [60, 0, 0];
export const HQ: V3 = [300, 0, 0];
export const PIG = 0.5; // pigeon card scale (the 600 x 1000 canvas is 2.16 m tall)

// ---------------- story events (seconds, voice timeline) ----------------
export const EV = {
  maybe: 5.19, surrounded: 10.92, worse: 14.68, artillery: 15.67, shelling: 16.5, pigeons: 18.94, first: 20.3, shoot1: 21.6,
  second: 22.5, shoot2: 23.25, left: 25.16, name: 26.42, note: 28.33, heaven: 28.64, shot: 30.26, falls: 31.89, up: 33.42,
  wait: 34.82, home: 36.85, loft: 39.46, bed: 40.76, bullets: 43.24, lands: 45.31, blind: 45.99, gunsStop: 48.89, alive: 51.5,
  medal: 53.23, leg: 54.85, historians: 55.54, arguing: 56.85, prove: 60.48, girl: 63.1, boy: 63.97,
};
/** artillery flashes that light the pocket */
export const FLASHES = [16.5, 16.95, 17.4, 15.7];

// ---------------- shots ----------------
export type Loc = "front" | "hq";
export type ShotDef = { id: number; a: number; b: number; light: LightName; loc: Loc; tau: (t: number) => number };
const fr = (t: number) => Math.round(t * FPS);
/** cut times (s): shot k runs CUTS[k-1] .. CUTS[k] */
const CUTS = [0, 1.83, 3.0, 5.19, 5.78, 7.9, 10.92, 12.37, 13.25, 14.17, 15.23, 16.23, 17.19, 18.94, 19.69, 20.99, 22.31, 24.11,
  25.69, 27.3, 28.64, 30.05, 31.69, 32.52, 34.82, 35.27, 37.33, 39.97, 41.65, 43.84, 45.99, 48.7, 49.9, 52.12, 53.7, 55.34,
  56.38, 58.46, 60.25, 61.51, 63.59, VOICE_END];
export const BED = [28], DESK = [36, 37], LAB = [38, 39, 40, 41];
export const SHOTS: ShotDef[] = CUTS.slice(0, -1).map((c, i) => {
  const id = i + 1, room = BED.includes(id) || DESK.includes(id) || LAB.includes(id);
  return { id, a: fr(c), b: fr(CUTS[i + 1]), light: id === 28 ? "night" : room ? "hall" : "day", loc: room ? "hq" : "front", tau: (t: number) => t };
});
SHOTS[SHOTS.length - 1].b = TOTAL;
export const XFADE: Record<number, number> = { 5: 8, 27: 8 };
export const FLASH_AT = fr(5.78);

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mixCam(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const pushK = (f: number, f0: number, rate = 0.0025, punch = 0, n = 30) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
const at = (t: number) => fr(t);
const D = (t0: number, pos: V3, look: V3, rest: Partial<Cam> = {}, rate = 0.0025, punch = 0, n = 30) =>
  (f: number) => dolly(pos, look, pushK(f, at(t0), rate, punch, n), rest);
const Z = (t0: number, pos: V3, look: V3, fov: number, rest: Partial<Cam> = {}, rate = 0.002, punch = 0, n = 30) =>
  (f: number) => zoom(pos, look, fov, pushK(f, at(t0), rate, punch, n), rest);
/** crane: glide between two framings over the whole shot */
const C = (t0: number, t1: number, a: Shot, b: Shot) => (f: number): Shot => {
  const u = glide((f / FPS - t0) / (t1 - t0)), A = full(a), B = full(b), m = mixCam(A, B, u);
  return m;
};
const H = HQ[0], LX = LOFT[0], LZ = LOFT[2], GX = GUN[0];
/** flight paths (world positions over time) for the flying pigeon shots */
export const flight1 = (t: number): V3 => { const u = (t - 19.95) / 1.2; return [0.9 + 2.2 * u, 1.1 + 3.4 * u - (t > EV.shoot1 ? 9 * (t - EV.shoot1) ** 2 : 0), 1.4 + 2.5 * u]; };
export const flight2 = (t: number): V3 => { const u = (t - 22.35) / 1.2; return [0.4 - 2.0 * u, 1.3 + 3.0 * u - (t > EV.shoot2 ? 9 * (t - EV.shoot2) ** 2 : 0), 1.6 + 2.6 * u]; };
export const heroFly = (t: number): V3 => { // shots 22-24: takes off, hit, falls, recovers, climbs away
  const u = t - 30.05;
  if (t < EV.shot) return [0.8 + 1.8 * u, 1.2 + 2.6 * u, 1.6 + 1.0 * u];
  const p0: V3 = [0.8 + 1.8 * 0.21, 1.2 + 2.6 * 0.21, 1.6 + 0.21];
  if (t < 32.9) { const v = t - EV.shot; return [p0[0] + 0.6 * v, Math.max(0.35, p0[1] + 1.0 * v - 2.2 * v * v), p0[2] + 0.5 * v]; }
  const w = t - 32.9; return [p0[0] + 1.6 + 2.4 * w, 0.35 + 1.4 * w * w + 0.9 * w, p0[2] + 1.3 + 1.6 * w];
};

const CAMS: Record<number, Key[]> = {
  // hook: the hero, injured, proud
  1: [{ f: 0, s: D(0, [LX + 0.55, 2.55, LZ + 3.2], [LX + 0.05, 2.45, LZ + 1.35], { fov: 34, roll: -0.03 }, 0.004) }],
  2: [{ f: at(1.83), s: D(1.83, [LX + 0.35, 2.48, LZ + 2.4], [LX - 0.05, 2.42, LZ + 1.35], { fov: 32, roll: 0.03 }, 0.004, 0.009, 16) }],
  3: [{ f: at(3.0), s: C(3.0, 5.19, { pos: [3, 2.4, 9.5], look: [0, 1.0, 2], fov: 46 }, { pos: [5, 4.5, 11], look: [0, 0.6, 2], fov: 48 }) }],
  4: [{ f: at(5.19), s: D(5.19, [LX + 0.3, 2.5, LZ + 2.2], [LX - 0.05, 2.42, LZ + 1.35], { fov: 30, roll: 0.06 }, 0.004, 0.02, 10) }],
  // October 1918: the forest, the pocket, the Germans
  5: [{ f: at(5.78) - 4, s: C(5.78, 7.9, { pos: [30, 34, -30], look: [0, 0, 4], fov: 46 }, { pos: [22, 24, -22], look: [0, 0, 3], fov: 44 }) }],
  6: [{ f: at(7.9), s: C(7.9, 10.92, { pos: [-3.5, 4.2, -5], look: [0, 0.8, 2.2], fov: 46 }, { pos: [-1.8, 2.0, -2.6], look: [0, 1.15, 1.8], fov: 44 }) }],
  7: [{ f: at(10.92), s: D(10.92, [0.6, 1.5, GERZ - 4.2], [0.2, 1.35, GERZ], { fov: 46 }, 0.003) }],
  8: [{ f: at(12.37), s: D(12.37, [0.75, 1.75, 4.3], [0.5, 1.65, 1.0], { fov: 36, roll: 0.03 }, 0.004) }],
  9: [{ f: at(13.25), s: Z(13.25, [0.5, 5.2, -3.6], [0, 0.5, 2.0], 52, {}, 0.003) }],
  10: [{ f: at(14.17), s: D(14.17, [0.6, 1.7, 3.5], [0.5, 1.65, 1.0], { fov: 34, roll: -0.04 }, 0.004, 0.012, 14) }],
  // their own artillery
  11: [{ f: at(15.23), s: D(15.23, [GX + 3.5, 1.6, 8.5], [GX + 0.6, 1.2, 0.8], { fov: 46, roll: 0.03 }, 0.003) }],
  12: [{ f: at(16.23), s: D(16.23, [1.2, 1.7, 7.4], [-0.3, 1.2, 1.6], { fov: 48, roll: -0.04 }, 0.003) }],
  13: [{ f: at(17.19), s: D(17.19, [1.2, 1.6, 4.2], [0.7, 1.35, 1.2], { fov: 38 }, 0.0035) }],
  14: [{ f: at(18.94), s: D(18.94, [1.15, 0.65, 3.6], [1.1, 0.35, 1.4], { fov: 40 }, 0.004, 0.01, 14) }],
  // the first two pigeons
  15: [{ f: at(19.69), s: (f) => { const p = flight1(f / FPS); return { pos: [p[0] - 0.3, p[1] - 0.2, p[2] + 2.4], look: [p[0], p[1], p[2]], fov: 44 }; } }],
  16: [{ f: at(20.99), s: D(20.99, [-0.6, 1.6, GERZ - 3.2], [0.4, 1.6, GERZ - 0.3], { fov: 40 }, 0.003) },
    { f: at(21.6), cut: true, s: (f) => { const p = flight1(f / FPS); return { pos: [p[0] + 1.2, 2.8, p[2] + 4.5], look: [p[0], Math.max(0.5, p[1]), p[2]], fov: 46 }; } }],
  17: [{ f: at(22.31), s: (f) => { const p = flight2(f / FPS); return { pos: [p[0] + 0.3, Math.max(0.6, p[1]) - 0.2, p[2] + 2.3], look: [p[0], Math.max(0.5, p[1]), p[2]], fov: 44, roll: f / FPS > EV.shoot2 ? 0.08 : 0 }; } }],
  18: [{ f: at(24.11), s: D(24.11, [1.12, 0.62, 3.9], [1.1, 0.35, 1.4], { fov: 40 }, 0.004, 0.012, 14) }],
  // Cher Ami
  19: [{ f: at(25.69), s: D(25.69, [1.0, 1.05, 3.0], [0.95, 0.98, 1.45], { fov: 36, roll: 0.04 }, 0.004, 0.012, 14) }],
  20: [{ f: at(27.3), s: D(27.3, [0.95, 1.2, 4.0], [0.75, 0.95, 1.3], { fov: 40 }, 0.0035) }],
  21: [{ f: at(28.64), s: D(28.64, [0.9, 1.25, 3.0], [0.9, 1.25, 1.42], { fov: 32 }, 0.003) }],
  22: [{ f: at(30.05), s: (f) => { const p = heroFly(f / FPS); return { pos: [p[0] - 0.4, p[1] - 0.2, p[2] + 2.6], look: p, fov: 42, roll: f / FPS > EV.shot ? 0.1 : 0 }; } }],
  23: [{ f: at(31.69), s: (f) => { const p = heroFly(f / FPS); return { pos: [p[0] + 0.8, 1.3, p[2] + 2.6], look: [p[0], Math.max(0.4, p[1]), p[2]], fov: 44, roll: -0.06 }; } }],
  24: [{ f: at(32.52), s: (f) => { const p = heroFly(f / FPS); return { pos: [p[0] - 0.5, p[1] - 0.35, p[2] + 2.4], look: [p[0], Math.max(0.5, p[1]), p[2]], fov: 44, roll: 0.04 }; } }],
  25: [{ f: at(34.82), s: D(34.82, [-1.05, 1.75, 4.0], [-1.3, 1.65, 1.8], { fov: 32, roll: 0.06 }, 0.004, 0.03, 8) }],
  26: [{ f: at(35.27), s: (f) => { const u = (f / FPS - 35.27) / 2.06, x = -8 + 5 * u, y = 6.5 + 1.5 * u, z = 4 * u; return { pos: [x - 0.6, y + 0.2, z + 3.2], look: [x, y + 0.3, z], fov: 42 }; } }],
  // homing: the loft, the bed, the bullets
  27: [{ f: at(37.33) - 4, s: C(37.33, 39.97, { pos: [LX + 3.4, 3.0, LZ + 6.2], look: [LX + 0.6, 2.7, LZ + 1.3], fov: 44 }, { pos: [LX + 1.6, 2.8, LZ + 4.4], look: [LX + 0.2, 2.55, LZ + 1.3], fov: 42 }) }],
  28: [{ f: at(39.97), s: D(39.97, [H + 1.3, 1.9, 1.4], [H + 0.2, 0.9, -2.6], { fov: 46 }, 0.003) }],
  29: [{ f: at(41.65), s: (f) => { const t = f / FPS, x = -14 + 9 * (t - 41.65); return { pos: [x - 1.2, 7.6, 1.8], look: [x + 0.4, 7.4, 0], fov: 40, roll: 0.03 }; } }],
  30: [{ f: at(43.84), s: D(43.84, [LX + 1.0, 2.75, LZ + 4.4], [LX + 0.5, 2.3, LZ + 1.5], { fov: 46 }, 0.003) }],
  31: [{ f: at(45.99), s: D(45.99, [LX + 0.25, 2.55, LZ + 3.0], [LX + 0.0, 2.48, LZ + 1.35], { fov: 34 }, 0.0035) }],
  // rescue
  32: [{ f: at(48.7), s: D(48.7, [GX + 0.2, 1.6, 6.4], [GX - 0.4, 1.2, 1.2], { fov: 46 }, 0.002) }],
  33: [{ f: at(49.9), s: C(49.9, 52.12, { pos: [2, 1.6, 9], look: [0, 1.1, 3], fov: 46 }, { pos: [6, 3.5, 12], look: [0, 1.0, 3], fov: 48 }) }],
  34: [{ f: at(52.12), s: D(52.12, [LX + 1.2, 1.7, LZ + 5.6], [LX + 0.2, 1.4, LZ + 2.6], { fov: 40 }, 0.003, 0.008, 18) }],
  35: [{ f: at(53.7), s: D(53.7, [LX + 0.4, 2.48, LZ + 2.6], [LX + 0.05, 2.38, LZ + 1.35], { fov: 34, roll: -0.03 }, 0.004) }],
  // the historians and the lab
  36: [{ f: at(55.34), s: D(55.34, [H + 0.3, 1.75, 3.3], [H, 1.35, -1.0], { fov: 44 }, 0.003) }],
  37: [{ f: at(56.38), s: D(56.38, [H + 0.2, 1.6, 1.6], [H, 1.45, -1.0], { fov: 40, roll: 0.04 }, 0.004, 0.01, 14) }],
  38: [{ f: at(58.46), s: D(58.46, [H + 0.4, 1.75, 2.6], [H, 1.35, -1.2], { fov: 44 }, 0.003) }],
  39: [{ f: at(60.25), s: D(60.25, [H - 0.6, 1.5, 0.5], [H - 0.6, 1.5, -1.2], { fov: 36 }, 0.004) }],
  40: [{ f: at(61.51), s: D(61.51, [H - 0.25, 1.24, 0.4], [H - 0.6, 1.15, -1.3], { fov: 34 }, 0.004) }],
  41: [{ f: at(63.59), s: D(63.59, [H - 0.3, 1.22, 0.1], [H - 0.6, 1.15, -1.3], { fov: 32, roll: 0.06 }, 0.005, 0.02, 10) }],
};

// impact kicks: the image offset flips sign every frame and decays over 7 f
const KICKS: [number, number][] = [[EV.maybe, 0.6], [EV.artillery, 1.2], [EV.shelling, 1.6], [16.95, 1.2], [17.4, 1.0], [EV.shoot1, 1.0], [EV.shoot2, 1.0],
  [EV.shot, 1.4], [EV.falls, 0.8], [EV.wait, 1.2], [EV.lands, 0.6], [EV.gunsStop, 0.5], [EV.medal, 0.6], [EV.boy, 1.2]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(f / FPS);
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};

// ---------------- lens: depth of field per shot ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const DOFS: [number, number][] = [
  [0, 15], [1.83, 16], [3.0, 6], [5.19, 16], [5.78, 0], [7.9, 4], [10.92, 10], [12.37, 14], [13.25, 0], [14.17, 15], [15.23, 10],
  [16.23, 6], [17.19, 12], [18.94, 15], [19.69, 10], [20.99, 12], [21.6, 8], [22.31, 8], [24.11, 15], [25.69, 16], [27.3, 14],
  [28.64, 15], [30.05, 10], [32.52, 10], [34.82, 16], [35.27, 0], [37.33, 8], [39.97, 10], [41.65, 6], [43.84, 12], [45.99, 16],
  [48.7, 8], [49.9, 6], [52.12, 12], [53.7, 15], [55.34, 10], [56.38, 14], [58.46, 10], [60.25, 14], [61.51, 15], [63.59, 16],
]
export const DOF: Dof[] = DOFS.map(([t, c]) => ({ f: fr(t), cInf: c }));
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
