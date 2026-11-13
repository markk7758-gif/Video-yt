// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxBurst, fxShadow, fxContact, fxPuff, fxFire, fxQuestion, fxNote, Outfit, Expr, FrontOpts, SideOpts, Prop,
  POLE, GULAG, LOCAL_BOY, BRIT_OFFICER, CLERK, VETERAN, DINER, bearDraw, BearOpts, puppyDraw, fxBadge, fxFlagPL, fxPaybook, fxShout, fxNoPets,
} from "./toon";
import { FPS, V3, smooth, clamp01, EV, DOCK, CASS, ROOM, ZOO, BEAR, CUB, yCass, gangBear, gangY, climb } from "./story";
import { LightName } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 1;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; roll?: number; size?: [number, number, number]; sx?: number; sy?: number;
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1200, 2000, 2.0] : d < 6.5 ? [720, 1200, 1.2] : d < 16 ? [360, 600, 0.6] : [180, 300, 0.3]; // sized for the 1080 x 1920 final

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: LightName = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<LightName, [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33], winter: [0.3, 0.33, 0.48], hall: [0.22, 0.18, 0.3], night: [0.25, 0.27, 0.42] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day" || LNAME === "winter") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ---------------- "Wojtek": who is where, shot by shot ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };
/** expression timeline: the last [time, expr] whose time (minus the 2-frame lead) has passed */
let EX_T0 = -1;
const ex = (t: number, tl: [number, Expr][]): Expr => {
  let e = tl[0][1]; EX_T0 = -1;
  for (const [t0, x] of tl) if (t >= t0 - LEAD) { e = x; if (t0 > 0) EX_T0 = t0; }
  return e;
};
/** snappy pop with overshoot after a pose/face change: stretch up, dip, settle (age in s) */
const popK = (age: number) => (age >= 0 && age < 0.45 ? Math.exp(-age * 9) * Math.cos(age * 22) : 0);
type PersonOpts = { side?: boolean; mirror?: boolean; so?: SideOpts; scale?: number; shadow?: boolean; i?: number; flip?: boolean; popAt?: number };
const human = (out: Stage, cam: CamInfo, t: number, o: Outfit, okey: string, x: number, y: number, z: number, fo: FrontOpts, po: PersonOpts = {}) => {
  const i = po.i ?? okey.length * 7;
  const blink = fo.blink ?? lidAt(t, i);
  const who: Who = { i, o, okey };
  const pl = person(cam, who, x, y, z, { side: !!po.side, mirror: !!po.mirror }, { ...fo, blink }, { blink, ...(po.so ?? {}), expr: po.so?.expr ?? fo.expr }, po.scale ?? 1);
  // idle life: slow breathing squash + a small sway from the feet, own phase per character; a squash-stretch pop
  // with overshoot on every face change (lands with the 2-frame lead on the beat word)
  const ph = hh(i, 17) * Math.PI * 2, still = (fo.mode ?? "stand") === "stand" || po.side;
  const t0 = po.popAt ?? EX_T0, k = t0 > 0 ? popK(t - (t0 - LEAD)) : 0;
  EX_T0 = -1;
  pl.sy = (1 + 0.07 * k) * (still ? 1 + 0.012 * Math.sin(2 * Math.PI * 0.5 * t + ph) : 1);
  pl.sx = 1 - 0.045 * k;
  if (still && !po.side) pl.roll = (fo.tilt ? 0 : 0.018 * Math.sin(2 * Math.PI * 0.31 * t + 1.3 * ph)) + 0.03 * k;
  if (po.flip) pl.mirror = true; // front view drawn facing right, flipped to face left
  out.places.push(pl);
  if (po.shadow !== false) blob(out, x, y, z, po.scale ?? 1);
};
const burst = (out: Stage, t: number, t0: number, x: number, y: number, z: number, size = 1, col = "#fff3b0", dur = 0.25) => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  out.fx.push({ key: `burst${col}${u}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, u, col), x, y, z, w: size, h: size });
};
const puffs = (out: Stage, t: number, t0: number, pts: [number, number, number][], size = 3, dur = 0.8) => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  pts.forEach(([x, y, z], i) => out.fx.push({ key: `puff${u}`, cw: 300, ch: 300, draw: (p) => fxPuff(p, u), x, y: y + size * 0.3 * u, z, w: size * (1 + 0.6 * u), h: size * (1 + 0.6 * u), soft: true, rot: i }));
};
/** cold breath: a small soft puff from the mouth every ~2.2 s */
const breath = (out: Stage, t: number, x: number, y: number, z: number, seed: number, side = 1) => {
  const u = ((t + hh(seed, 3) * 2.2) % 2.2) / 0.9;
  if (u >= 1) return;
  const uq = q(u, 20);
  out.fx.push({ key: `puff${uq}`, cw: 300, ch: 300, draw: (p) => fxPuff(p, uq), x: x + side * (0.12 + 0.25 * u), y: y + 0.05 * u, z, w: 0.22 + 0.3 * u, h: 0.22 + 0.3 * u, soft: true });
};
/** sung notes drifting up and sideways from a singer's mouth */
const notes = (out: Stage, t: number, x: number, y: number, z: number, seed: number, col = "#f4f0e6", side = 1) => {
  for (let n = 0; n < 3; n++) {
    const age = ((t + n * 0.55 + hh(seed, 5)) % 1.65) / 1.65;
    const pop = Math.min(1, age * 7) * (age > 0.8 ? (1 - age) / 0.2 : 1);
    if (pop <= 0.02) continue;
    const kind = (n + seed) % 2;
    out.fx.push({ key: `note${kind}${col}`, cw: 220, ch: 260, draw: (p) => fxNote(p, kind, col), x: x + side * (0.15 + 0.4 * age) + 0.06 * Math.sin(age * 9 + n), y: y + 0.9 * age, z,
      w: 0.17 * pop, h: 0.2 * pop, rot: 0.3 * Math.sin(age * 6 + n) });
  }
};
const boom = (out: Stage, t: number, t0: number, x: number, y: number, z: number, size = 2) => {
  if (t < t0 || t > t0 + 1.0) return;
  const u = (t - t0) / 1.0;
  burst(out, t, t0, x, y, z, size, "#ffd27a", 0.22);
  if (u < 0.3) { const uq = q((u / 0.3) % 1, 10); out.fx.push({ key: `fire${uq}`, cw: 300, ch: 400, draw: (p) => fxFire(p, uq), x, y, z, w: size * 0.6, h: size * 0.5 * (1 - u) }); }
  puffs(out, t, t0 + 0.05, [[x, y, z], [x + size * 0.3, y + 0.2, z + 0.3]], size, 0.95);
};
const fx = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, x: number, y: number, z: number, w: number, h: number, rot = 0, soft = false) =>
  out.fx.push({ key, cw, ch, draw, x, y, z, w, h, rot, soft });

/** Wojtek (or the cub) as a lit card: front view, ~1.7 m standing at BEAR scale */
const bear = (out: Stage, cam: CamInfo, t: number, x: number, y: number, z: number, o: BearOpts, scale = BEAR, shadow = true, i = 80, popAt?: number) => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2 * scale, z)) / scale, [w, h, k] = tier(d);
  const g: BearOpts = { blink: lidAt(t, i), light: light2D(cam, false), ...o, phase: o.phase !== undefined ? q(o.phase, 12) : undefined, lookUp: o.lookUp !== undefined ? q(o.lookUp, 12) : undefined };
  const pk = popAt !== undefined ? popK(t - (popAt - LEAD)) : 0;
  out.places.push({ key: `B|${fkey(g)}`, x, y, z, scale, size: [w, h, k], draw: (p) => bearDraw(p, g), sy: (1 + 0.06 * pk) * (1 + 0.01 * Math.sin(t * 3.1 + i)), sx: 1 - 0.04 * pk,
    roll: 0.015 * Math.sin(2 * Math.PI * 0.27 * t + i) });
  if (shadow) blob(out, x, y, z, scale * (o.mode === "sit" ? 1.3 : 1.1));
};
const flag = (out: Stage, t: number, x: number, y: number, z: number, w = 1.3, slow = 1) => {
  const tq = q((t * slow) % 1, 15);
  fx(out, `flagPL${tq}`, 300, 200, (p) => fxFlagPL(p, tq), x, y, z, w, w * 0.667);
};
const lineup: [number, number, Expr][] = [[-3.3, 0, "stern"], [-2.1, 1, "neutral"], [-1.0, 2, "smile"], [1.05, 3, "stern"], [2.15, 4, "neutral"], [3.3, 0, "smile"]];

/** everything with a face (and every 2D effect) in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo, light: LightName): Stage => {
  const out: Stage = { places: [], fx: [] };
  LNAME = light;
  findSun(cam, SUN);
  const E = (o: Outfit, k: string, x: number, y: number, z: number, fo: FrontOpts, po?: PersonOpts) => human(out, cam, t, o, k, x, y, z, fo, po);
  const B = (x: number, y: number, z: number, o: BearOpts, scale = BEAR, popAt?: number) => bear(out, cam, t, x, y, z, o, scale, true, 80, popAt);
  const X = DOCK[0], K = CASS[0], R = ROOM[0], Z = ZOO[0];
  const salute = (k: number): Prop => (t > k ? "salute" : null);
  switch (id) {
    // ---- the hook: a bear in the lineup ----
    case 1: case 2: case 3: case 4: {
      lineup.forEach(([x, v, e], i) => E(POLE(v), `p${v}`, x, 0, i % 2 ? -0.15 : 0, { mode: "stand", expr: e, prop: salute(0.35 + i * 0.07) }, { i: 10 + i }));
      B(0, 0, 0.3, { expr: ex(t, [[0, "smile"], [EV.wojtek, "smile_closed"], [EV.corps, "smile"]]), prop: "salute", cap: true });
      flag(out, t, 4.85, 4.0, -3.2);
      if (id === 4) for (let i = 0; i < 6; i++) E(POLE(i), `p${i}`, -14 + i * 5.3, 0, 6 + (i % 3) * 3, { mode: "stroll", phase: q((t * 1.1 + i * 0.3) % 1, 30), expr: "neutral" }, { i: 30 + i });
      break;
    }
    // ---- out of the camps ----
    case 5: {
      for (let i = 0; i < 5; i++) {
        const z = -3.6 + 0.5 * (t - 6.48) + (i % 2) * 1.1, x = -11.7 + i * 0.95;
        E(GULAG(i), `gu${i}`, x, 0, z, { mode: "stroll", phase: q((t * 0.9 + i * 0.27) % 1, 30), expr: (["sad", "dazed", "neutral", "sad", "pained"] as Expr[])[i] }, { i: 40 + i });
      }
      break;
    }
    case 6: case 7: {
      E(LOCAL_BOY, "boy", 7.65, 0, 0.1, { mode: "stand", expr: ex(t, [[0, "smile"], [EV.buy, "grin"]]), prop: t > EV.buy ? "choc" : null, facing: 1 }, { i: 50 });
      E(POLE(4), "p4", 9.15, 0, 0.1, { mode: "stand", expr: "smile", prop: t < EV.buy ? "choc" : null, facing: -1 }, { i: 51, flip: true });
      B(8.2, 0, 0.5, { mode: "sit", cub: true, expr: id === 7 ? ex(t, [[0, "neutral"], [EV.me, "smile_closed"]]) : "neutral", look: id === 6 ? -1 : 0 }, CUB, id === 7 ? EV.me : undefined);
      break;
    }
    case 8: {
      E(POLE(1), "p1", -4.75, 0.5, -1.6, { mode: "sit", expr: ex(t, [[0, "smile_closed"], [EV.vodka, "grin"]]), facing: -1 }, { i: 52, shadow: false });
      B(-5.6, 0, -0.85, { mode: "sit", cub: true, prop: "milk", expr: "smile_closed" }, CUB);
      break;
    }
    // ---- beer, cigarettes, wrestling ----
    case 9: {
      B(2.0, 0, -3.0, { mode: "sit", prop: "beer", expr: ex(t, [[0, "smile_closed"], [EV.beer, "grin"]]) }, BEAR, EV.beer);
      E(POLE(2), "p2", 1.05, 0, -3.8, { mode: "stand", expr: "laugh" }, { i: 53 });
      E(POLE(3), "p3", 3.1, 0, -3.7, { mode: "stand", expr: "grin", prop: "mug" }, { i: 54 });
      break;
    }
    case 10: {
      B(2.2, 0, -3.0, { prop: t > EV.cig - 0.07 ? "cig" : null, expr: ex(t, [[0, "neutral"], [EV.cig, "smile"]]) }, BEAR, EV.cig);
      E(POLE(4), "p4", 3.15, 0, -3.3, { mode: "stand", expr: ex(t, [[0, "smile"], [EV.cig, "shock"]]), prop: t < EV.cig - 0.07 ? "cig" : null, facing: -1 }, { i: 55, flip: true });
      break;
    }
    case 11: {
      const won = t > EV.win - 0.07;
      B(-2.45, 0, -3.0, { prop: won ? "wrestle" : "wrestle", expr: won ? "laugh" : "grin" }, BEAR, EV.win);
      if (!won) E(POLE(3), "p3", -1.55, 0, -3.0, { mode: "stand", expr: "nervous", prop: "cheer", tilt: -8 }, { i: 56 });
      else E(POLE(3), "p3", -1.2, 0.25, -2.9, { mode: "fall", expr: "dazed" }, { i: 56, shadow: false, popAt: EV.win });
      if (won) burst(out, t, EV.win, -1.3, 0.4, -2.9, 1.2, "#fff3b0", 0.3);
      for (const [x, z, v, e] of [[-4.1, -4.5, 0, "laugh"], [-0.2, -4.6, 1, "grin"], [-3.3, -5.6, 2, "grin"], [0.6, -5.4, 4, "laugh"]] as const)
        E(POLE(v), `p${v}`, x, 0, z, { mode: "stand", expr: won ? "laugh" : e, prop: won ? "cheer" : null }, { i: 57 + v });
      break;
    }
    case 12: B(-2.45, 0, -3.0, { expr: ex(t, [[0, "smile"], [EV.problem, "nervous"]]), look: t > EV.problem ? 1 : 0 }, BEAR, EV.problem); break;
    // ---- the ship won't take pets ----
    case 13: {
      for (let i = 0; i < 9; i++) E(POLE(i), `p${i % 5}`, X - 11 + i * 2.4, 2.2, -9.0 - (i % 2) * 0.4, { mode: "stand", expr: "grin", wave: q(Math.sin(t * 7 + i), 15) }, { i: 60 + i, shadow: false });
      for (let i = 0; i < 4; i++) { const z = -4.3 - 0.9 * i - 0.45 * (t - 19.31), y = gangY(z); if (z > -8.2) E(POLE(i + 1), `p${i + 1}`, X + 0.2, y, z, { mode: "stroll", phase: q((t * 1.2 + i * 0.25) % 1, 30), expr: "neutral" }, { i: 70 + i }); }
      B(X + 2.2, 0, -2.6, { expr: "grin", cap: false }, BEAR);
      break;
    }
    case 14: {
      E(BRIT_OFFICER, "brit", X - 0.6, 0, -3.95, { mode: "stand", expr: "stern", prop: "hand", facing: 1 }, { i: 75 });
      B(X + 0.8, 0, -3.5, { expr: ex(t, [[0, "smile"], [EV.pets, "shock"]]) }, BEAR, EV.pets);
      if (t > EV.pets - 0.1) { const k = Math.min(1, (t - EV.pets + 0.1) / 0.18), s = 0.85 * (k < 1 ? k * 1.15 : 1); fx(out, "nopets", 300, 300, fxNoPets, X + 0.1, 2.45, -3.7, s, s); }
      break;
    }
    case 15: {
      E(CLERK, "clerk", X + 6.3, 0, -2.75, { mode: "stand", expr: "neutral", prop: ["stamp", t > EV.enlist ? clamp01(Math.sin((t - EV.enlist) * 9) * 0.5 + 0.5) : 0], facing: -1 }, { i: 76, flip: true });
      B(X + 5.0, 0, -0.85, { expr: ex(t, [[0, "neutral"], [EV.enlist, "smile"]]) }, BEAR, EV.enlist);
      break;
    }
    case 16: {
      const n = [EV.name, EV.rank, EV.number].filter((k) => t > k - 0.07).length;
      fx(out, `paybook${n}`, 400, 300, (p) => fxPaybook(p, n), X + 6, 1.05, -1.62, 0.66, 0.495, 0.02);
      for (const [k, i] of [[EV.name, 0], [EV.rank, 1], [EV.number, 2]] as const) burst(out, t, k, X + 6.13 - 0.04 * (i % 2), 1.18 - 0.1 * i, -1.6, 0.3, "#bfe0ff", 0.22);
      break;
    }
    case 17: {
      const p = gangBear(t);
      B(p[0], p[1], p[2], { mode: t > 25.2 && t < 26.2 ? "walk" : "stand", phase: (t * 1.6) % 1, cap: true, expr: "smile", prop: t > 26.0 ? "salute" : null }, BEAR);
      for (const [x, z, v] of [[X + 1.7, -3.0, 0], [X - 1.3, -3.3, 2], [X + 2.9, -2.4, 4], [X - 2.4, -2.5, 1]] as const) E(POLE(v), `p${v}`, x, 0, z, { mode: "stand", expr: "laugh", prop: "cheer" }, { i: 80 + v });
      break;
    }
    // ---- Monte Cassino ----
    case 18: case 19: {
      const crew: [number, number, number][] = [[K + 1.5, -4.5, 1], [K + 4.7, -4.3, 3], [K + 5.6, -3.0, 0]];
      crew.forEach(([x, z, v], i) => E(POLE(v, { hat: "brodie" }), `ph${v}`, x, 0, z, { mode: "stand", expr: FLASH(t) ? "pained" : "stern", prop: i === 2 ? "crate" : FLASH(t) ? "pray" : null }, { i: 90 + i }));
      for (const t0 of [27.45, 28.3, 29.05, 29.75]) boom(out, t, t0, K + 3, 2.45, 0.35, 1.8);
      for (let i = 0; i < 4; i++) { const age = ((t * 0.12 + i * 0.25) % 1); fx(out, `smoke${q(age, 10)}`, 300, 300, (p) => fxPuff(p, 0.25 + 0.5 * q(age, 10)), K + 10 + (i - 1.5) * 18, 122 + 30 * age, 316, 34 + 26 * age, 34 + 26 * age, i, true); }
      break;
    }
    case 20: {
      [[5.6, -1.1, 1], [7.2, 0.6, 2], [8.8, -0.3, 3], [10.4, 1.1, 4]].forEach(([z0, dx, v], i) => {
        const p = climb(t, 29.9, z0, 1.2);
        E(POLE(v, { hat: "brodie" }), `ph${v}`, K + dx, p[1], p[2], { mode: "stroll", phase: q((t * 1.0 + i * 0.3) % 1, 30), expr: i % 2 ? "pained" : "stern", prop: "crate" }, { i: 100 + i });
      });
      break;
    }
    case 21: {
      E(POLE(1, { hat: "brodie" }), "ph1", K - 0.9, 0, -6.0, { mode: "stand", expr: "stern", prop: t > EV.swear - 0.07 ? "salute" : null, facing: 1 }, { i: 110, popAt: EV.swear });
      E(POLE(2, { hat: "brodie" }), "ph2", K + 0.2, 0, -6.2, { mode: "stand", expr: ex(t, [[0, "neutral"], [EV.swear, "stern"]]), prop: t > EV.swear ? "pray" : null, facing: -1 }, { i: 111 });
      break;
    }
    case 22: { const p = climb(t, 33.81, 4.6, 1.1); B(K - 1.0, p[1], p[2], { mode: "walk", phase: (t * 1.4) % 1, prop: "crate", expr: ex(t, [[0, "smile"], [EV.did, "smile_closed"]]) }, BEAR, EV.did); break; }
    case 23: E(POLE(1, { hat: "brodie" }), "ph1", K - 1.0, 0, -6.0, { mode: "stand", expr: "shock" }, { i: 110, popAt: EV.wait }); break;
    case 24: {
      B(K - 1.0, 0, -0.4, { prop: "crate", expr: ex(t, [[0, "neutral"], [EV.why, "smile"]]), look: 1 }, BEAR);
      if (t > EV.why - 0.05) { const k = Math.min(1, (t - EV.why + 0.05) / 0.15); fx(out, "question", 200, 300, fxQuestion, K - 0.45, 2.05, -0.4, 0.36 * k, 0.54 * k); }
      break;
    }
    case 25: {
      E(POLE(0), "p0", K + 6.25, 0, -8.0, { mode: "stand", expr: "stern", prop: t > 36.9 ? "salute" : null }, { i: 112 });
      B(K + 5.0, 0, -8.0, { prop: t > EV.copies - 0.07 ? "salute" : null, cap: true, expr: ex(t, [[0, "neutral"], [37.5, "nervous"], [EV.copies, "smile"]]), look: t < EV.copies ? 1 : 0 }, BEAR, EV.copies);
      break;
    }
    // ---- the puppy ----
    case 26: {
      E(DINER(0), "din0", R + 0.15, 0.3, -3.35, { mode: "sit", expr: ex(t, [[0, "smile"], [EV.human, "grin"]]), facing: 1 }, { i: 120, shadow: false });
      E(DINER(1), "din1", R + 1.3, 0.3, -3.35, { mode: "sit", expr: "smile_closed", facing: 1 }, { i: 121, shadow: false });
      const pq = lidAt(t, 122);
      out.places.push({ key: `pup|${pq}|${t > EV.human ? 1 : 0}`, x: R + 2.25, y: 0.48, z: -2.3, scale: 0.42, mirror: true, size: [720, 1200, 1.2], draw: (p) => puppyDraw(p, { blink: pq, lick: t > EV.human, light: light2D(cam, true) }) });
      break;
    }
    // ---- one of the guys ----
    case 27: {
      B(K - 8.0, 0, -9.9, { mode: "sit", prop: "mug", expr: ex(t, [[0, "grin"], [EV.guys, "laugh"]]) }, BEAR, EV.guys);
      E(POLE(1), "p1", K - 9.0, 0.45, -10.0, { mode: "sit", expr: "laugh", prop: "mug", facing: 1 }, { i: 123, shadow: false });
      E(POLE(2), "p2", K - 7.0, 0.45, -10.1, { mode: "sit", expr: ex(t, [[0, "grin"], [EV.guys, "laugh"]]), prop: "mug", facing: -1 }, { i: 124, shadow: false, flip: true });
      break;
    }
    case 28: fx(out, "badge", 600, 600, fxBadge, K - 12, 1.75, -11.95, 1.5, 1.5); break;
    case 29: case 30: {
      const st = t > EV.promoted - 0.07;
      if (id === 29) E(CLERK, "clerkO", K - 6.05, 0, -14.1, { mode: "stand", expr: ex(t, [[0, "neutral"], [EV.promoted, "smile"]]), prop: st ? null : "button", facing: 1 }, { i: 125 });
      B(K - 4.8, 0, -14, { cap: true, stripes: st, expr: id === 30 ? "smile_closed" : ex(t, [[0, "neutral"], [EV.promoted, "smile"]]), prop: id === 30 ? "salute" : null }, BEAR, id === 29 ? EV.promoted : EV.corporal);
      if (id === 29) burst(out, t, EV.promoted, K - 5.35, 1.1, -13.9, 0.5, "#ffe07a");
      break;
    }
    case 31: {
      const ends = t > EV.ends - 0.07;
      for (const [dx, dz, v] of [[-1.7, 0, 0], [-0.7, -0.6, 1], [1.3, -0.3, 2], [2.2, 0.2, 3]] as const)
        E(POLE(v), `p${v}`, K + 5 + dx, 0, -14 + dz, { mode: "stand", expr: ends ? "laugh" : "grin", prop: ends ? "cheer" : null }, { i: 130 + v });
      B(K + 5.3, 0, -14.2, { prop: ends ? "wrestle" : null, cap: true, stripes: true, expr: ends ? "laugh" : "smile" }, BEAR, EV.ends);
      for (const [k, dx, col] of [[0, -1.5, "#ffe07a"], [0.3, 1.6, "#bfe0ff"], [0.55, 0.2, "#f28fb5"]] as const) burst(out, t, EV.ends + k, K + 5 + dx, 3.4 + k, -14.6, 1.1, col, 0.35);
      break;
    }
    // ---- can't go home ----
    case 32: {
      for (const [x, z, v] of [[X - 7.6, -3.7, 0], [X - 6.6, -3.9, 1], [X - 4.5, -3.6, 2], [X - 3.6, -3.85, 4]] as const)
        E(POLE(v), `p${v}`, x, 0, z, { mode: "stand", expr: ex(t, [[0, "neutral"], [EV.home, "sad"]]) }, { i: 140 + v });
      B(X - 5.6, 0, -3.4, { cap: true, stripes: true, expr: ex(t, [[0, "neutral"], [EV.home, "sad"]]) }, BEAR);
      break;
    }
    case 33: {
      fx(out, `flagLimp${q((t * 0.25) % 1, 10)}`, 300, 200, (p) => fxFlagPL(p, q((t * 0.25) % 1, 10)), X - 10.15, 3.15, -4.6, 1.3, 0.87);
      E(POLE(4), "p4", X - 9.9, 0, -2.2, { mode: "stand", expr: ex(t, [[0, "neutral"], [EV.free, "sad"]]) }, { i: 145 });
      break;
    }
    // ---- Edinburgh Zoo ----
    case 34: B(Z, 0, -2.5, { expr: "sad", look: -1 }, BEAR); break;
    case 35: {
      B(Z - 2, 0, -5, { mode: "sit", expr: "sad" }, BEAR);
      for (const [x, z, v] of [[Z + 3, 0.8, 0], [Z + 4.1, 1.3, 1], [Z - 6.2, 1.0, 2]] as const) E(DINER(v + 2), `din${v + 2}`, x, 0, z, { mode: "stand", expr: "neutral" }, { i: 150 + v });
      break;
    }
    case 36: case 37: {
      const vet: [number, number, number, Expr][] = [[Z - 0.75, 0.62, 0, "smile"], [Z + 0.25, 0.55, 1, "relief_open"], [Z + 1.3, 0.7, 2, "smile"]];
      vet.forEach(([x, z, v, e], i) => E(VETERAN(v), `vet${v}`, x, 0, z, { mode: "stand", expr: id === 37 && i === 1 ? "laugh" : e, prop: id === 37 && i === 1 && t > EV.polish - 0.07 ? "shout" : i === 1 && id === 36 ? "cheer" : null }, { i: 160 + v }));
      if (id === 37 && t > EV.polish) fx(out, "shout", 300, 300, fxShout, Z + 0.62, 1.55, 0.4, 0.42, 0.42);
      break;
    }
    case 38: {
      const up = smooth((t - (EV.up - 0.25)) / 0.35);
      B(Z - 0.5, 0, -4, { expr: ex(t, [[0, "sad"], [EV.up, "neutral"]]), lookUp: up }, BEAR, EV.up);
      break;
    }
    case 39: B(Z - 0.5, 0, -4, { expr: ex(t, [[0, "neutral"], [EV.understands, "smile_closed"]]), lookUp: 1 }, BEAR, EV.understands); break;
  }
  return out;
};
const FLASH = (t: number) => [27.45, 28.3, 29.05, 29.75].some((t0) => t >= t0 && t < t0 + 0.2);
