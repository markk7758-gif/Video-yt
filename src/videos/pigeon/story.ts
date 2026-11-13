// "The Christmas Truce": timeline of the shots, timed to the voice word onsets
// (videos/christmas_truce/audio/words.json), the places, and the camera grammar of the template: hard cuts on big
// jumps, smootherstep glides, every hold creeps in, flip-sign impact kicks over 7 f, small rolls on punch words.
import { LightName } from "./lights";
export const FPS = 30;
export const VOICE_END = 62.62;
export const TOTAL = Math.round(VOICE_END * FPS);
export const D0 = 0; // ground level (build.ts helpers read it)
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;

// ---------------- places ----------------
/** British trench along x at z 0, German trench at z GZ; floor depth, fire-step height, parapets toward the enemy */
export const GZ = 30, TW = 1.0, FLOOR = -1.75, STEP = -0.72, PARA = 0.7;
export const HQ: V3 = [300, 0, 0];
/** candle trees on the German parapet: x positions (they light one by one from the centre outward) */
export const TREES = [-24, -16, -9, -3.5, 2.5, 8, 14, 21, 28];
export const TREE_Z = GZ - TW - 0.55;
export const lightOn = (x: number) => EV.lights + 0.12 * Math.abs(x) / 3.5; // lights pop on from the middle out

// ---------------- story events (seconds, voice timeline) ----------------
export const EV = {
  singing: 3.13, cough: 9.52, begged: 10.48, no: 13.32, lights: 15.19, silent: 20.0, know: 21.21, singsBack: 22.75,
  climbs: 25.16, waves: 27.03, shaking: 31.57, cigs: 33.23, choc: 33.88, buttons: 34.8, bury: 36.36, football: 40.26,
  wait: 40.8, same: 45.14, hard: 50.29, hated: 52.92, banned: 53.72, firing: 55.82, stopped: 61.3,
};

// ---------------- shots ----------------
export type Loc = "front" | "hq";
export type ShotDef = { id: number; a: number; b: number; light: LightName; loc: Loc; tau: (t: number) => number };
const fr = (t: number) => Math.round(t * FPS);
/** cut times (s): shot k runs CUTS[k-1] .. CUTS[k] */
const CUTS = [0, 1.34, 2.59, 3.98, 5.69, 7.68, 9.4, 10.04, 12.71, 13.76, 15.19, 16.8, 18.9, 20.0, 21.03, 22.13, 23.63, 25.99,
  26.67, 27.52, 28.55, 31.57, 32.64, 33.88, 34.53, 36.13, 38.52, 40.8, 41.3, 43.09, 44.3, 45.7, 46.34, 46.98, 47.78, 50.06,
  52.33, 53.48, 54.81, 56.63, 58.48, VOICE_END];
const NIGHT = [1, 2, 3, 10, 11, 12, 13, 14, 15, 16, 35, 39, 41];
const HALL = [8, 9, 37, 38];
export const SHOTS: ShotDef[] = CUTS.slice(0, -1).map((c, i) => {
  const id = i + 1;
  return { id, a: fr(c), b: fr(CUTS[i + 1]), light: HALL.includes(id) ? "hall" : NIGHT.includes(id) ? "night" : "winter",
    loc: HALL.includes(id) ? "hq" : "front", tau: (t: number) => t };
});
SHOTS[SHOTS.length - 1].b = TOTAL;
/** crossfades (frames) at place/time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 17: 10, 41: 12 };
export const FLASH_AT = fr(3.98);

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
const H = HQ[0];
/** the German who climbs out (shot 16): 0 in the trench .. 1 standing on the parapet ground */
export const climbK = (t: number) => smooth((t - (EV.climbs - 0.6)) / 1.1);
/** football (shot 26): ball between Tommy (x -9.2) and Hans (x -6.8), kicked every 0.55 s */
export const ballAt = (t: number): V3 => {
  const k = (t - 38.52) / 0.55, i = Math.floor(k), u = k - i, from = i % 2 ? -8.5 : -7.5, to = i % 2 ? -7.5 : -8.5;
  return [from + (to - from) * u, 0.12 + 0.9 * Math.sin(Math.PI * u), 15.0 + 0.3 * Math.sin(i * 1.7)];
};

