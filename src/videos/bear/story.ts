// "Wojtek": timeline of the shots, timed to the voice word onsets (videos/wojtek/audio/words.json), the places, and
// the camera grammar of the template: hard cuts on big jumps, smootherstep glides, every hold creeps in, flip-sign
// impact kicks over 7 f, small rolls on punch words.
import { LightName } from "./lights";
export const FPS = 30;
export const VOICE_END = 63.3;
export const TOTAL = Math.round(VOICE_END * FPS);
export const D0 = 0; // ground level (build.ts helpers read it)
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;

// ---------------- places ----------------
/** Iran 1942 desert camp at the origin; the dock; Monte Cassino; the dinner room (analogy); Edinburgh Zoo */
export const DOCK: V3 = [-120, 0, 0];
export const CASS: V3 = [120, 0, 0];
export const ROOM: V3 = [300, 0, 0];
export const ZOO: V3 = [500, 0, 0];
export const BEAR = 1.1; // adult bear card scale (stands ~1.7 m)
export const CUB = 0.5;
/** Cassino ground: a plateau (the guns) for z < 0, a slope falling to the valley floor for z > 0 */
export const yCass = (z: number) => (z <= 0 ? 0 : z < 24 ? -0.28 * z : -6.72);

// ---------------- story events (seconds, voice timeline) ----------------
export const EV = {
  army: 1.55, wojtek: 2.43, corps: 3.83, iran: 5.92, camps: 8.7, buy: 9.11, cub: 10.13, boy: 10.98, me: 11.7, milk: 13.29, vodka: 13.91,
  beer: 15.34, cig: 16.0, wrestle: 16.69, win: 17.91, problem: 18.84, italy: 20.59, pets: 22.04, enlist: 22.82, name: 23.53, rank: 24.0,
  number: 24.39, soldier: 25.42, y1944: 26.22, cassino: 27.56, bloodiest: 28.58, war: 29.47, carry: 30.39, shells: 31.35, guns: 32.03,
  swear: 33.37, did: 34.02, wait: 34.52, why: 35.01, see: 36.71, copies: 38.26, puppy: 39.32, human: 40.12, guys: 41.48, badge: 43.09,
  shell: 44.85, promoted: 45.86, corporal: 46.73, luckily: 47.91, ends: 49.03, unluckily: 49.72, home: 51.15, free: 52.47, neither: 53.11,
  zoo: 55.88, visit: 57.71, shout: 58.4, polish: 58.99, up: 60.38, understands: 61.77,
};
/** gun flashes at Cassino */
export const FLASHES = [27.45, 28.3, 29.05, 29.75];

// ---------------- shots ----------------
export type Loc = "camp" | "hq";
export type ShotDef = { id: number; a: number; b: number; light: LightName; loc: Loc; tau: (t: number) => number };
const fr = (t: number) => Math.round(t * FPS);
/** cut times (s): shot k runs CUTS[k-1] .. CUTS[k]; a cut lands ~2 f before its word */
const CUTS = [0, 1.99, 3.01, 4.34, 6.48, 9.06, 11.35, 12.02, 14.67, 15.64, 16.51, 18.34, 19.31, 21.11, 22.46, 23.43, 25.09, 26.17, 27.21,
  29.9, 32.66, 33.81, 34.47, 34.96, 36.45, 39.0, 40.51, 42.09, 45.4, 46.68, 47.86, 49.67, 51.6, 53.06, 53.93, 56.34, 58.15, 59.5, 60.65, VOICE_END];
export const IRAN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], DOCKS = [13, 14, 15, 16, 17], ITALY = [18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31],
  HOMELESS = [32, 33], ROOMS = [26], ZOOS = [34, 35, 36, 37, 38, 39];
const lightOf = (id: number): LightName =>
  ROOMS.includes(id) ? "hall" : ZOOS.includes(id) || HOMELESS.includes(id) ? "winter" : ITALY.includes(id) && id !== 31 ? "golden" : "day";
