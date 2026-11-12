// "The Goose King": timeline of the 43 shots, timed to the voice word onsets (videos/goose_king/audio/words.json),
// the castle's build state over story time, and the camera grammar of the template: hard cuts on big jumps,
// smootherstep glides 18-40 f, every hold creeps in, flip-sign impact kicks over 7 f, 4-5 deg rolls on punch words.
import { LightName } from "./lights";
export const FPS = 30;
export const VOICE_END = 62.4;
export const TOTAL = Math.round(VOICE_END * FPS);
export const D0 = 0; // ground level (build.ts helpers read it)
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
/** snappy pop with overshoot: 0 -> 1.12 -> 0.97 -> 1 over `dur` seconds after t0 */
export const pop = (t: number, t0: number, dur = 0.4) => {
  const u = (t - t0) / dur;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return 1 - (1 - u) ** 3 * Math.cos(2.5 * Math.PI * u); // peaks ~1.2 at u .4, settles by 1
};

// ---------------- places ----------------
/** wall and moat half-sizes (square rings around the origin) */
export const W1 = 16, W1T = 2, W1H = 7;
export const W2 = 23, W2T = 2.5, W2H = 10;
export const M1: [number, number] = [26, 30];
export const M2: [number, number] = [34, 39];
export const WATER_Y = -0.8;
export const WALL2_TOP = W2H, WALL2_WALK = W2 - 0.4; // where people stand on the outer wall's front (z)
export const HALL: V3 = [300, 0, 0];
export const DAIS = 0.6; // throne dais height (z < HALL - 7)
export const THRONE: V3 = [300, DAIS + 0.48, -10.2]; // goose seat point
export const HILL: V3 = [0, 9.4, 165]; // hilltop on the horizon where the goose appears
export const SLIT_X = 8; // arrow slit in the outer wall's front face

// ---------------- story events (seconds, voice timeline) ----------------
export const EV = {
  goose1: 2.64, bite: 5.66, never: 8.44,
  wall1: 10.23, wall2: 11.58, moat1: 13.22, moat2: 14.07, eels: 15.9, itCould: 18.27,
  bridgeUp: 19.18, bridgeShut: 19.73, melt: 20.58,
  unluckily: 25.71, food: 27.19, boxUp: 29.7, boxShut: 30.62, lunch: 32.74,
  boot: 35.99, back: 40.9, goose6: 45.63, winter: 46.49, slit: 50.71, sit: 52.27, look: 54.7, crown: 56.37, honk: 61.14,
};
/** castle build state at story time tau */
export const buildAt = (tau: number) => ({
  wall1: pop(tau, EV.wall1 - 0.1, 0.45), wall2: pop(tau, EV.wall2 - 0.1, 0.45),
  moat1: smooth((tau - EV.moat1 + 0.2) / 0.5), moat2: smooth((tau - EV.moat2 + 0.2) / 0.5),
  bridge: smooth((tau - EV.bridgeUp) / (EV.bridgeShut - EV.bridgeUp)) ** 2, chains: tau < EV.melt,
  winter: tau >= EV.winter - 0.3, gooseFlags: tau >= 56.5,
});
export type Build = ReturnType<typeof buildAt>;

// ---------------- shots ----------------
export type Loc = "hall" | "castle";
export type ShotDef = { id: number; a: number; b: number; light: LightName; loc: Loc; tau: (t: number) => number };
const fr = (t: number) => Math.round(t * FPS);
/** cut times (s): shot k runs CUTS[k-1] .. CUTS[k] */
const CUTS = [0, 1.2, 2.31, 3.29, 4.95, 5.66, 6.55, 7.11, 8.44, 9.34, 10.79, 12.93, 13.76, 15.28, 16.46, 18.04, 18.8, 20.33, 21.93, 23.8,
  25.71, 27.19, 27.8, 30.24, 31.1, 33.45, 35.15, 36.77, 39.69, 40.9, 41.46, 43.44, 44.34, 45.34, 46.26, 48.37, 50.23, 51.75, 53.4,
  55.57, 56.93, 59.56, 61.14, VOICE_END];