const CAMS: Record<number, Key[]> = {
  // hook, Christmas Eve: down the British trench, Tommy in the foreground
  1: [{ f: 0, s: D(0, [1.4, -0.2, -0.35], [-1.5, -0.55, 0.3], { fov: 46, roll: 0.03 }, 0.003) }],
  2: [{ f: at(1.34), s: Z(1.34, [0.3, 1.25, 2.6], [0, 0.75, TREE_Z], 30, {}, 0.004) }],
  3: [{ f: at(2.59), s: D(2.59, [0.9, 1.05, GZ - 3.0], [0.1, 0.84, GZ - 0.6], { fov: 36, roll: -0.04 }, 0.003, 0.008, 18) }],
  // December 1914: the two lines from above, then down in the mud
  4: [{ f: at(3.98), s: C(3.98, 5.69, { pos: [6.5, 5.5, -4.2], look: [1.0, -1.0, 0.1], fov: 46 }, { pos: [5.0, 3.6, -3.4], look: [1.0, -1.0, 0.1], fov: 44 }) }],
  5: [{ f: at(5.69), s: D(5.69, [1.9, -0.25, -0.35], [-0.6, -0.55, 0.15], { fov: 46 }, 0.003) }],
  6: [{ f: at(7.68), s: Z(7.68, [0.5, 1.2, -0.4], [0.3, 0.75, GZ], 9, {}, 0.002) }],
  7: [{ f: at(9.4), s: D(9.4, [0.6, 1.1, GZ - 3.2], [-0.1, 0.84, GZ - 0.6], { fov: 36, roll: 0.04 }, 0.004) }],
  // the Pope pleads, the generals refuse
  8: [{ f: at(10.04), s: D(10.04, [H + 0.35, 1.7, 2.4], [H, 1.35, -0.6], { fov: 40 }, 0.003) }],
  9: [{ f: at(12.71), s: D(12.71, [H + 0.1, 1.6, 3.9], [H, 1.3, -0.5], { fov: 42, roll: -0.03 }, 0.003, 0.008, 18) }],
  // that night: lights appear
  10: [{ f: at(13.76), s: D(13.76, [0.4, 1.02, 3.2], [0.0, 0.82, 0.6], { fov: 36 }, 0.003) }],
  11: [{ f: at(15.19), s: Z(15.19, [0.4, 1.1, 1.2], [0.3, 0.9, TREE_Z], 36, {}, 0.0025) }],
  12: [{ f: at(16.8), s: D(16.8, [3.5, 0.95, TREE_Z - 2.6], [2.5, 0.85, TREE_Z], { fov: 38 }, 0.003) }],
  13: [{ f: at(18.9), s: D(18.9, [0.6, 1.05, GZ - 2.8], [0.1, 0.84, GZ - 0.6], { fov: 36 }, 0.003) }],
  14: [{ f: at(20.0), s: D(20.0, [0.2, 1.15, GZ - 4.8], [0, 0.82, GZ - 0.6], { fov: 46 }, 0.003) }],
  15: [{ f: at(21.03), s: D(21.03, [0.15, 0.98, 2.6], [0, 0.82, 0.6], { fov: 34, roll: 0.03 }, 0.004, 0.009, 16) }],
  16: [{ f: at(22.13), s: C(22.13, 23.63, { pos: [0.6, 1.1, 4.0], look: [0, 0.7, 0.6], fov: 44 }, { pos: [0.8, 3.2, 6.5], look: [0, 0.6, 0.6], fov: 46 }) }],
  // next morning
  17: [{ f: at(23.63) - 5, s: D(23.63, [0.9, 0.85, GZ - 7.5], [0.0, 0.85, GZ - 1.3], { fov: 38 }, 0.0025) }],
  18: [{ f: at(25.99), s: D(25.99, [0.3, 1.3, GZ - 5.6], [0, 1.2, GZ - 2.45], { fov: 38 }, 0.004, 0.01, 14) }],
  19: [{ f: at(26.67), s: D(26.67, [0.9, 1.3, GZ - 5.2], [0.0, 1.0, GZ - 1.6], { fov: 40, roll: -0.03 }, 0.003) }],
  20: [{ f: at(27.52), s: D(27.52, [0.5, 1.05, 3.4], [-0.2, 0.82, 0.6], { fov: 44 }, 0.002) }],
  // no man's land
  21: [{ f: at(28.55), s: C(28.55, 31.57, { pos: [7, 2.0, 7.5], look: [0, 1.0, 14], fov: 46 }, { pos: [9, 5.5, 4.5], look: [0, 0.6, 15], fov: 48 }) }],
  22: [{ f: at(31.57), s: D(31.57, [0.1, 1.3, 10.6], [0, 1.15, 15.0], { fov: 36, roll: 0.03 }, 0.004) }],
  23: [{ f: at(32.64), s: D(32.64, [-0.5, 1.35, 10.8], [-0.1, 1.2, 15.0], { fov: 36 }, 0.003) }],
  24: [{ f: at(33.88), s: D(33.88, [0.6, 1.35, 10.8], [0.1, 1.2, 15.0], { fov: 36, roll: -0.03 }, 0.004) }],
  25: [{ f: at(34.53), s: D(34.53, [0.05, 1.25, 11.4], [0, 1.15, 15.0], { fov: 34 }, 0.004, 0.008, 16) }],
  26: [{ f: at(36.13), s: D(36.13, [10.8, 1.5, 10.4], [10.8, 0.9, 17.0], { fov: 46 }, 0.0018) }],
  27: [{ f: at(38.52), s: D(38.52, [-8.0, 1.3, 9.6], [-8.0, 0.6, 15.0], { fov: 42 }, 0.002) }],
  // the question and the answer
  28: [{ f: at(40.8), s: D(40.8, [0.1, 0.95, 2.0], [0, 0.84, 0.6], { fov: 32, roll: 0.06 }, 0.004, 0.03, 8) }],
  29: [{ f: at(41.3), s: C(41.3, 43.09, { pos: [-3, 2.4, 9.5], look: [-1, 2.2, 15], fov: 46 }, { pos: [3, 2.6, 9.5], look: [1, 2.3, 15], fov: 46 }) }],
  30: [{ f: at(43.09), s: D(43.09, [0.9, -0.15, -0.75], [0, -0.45, 0.2], { fov: 50 }, 0.003) }],
  31: [{ f: at(44.3), s: D(44.3, [-0.9, -0.15, GZ + 0.75], [0, -0.45, GZ - 0.2], { fov: 50 }, 0.003) }],
  32: [{ f: at(45.7), s: D(45.7, [0.25, -0.2, -0.85], [0, -0.35, 0.2], { fov: 46 }, 0.004) }],
  33: [{ f: at(46.34), s: D(46.34, [-0.25, -0.2, GZ + 0.85], [0, -0.35, GZ - 0.2], { fov: 46 }, 0.004) }],
  34: [{ f: at(46.98), s: D(46.98, [0.3, -0.2, -0.85], [0, -0.4, 0.2], { fov: 46 }, 0.004) }],
  35: [{ f: at(47.78), s: D(47.78, [0.1, 1.4, 10.8], [0, 1.2, 15.0], { fov: 38 }, 0.0025) }],
  36: [{ f: at(50.06), s: D(50.06, [0.6, 1.02, 3.4], [0, 0.82, 0.6], { fov: 36 }, 0.0025) }],
  // the generals
  37: [{ f: at(52.33), s: D(52.33, [H + 0.4, 1.75, 4.2], [H, 1.5, -2.5], { fov: 40 }, 0.003, 0.008, 18) }],
  38: [{ f: at(53.48), s: D(53.48, [H + 1.2, 2.2, 1.6], [H + 0.2, 1.0, -1.6], { fov: 38, roll: -0.04 }, 0.003) }],
  39: [{ f: at(54.81), s: D(54.81, [1.1, 1.75, -2.6], [0, 0.95, 5], { fov: 48, roll: 0.04 }, 0.003) }],
  // four more years, and the one night
  40: [{ f: at(56.63), s: C(56.63, 58.48, { pos: [-6.5, 5.8, -4.4], look: [-0.5, -1.0, 0.1], fov: 46 }, { pos: [-8.5, 7.5, -5.5], look: [-0.5, -1.0, 0.6], fov: 46 }) }],
  41: [{ f: at(58.48), s: (f) => {
    const u = glide((f / FPS - 58.48) / (VOICE_END - 58.48));
    return dolly([2.5 + 6 * u, 1.2 + 9 * u, TREE_Z - 4.2 - 10 * u], [2.5, 1.0 + 0.2 * u, TREE_Z - 1.0], 1, { fov: 40 + 6 * u });
  } }],
};

// impact kicks: the image offset flips sign every frame and decays over 7 f
const KICKS: [number, number][] = [[EV.no, 0.6], [EV.cough, 0.4], [EV.wait, 1.2], [EV.banned, 1.4], [EV.hated, 0.6],
  [EV.firing, 1.8], [55.2, 1.2], [56.2, 1.4]];
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
  [0, 12], [1.34, 6], [2.59, 14], [3.98, 0], [5.69, 12], [7.68, 6], [9.4, 14], [10.04, 10], [12.71, 10], [13.76, 13],
  [15.19, 4], [16.8, 14], [18.9, 14], [20.0, 8], [21.03, 15], [22.13, 6], [23.63, 5], [25.99, 13], [26.67, 10], [27.52, 9],
  [28.55, 0], [31.57, 14], [32.64, 14], [33.88, 14], [34.53, 15], [36.13, 8], [38.52, 7], [40.8, 16], [41.3, 0], [43.09, 12],
  [45.7, 15], [47.78, 12], [50.06, 9], [52.33, 10], [54.81, 6], [56.63, 0], [58.48, 12],
];
export const DOF: Dof[] = DOFS.map(([t, c]) => ({ f: fr(t), cInf: c }));
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