export const SHOTS: ShotDef[] = CUTS.slice(0, -1).map((c, i) => {
  const id = i + 1;
  return { id, a: fr(c), b: fr(CUTS[i + 1]), light: lightOf(id), loc: ROOMS.includes(id) ? "hq" : "camp", tau: (t: number) => t };
});
SHOTS[SHOTS.length - 1].b = TOTAL;
export const XFADE: Record<number, number> = { 13: 8, 18: 8, 26: 8, 27: 8, 32: 8, 34: 8 };
export const FLASH_AT = fr(4.34);

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
const at = (t: number) => fr(t);
/** hold that creeps in (dolly toward the look point), with an optional punch-in on a word */
const D = (t0: number, pos: V3, look: V3, rest: Partial<Cam> = {}, rate = 0.0025, punch = 0, n = 30) =>
  (f: number) => dolly(pos, look, pushK(f, at(t0), rate, punch, n), rest);
/** crane: glide between two framings over the whole shot */
const C = (t0: number, t1: number, a: Shot, b: Shot) => (f: number): Shot => mixCam(full(a), full(b), glide((f / FPS - t0) / (t1 - t0)));
/** punch-in keyed to a later word inside the shot */
const P = (tw: number, punch = 0.02, n = 10) => (t0: number, pos: V3, look: V3, rest: Partial<Cam> = {}, rate = 0.0025) =>
  (f: number) => dolly(pos, look, pushK(f, at(t0), rate) * (f >= at(tw) - 2 ? pushK(f, at(tw) - 2, 0, punch, n) : 1), rest);

const X = DOCK[0], K = CASS[0], R = ROOM[0], Zx = ZOO[0];
/** bear on the gangplank (shot 17): walks up from the pier */
export const gangY = (z: number) => Math.max(0, Math.min(2.2, 0.1 + 0.525 * (-4.2 - z)));
export const gangBear = (t: number): V3 => { const z = -4.0 - 2.8 * clamp01((t - 25.2) / 1.0); return [X + 0.2, gangY(z), z]; };
/** crate carriers climbing the Cassino slope (shot 20) and the bear (shot 22) */
export const climb = (t: number, t0: number, z0: number, speed = 1.5): V3 => { const z = Math.max(1.2, z0 - speed * (t - t0)); return [0, yCass(z), z]; };