const LIGHT: Record<number, LightName> = {};
const LOC: Record<number, Loc> = {};
for (const id of [1, 2, 3, 26, 27, 38, 39, 40, 42, 43]) { LIGHT[id] = "hall"; LOC[id] = "hall"; }
for (const id of [35, 36, 37, 41]) LIGHT[id] = "winter";
const END = (_t: number) => 60; // flash-forward hook and the ending: everything built, winter
export const SHOTS: ShotDef[] = CUTS.slice(0, -1).map((c, i) => {
  const id = i + 1;
  return { id, a: fr(c), b: fr(CUTS[i + 1]), light: LIGHT[id] ?? "day", loc: LOC[id] ?? "castle", tau: id <= 3 ? END : (t: number) => t };
});
SHOTS[SHOTS.length - 1].b = TOTAL;
/** crossfades (frames) at place/time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 35: 10 };
export const FLASH_AT = fr(3.29);

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
/** push-in factor since f0 (frames): ~rate per frame, `punch` for the first n frames (8 f soft edges) */
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
/** vertigo: camera pulls back while the fov narrows so the subject keeps its size */
const vertigo = (pos: V3, look: V3, fov0: number, u: number, back = 1.8): Shot => {
  const k = 1 + (back - 1) * u, d = [pos[0] - look[0], pos[1] - look[1], pos[2] - look[2]];
  const fov = (360 / Math.PI) * Math.atan(Math.tan((fov0 * Math.PI) / 360) / k);
  return { pos: [look[0] + d[0] * k, look[1] + d[1] * k, look[2] + d[2] * k], look, fov };
};
const H = HALL[0];
const at = (t: number) => fr(t);
/** a dolly shot that starts creeping at its own first frame */
const D = (t0: number, pos: V3, look: V3, rest: Partial<Cam> = {}, rate = 0.0025, punch = 0, n = 30) =>
  (f: number) => dolly(pos, look, pushK(f, at(t0), rate, punch, n), rest);
const Z = (t0: number, pos: V3, look: V3, fov: number, rest: Partial<Cam> = {}, rate = 0.002, punch = 0, n = 30) =>
  (f: number) => zoom(pos, look, fov, pushK(f, at(t0), rate, punch, n), rest);

/** goose path on the ice (shot 36) and swimming (shot 16) */
export const gooseIceX = (t: number) => -7 + 2.1 * (t - 48.37);
export const gooseSwimX = (t: number) => -12 + 4.2 * (t - 18.04);
/** thin-Edwin in the hall: walks in from the door during shot 39 */

const CAMS: Record<number, Key[]> = {
  // hook (flash-forward): the throne room, the starving king offers the crown to the goose
  1: [{ f: 0, s: D(0, [H + 4.2, 2.3, -3.4], [H + 0.3, 1.3, -9.2], { fov: 42, roll: -0.03 }, 0.003) }],
  2: [{ f: at(1.2), s: D(1.2, [H + 2.2, 2.0, -5.6], [H + 0.9, 1.9, -8.0], { fov: 36, roll: 0.04 }, 0.003, 0.007) }],
  3: [{ f: at(2.31), s: D(2.31, [H + 0.7, 1.75, -7.0], [H, 1.55, -10.2], { fov: 36 }, 0.003, 0.008, 24) }],
  // the birthday party in the courtyard (nothing built yet)
  4: [{ f: at(3.29), s: D(3.29, [2.4, 1.75, 11.2], [-0.7, 1.3, 5.4], { fov: 42 }, 0.0025) }],
  5: [{ f: at(4.95), s: D(4.95, [5.6, 0.55, 2.2], [1.6, 0.6, 5.0], { fov: 40, roll: 0.03 }, 0.004) }],
  6: [{ f: at(5.66), s: D(5.66, [4.6, 1.4, 7.9], [0.1, 1.2, 6.2], { fov: 40 }, 0.003) }],
  7: [{ f: at(6.55), s: (f) => dolly([2.0, 2.2 + 0.5 * clamp01((f - at(6.55)) / 15), 8.6], [0, 2.05 + 0.5 * clamp01((f - at(6.55)) / 15), 6.0], pushK(f, at(6.55), 0.004), { fov: 36, roll: -0.05 }) }],
  8: [{ f: at(7.11), s: D(7.11, [0.6, 1.9, 9.6], [0, 1.65, 6.0], { fov: 38 }, 0.0025) }],
  9: [{ f: at(8.44), s: D(8.44, [0.25, 1.72, 8.1], [0, 1.66, 6.0], { fov: 34, roll: 0.07 }, 0.003, 0.012, 14) }],
  // walls and moats
  10: [{ f: at(9.34), s: Z(9.34, [38, 34, 62], [0, 2, 0], 42, {}, 0.0025) }],
  11: [{ f: at(10.79), s: Z(10.79, [62, 66, 98], [0, 0, 2], 42, { roll: -0.02 }, 0.002) }],
  12: [{ f: at(12.93), s: D(12.93, [15, 5.5, 37], [6, 0.5, 26], { fov: 44 }, 0.003) }],
  13: [{ f: at(13.76), s: Z(13.76, [-74, 58, 92], [0, 0, 6], 44, { roll: 0.02 }, 0.0025) }],
  14: [{ f: at(15.28), s: D(15.28, [5.0, 3.0, 45.0], [4.8, 0.2, 36.6], { fov: 44 }, 0.003, 0.006, 20) }],
  15: [{ f: at(16.46), s: D(16.46, [9.4, 12.1, WALL2_WALK - 6.8], [9.5, 11.3, WALL2_WALK], { fov: 38, roll: 0.02 }, 0.0025) }],
  16: [{ f: at(18.04), s: (f) => { const x = gooseSwimX(f / FPS); return dolly([x + 0.7, 1.5, 40.8], [x + 0.25, -0.1, 36.6], pushK(f, at(18.04), 0.002), { fov: 38 }); } }],
  17: [{ f: at(18.8), s: D(18.8, [6.5, 2.2, 41], [0, 4.0, 25], { fov: 42, roll: -0.03 }, 0.002) }],
  18: [{ f: at(20.33), s: D(20.33, [2.2, 2.1, 16.2], [2.6, 1.25, 9.4], { fov: 44 }, 0.003) }],
  19: [{ f: at(21.93), s: Z(21.93, [-62, 46, 84], [0, 4, 0], 42, {}, 0.003) }],
  20: [{ f: at(23.8), s: D(23.8, [11.9, 15.2, 35.0], [11.9, 10.9, WALL2_WALK], { fov: 40 }, 0.0025) }],
  21: [{ f: at(25.71), s: D(25.71, [9.8, 11.75, 25.6], [9.0, 11.55, WALL2_WALK], { fov: 36, roll: 0.03 }, 0.003, 0.008, 20) }],
  22: [{ f: at(27.19), s: D(27.19, [7.4, 1.6, 50.5], [4.6, 1.0, 42.5], { fov: 40, roll: -0.03 }, 0.003) }],
  // the castle is a lunchbox
  23: [{ f: at(27.8), s: Z(27.8, [76, 70, 108], [0, 2, 0], 44, {}, 0.002) }, { f: at(29.0), cut: true, s: Z(29.0, [-58, 60, 92], [0, 4, 0], 46, {}, 0.002) }],
  24: [{ f: at(30.24), s: Z(30.24, [96, 92, 140], [0, 8, 0], 44, { roll: 0.03 }, 0.002) }],
  25: [{ f: at(31.1), s: Z(31.1, [70, 96, 118], [0, 6, 0], 46, {}, 0.002) }],
  // weeks in the hall
  26: [{ f: at(33.45), s: D(33.45, [H + 0.3, 1.75, 3.9], [H + 0.2, 1.35, -1.0], { fov: 46 }, 0.0025) }],
  27: [{ f: at(35.15), s: D(35.15, [H + 0.5, 1.9, 2.3], [H, 1.6, -1.0], { fov: 36, roll: -0.03 }, 0.003, 0.008, 20) }],
  // the chef fishes from the outer wall
  28: [{ f: at(36.77), s: D(36.77, [14.6, 3.2, 31.6], [12, 10.4, 22.6], { fov: 46 }, 0.0025) },
    { f: at(38.46), cut: true, s: D(38.46, [13.5, 0.35, 29.4], [12.3, -0.25, 27.5], { fov: 40, roll: 0.03 }, 0.003) }],
  29: [{ f: at(39.69), s: D(39.69, [13.9, 0.4, 31.2], [12.5, 0.3, 27.6], { fov: 38 }, 0.003, 0.007, 20) }],
  30: [{ f: at(40.9), s: D(40.9, [13.0, 12.5, 26.6], [12, 11.2, WALL2_WALK], { fov: 38, roll: -0.08 }, 0.004) }],
  // week six: the lookout
  31: [{ f: at(41.46), s: D(41.46, [-11.9, 11.7, 19.9], [-11.0, 10.3, 40], { fov: 44 }, 0.0015) }],
  32: [{ f: at(43.44), s: Z(43.44, [-12.2, 12.0, 22.2], [HILL[0], HILL[1] + 0.6, HILL[2]], 9, {}, 0.004) }],
  33: [{ f: at(44.34), s: D(44.34, [-11.6, 11.6, 25.4], [-12.0, 11.55, WALL2_WALK], { fov: 36, roll: 0.03 }, 0.003) }],
  34: [{ f: at(45.34), s: (f) => zoom([HILL[0] + 2.6, HILL[1] + 1.0, HILL[2] - 8], [HILL[0], HILL[1] + 0.6, HILL[2]], 38, pushK(f, at(45.34), 0.002, 0.03, 8)) }],
  // winter
  35: [{ f: at(46.26) - 5, s: Z(46.26, [72, 52, 92], [0, 0, 8], 44, {}, 0.002) }, { f: at(47.49), cut: true, s: D(47.49, [18, 6, 52], [2, 0, 32], { fov: 44, roll: -0.02 }, 0.0025) }],
  36: [{ f: at(48.37), s: (f) => { const x = gooseIceX(f / FPS); return dolly([x - 1.0, 1.2, 41.6], [x + 0.6, -0.2, 36.6], pushK(f, at(48.37), 0.0015), { fov: 38 }); } }],
  37: [{ f: at(50.23), s: D(50.23, [SLIT_X + 1.6, 1.0, 29.2], [SLIT_X, 1.1, 24.3], { fov: 38 }, 0.003, 0.006, 20) }],
  38: [{ f: at(51.75), s: D(51.75, [H + 2.4, 1.7, -5.0], [H, 1.1, -10.0], { fov: 40, roll: 0.03 }, 0.0025) }],
  39: [{ f: at(53.4), s: D(53.4, [H + 0.5, 1.45, -8.4], [H, 1.4, 7.8], { fov: 30 }, 0.002) },
    { f: at(54.52), cut: true, s: (f) => vertigo([H + 0.15, 1.75, 5.9], [H, 1.7, 8.6], 34, glide((f - at(54.52)) / 30), 1.9) }],
  40: [{ f: at(55.57), s: D(55.57, [H + 1.3, 1.7, -4.9], [H + 0.65, 1.3, -9.6], { fov: 42, roll: -0.03 }, 0.003) }],
  41: [{ f: at(56.93), s: Z(56.93, [24, 15, 56], [0, 8, 4], 46, {}, 0.002) }, { f: at(58.05), cut: true, s: Z(58.05, [-70, 42, 96], [0, 6, 0], 44, {}, 0.0025) }],
  42: [{ f: at(59.56), s: D(59.56, [H + 0.6, 1.8, -7.2], [H + 0.25, 1.6, -10.2], { fov: 38 }, 0.003) }],
  43: [{ f: at(61.14), s: D(61.14, [H + 0.75, 1.95, -8.2], [H + 0.38, 1.85, -10.2], { fov: 36, roll: 0.06 }, 0.004, 0.02, 10) }],
};