const CAMS: Record<number, Key[]> = {
  // hook: the lineup, the bear saluting among the men
  1: [{ f: 0, s: D(0, [0.7, 1.55, 6.8], [0, 1.25, 0], { fov: 40, roll: -0.02 }, 0.004, 0.012, 14) }],
  2: [{ f: at(1.99), s: P(EV.wojtek, 0.025)(1.99, [0.25, 1.35, 3.3], [0, 1.2, 0.3], { fov: 34, roll: 0.04 }, 0.004) }],
  3: [{ f: at(3.01), s: C(3.01, 4.34, { pos: [2.2, 1.7, 7.5], look: [0, 1.2, -1], fov: 44 }, { pos: [3.8, 3.4, 11], look: [0, 1.4, -2], fov: 46 }) }],
  // 1942, Iran
  4: [{ f: at(4.34) - 4, s: C(4.34, 6.48, { pos: [34, 30, 34], look: [0, 0, -8], fov: 44 }, { pos: [24, 20, 26], look: [0, 0, -6], fov: 42 }) }],
  5: [{ f: at(6.48), s: D(6.48, [-9.6, 1.5, 4.6], [-9.8, 1.1, -2.0], { fov: 42 }, 0.003) }],
  6: [{ f: at(9.06), s: P(EV.cub, 0.015)(9.06, [8.5, 1.15, 5.6], [8.45, 0.8, 0], { fov: 40, roll: 0.02 }, 0.003) }],
  7: [{ f: at(11.35), s: D(11.35, [8.25, 0.52, 1.55], [8.2, 0.42, 0.5], { fov: 32, roll: 0.05 }, 0.005, 0.015, 10) }],
  8: [{ f: at(12.02), s: P(EV.vodka, 0.015)(12.02, [-5.25, 0.95, 3.0], [-5.3, 0.65, -1.0], { fov: 40 }, 0.003) }],
  9: [{ f: at(14.67), s: D(14.67, [2.2, 1.25, 1.7], [2.1, 0.95, -3.2], { fov: 40, roll: 0.03 }, 0.004, 0.012, 12) }],
  10: [{ f: at(15.64), s: D(15.64, [2.65, 1.45, 0.3], [2.55, 1.3, -3.1], { fov: 38, roll: -0.04 }, 0.004, 0.012, 12) }],
  11: [{ f: at(16.51), s: P(EV.win, 0.03, 10)(16.51, [-1.9, 1.6, 2.6], [-2.0, 0.95, -3.0], { fov: 44 }, 0.003) }],
  12: [{ f: at(18.34), s: D(18.34, [-2.3, 1.42, -1.0], [-2.4, 1.33, -3.0], { fov: 34, roll: 0.05 }, 0.004, 0.02, 10) }],
  // the ship to Italy
  13: [{ f: at(19.31) - 4, s: C(19.31, 21.11, { pos: [X + 14, 3.6, 15], look: [X - 1, 3.2, -10], fov: 46 }, { pos: [X + 10, 3.0, 11], look: [X - 1, 2.6, -8], fov: 44 }) }],
  14: [{ f: at(21.11), s: P(EV.pets, 0.025)(21.11, [X + 0.2, 1.45, 0.9], [X + 0.05, 1.3, -3.8], { fov: 42, roll: 0.02 }, 0.003) }],
  15: [{ f: at(22.46), s: D(22.46, [X + 6.0, 1.45, 3.4], [X + 5.55, 1.15, -1.8], { fov: 42 }, 0.0035) }],
  16: [{ f: at(23.43), s: D(23.43, [X + 6, 1.32, -0.75], [X + 6, 1.05, -1.62], { fov: 36, roll: 0.03 }, 0.004) }],
  17: [{ f: at(25.09), s: (f) => { const p = gangBear(f / FPS); return { pos: [p[0] + 2.6, p[1] + 1.4, p[2] + 4.2], look: [p[0], p[1] + 1.2, p[2]], fov: 42 }; } }],
  // 1944, Monte Cassino
  18: [{ f: at(26.17) - 4, s: C(26.17, 27.21, { pos: [K - 5, 2.0, -14], look: [K + 8, 62, 300], fov: 34 }, { pos: [K - 4, 2.4, -12], look: [K + 8, 66, 300], fov: 32 }) }],
  19: [{ f: at(27.21), s: D(27.21, [K + 8.0, 1.5, -9.0], [K + 3.2, 1.25, -2.6], { fov: 44, roll: 0.03 }, 0.003) }],
  20: [{ f: at(29.9), s: D(29.9, [K + 0.4, 0.75, -3.0], [K, -1.4, 7], { fov: 44 }, 0.0025) }],
  21: [{ f: at(32.66), s: D(32.66, [K - 0.3, 1.6, -1.7], [K - 0.35, 1.35, -6.0], { fov: 40, roll: -0.03 }, 0.004, 0.012, 12) }],
  22: [{ f: at(33.81), s: (f) => { const p = climb(f / FPS, 33.81, 4.6, 1.1); return { pos: [K - 0.6, p[1] + 1.4, p[2] - 3.4], look: [K - 1.0, p[1] + 1.0, p[2]], fov: 42, roll: 0.03 }; } }],
  23: [{ f: at(34.47), s: D(34.47, [K - 0.95, 1.62, -4.7], [K - 1.0, 1.55, -6.0], { fov: 34, roll: 0.07 }, 0.005, 0.03, 8) }],
  24: [{ f: at(34.96), s: D(34.96, [K - 0.5, 1.45, -4.3], [K - 0.9, 1.3, -0.4], { fov: 40 }, 0.004) }],
  25: [{ f: at(36.45), s: P(EV.copies, 0.02)(36.45, [K + 5.6, 1.4, -3.4], [K + 5.6, 1.2, -8.0], { fov: 42 }, 0.003) }],
  // like a puppy that thinks it's human
  26: [{ f: at(39.0) - 4, s: D(39.0, [R + 1.55, 1.2, 0.5], [R + 1.6, 0.85, -2.6], { fov: 44, roll: 0.02 }, 0.003) }],
  27: [{ f: at(40.51) - 4, s: D(40.51, [K - 7.7, 1.3, -5.4], [K - 8, 0.9, -10], { fov: 46 }, 0.003, 0.01, 14) }],
  28: [{ f: at(42.09), s: P(EV.shell, 0.015)(42.09, [K - 12, 1.75, -8.6], [K - 12, 1.75, -11.9], { fov: 40 }, 0.003) }],
  29: [{ f: at(45.4), s: D(45.4, [K - 5.4, 1.5, -9.4], [K - 5.4, 1.2, -14], { fov: 42 }, 0.003, 0.012, 12) }],
  30: [{ f: at(46.68), s: D(46.68, [K - 4.75, 1.45, -11.7], [K - 4.8, 1.25, -14], { fov: 36, roll: -0.04 }, 0.004, 0.015, 12) }],
  31: [{ f: at(47.86), s: C(47.86, 49.67, { pos: [K + 5, 2.0, -8.5], look: [K + 5, 1.3, -14], fov: 44 }, { pos: [K + 5.6, 3.2, -6.5], look: [K + 5, 1.4, -14], fov: 46 }) }],
  // can't go home
  32: [{ f: at(49.67) - 4, s: D(49.67, [X - 6, 1.45, 2.8], [X - 6, 1.25, -3.2], { fov: 42 }, 0.0025) }],
  33: [{ f: at(51.6), s: P(EV.free, 0.015)(51.6, [X - 10.2, 1.7, 1.6], [X - 10, 2.0, -4], { fov: 42, roll: 0.02 }, 0.003) }],
  // Edinburgh Zoo
  34: [{ f: at(53.06) - 4, s: D(53.06, [Zx + 0.15, 1.62, 1.5], [Zx, 1.3, -2.5], { fov: 36 }, 0.004) }],
  35: [{ f: at(53.93), s: C(53.93, 56.34, { pos: [Zx + 9, 6.5, 10], look: [Zx - 1, 0.6, -4], fov: 44 }, { pos: [Zx + 7, 5.0, 8], look: [Zx - 1, 0.6, -4], fov: 42 }) }],
  36: [{ f: at(56.34), s: D(56.34, [Zx + 0.6, 2.2, -4.0], [Zx + 0.25, 1.5, 0.6], { fov: 44 }, 0.003) }],
  37: [{ f: at(58.15), s: P(EV.polish, 0.02)(58.15, [Zx + 0.4, 2.2, -2.4], [Zx + 0.3, 1.55, 0.6], { fov: 38, roll: 0.03 }, 0.004) }],
  38: [{ f: at(59.5), s: D(59.5, [Zx - 0.35, 1.05, -1.6], [Zx - 0.5, 1.25, -4], { fov: 40, roll: -0.03 }, 0.0035, 0.012, 14) }],
  39: [{ f: at(60.65), s: D(60.65, [Zx - 0.42, 1.38, -2.4], [Zx - 0.5, 1.4, -4], { fov: 36, roll: 0.02 }, 0.004) }],
};

// impact kicks: the image offset flips sign every frame and decays over 7 f
const KICKS: [number, number][] = [[EV.army, 0.6], [EV.win, 1.6], [EV.pets, 0.8], [EV.name, 0.8], [EV.rank, 0.8], [EV.number, 0.8], [27.45, 1.4],
  [28.3, 1.2], [29.05, 1.0], [29.75, 0.9], [EV.wait, 1.2], [EV.promoted, 0.6], [EV.ends, 0.6]];
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
/** cInf px at 1080 per shot: close-ups 12-16, mediums 8-12, wides and aerials 0 */
const DOFC = [12, 15, 4, 0, 8, 10, 16, 12, 12, 12, 8, 15, 0, 10, 10, 14, 8, 0, 8, 6, 12, 10, 15, 10, 10, 10, 10, 12, 10, 14, 6, 8, 10, 15, 0, 8, 12, 12, 15];
export const DOF: Dof[] = CUTS.slice(0, -1).map((t, i) => ({ f: fr(t), cInf: DOFC[i] }));
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