// impact kicks: the image offset flips sign every frame and decays over 7 f
const KICKS: [number, number][] = [[EV.goose1, 0.6], [EV.bite, 1.4], [EV.wall1, 1.0], [EV.wall2, 1.2], [EV.moat1, 0.5], [EV.moat2, 0.5],
  [EV.eels, 0.6], [EV.bridgeShut, 1.3], [EV.melt, 0.5], [EV.boxShut, 1.2], [EV.lunch, 0.9], [EV.boot, 0.5], [EV.back, 1.2],
  [EV.goose6, 0.6], [EV.sit, 0.8], [EV.crown, 0.7], [EV.honk, 1.8]];
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

// ---------------- lens: depth of field per beat ----------------
/** cInf = blur-disc radius (px at 1080x1920) at infinity; 0 = all sharp. focus = world point, else the camera look point */
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const DOFS: [number, number][] = [
  [0, 8], [1.2, 14], [2.31, 15], [3.29, 7], [4.95, 12], [5.66, 10], [6.55, 14], [7.11, 12], [8.44, 15], [9.34, 0],
  [12.93, 8], [13.76, 0], [15.28, 12], [16.46, 12], [18.04, 10], [18.8, 4], [20.33, 12], [21.93, 0], [23.8, 10], [25.71, 14],
  [27.19, 10], [27.8, 0], [33.45, 9], [35.15, 14], [36.77, 6], [38.46, 12], [39.69, 13], [40.9, 14], [41.46, 0], [44.34, 14],
  [45.34, 10], [46.26, 0], [48.37, 10], [50.23, 12], [51.75, 10], [53.4, 8], [54.52, 13], [55.57, 11], [56.93, 0], [59.56, 15], [61.14, 16],
];
export const DOF: Dof[] = DOFS.map(([t, c]) => ({ f: fr(t), cInf: c }));
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
