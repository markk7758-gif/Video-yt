// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxBurst, fxShadow, fxContact, fxPuff, fxFire, fxNote, FRITZ, DOUGHBOY, MAJOR, FRENCH_GENERAL, SCIENTIST, HISTORIAN, HANDLER,
  pigeonDraw, PigeonOpts, fxNotePaper, fxDNA, fxMale, fxFemaleX, fxQuestion, Outfit, Expr, FrontOpts, SideOpts,
} from "./toon";
import { FPS, V3, smooth, clamp01, EV, GERZ, GUN, LOFT, HQ, PIG, flight1, flight2, heroFly } from "./story";
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

// ---------------- The Christmas Truce: who is where, shot by shot ----------------
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
const ball = (p: Pen) => { p.ell(60, 60, 50, 50, "#8a5a34", 8); p.stroke([[20, 40], [100, 80]], 5); p.stroke([[60, 12], [60, 108]], 5); };
const boom = (out: Stage, t: number, t0: number, x: number, z: number, size = 5) => {
  if (t < t0 || t > t0 + 1.2) return;
  const u = (t - t0) / 1.2;
  burst(out, t, t0, x, size * 0.35, z, size, "#ffd27a", 0.3);
  if (u < 0.5) { const uq = q(u * 2 % 1, 12); out.fx.push({ key: `fire${uq}`, cw: 300, ch: 400, draw: (p) => fxFire(p, uq), x, y: size * 0.18, z, w: size * 0.5, h: size * 0.45 * (1 - u) }); }
  puffs(out, t, t0 + 0.08, [[x, 0.4, z], [x - size * 0.2, 0.2, z + 0.4]], size * 0.7, 1.1);
};

/** a pigeon card: side view facing screen-right unless mirrored; scale PIG makes it ~0.4 m tall */
const pigeon = (out: Stage, cam: CamInfo, t: number, x: number, y: number, z: number, o: PigeonOpts, mirror = false, shadow = true, i = 90, scale = PIG) => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 0.3, z)) / scale, [w, h, k] = tier(d * 1.2);
  const g: PigeonOpts = { blink: lidAt(t, i) >= 1 ? 1 : 0, ...o, phase: o.phase !== undefined ? q(o.phase, 12) : undefined, light: light2D(cam, mirror) };
  out.places.push({ key: `P|${fkey(g)}`, x, y, z, mirror, scale, size: [w, h, k], draw: (p) => pigeonDraw(p, g) });
  if (shadow) blob(out, x, y, z, 0.35);
};
const fx = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, x: number, y: number, z: number, w: number, h: number, rot = 0, soft = false) =>
  out.fx.push({ key, cw, ch, draw, x, y, z, w, h, rot, soft });
/** wicker carrying basket with n pigeon heads peeking out, on a 500 x 360 canvas */
const basket = (n: number) => (p: Pen) => {
  for (let i = 0; i < n; i++) { const x = 130 + i * 120; p.ell(x, 120, 52, 48, "#a9b0bd", 8); p.ell(x + 22, 108, 10, 10, "#f39a2b", 4); p.dot(x + 23, 109, 5); p.poly([[x + 46, 116], [x + 76, 124], [x + 46, 130]], "#3a3438", 5); }
  p.poly([[40, 150], [460, 150], [430, 340], [70, 340]], "#c9a26a", 10);
  for (let y = 180; y < 340; y += 34) p.stroke([[50, y], [450, y]], 6, "#9a7a4c");
  for (let x = 90; x < 440; x += 50) p.stroke([[x, 155], [x - 8, 335]], 6, "#9a7a4c");
  p.poly([[30, 135], [470, 135], [470, 160], [30, 160]], "#b5864a", 9);
};
/** bullet / tracer streak on a 400 x 60 canvas */
const tracer = (p: Pen) => { p.poly([[10, 30], [360, 20], [390, 30], [360, 40]], "#ffe07a", 6); };
const pocketMen: [number, number, number, Expr][] = [[-1.3, 1.8, 0, "nervous"], [-2.6, 0.6, 1, "neutral"], [2.0, 2.4, 2, "nervous"], [-0.4, 3.6, 3, "neutral"],
  [2.9, 0.4, 1, "stern"], [-3.4, 3.0, 2, "nervous"], [1.0, 4.4, 0, "neutral"], [-1.8, -0.8, 3, "stern"], [3.6, 3.4, 2, "neutral"], [-4.2, 1.2, 0, "nervous"]];

/** everything with a face (and every 2D effect) in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo, light: LightName): Stage => {
  const out: Stage = { places: [], fx: [] };
  LNAME = light;
  findSun(cam, SUN);
  const E = (o: Outfit, k: string, x: number, y: number, z: number, fo: FrontOpts, po?: PersonOpts) => human(out, cam, t, o, k, x, y, z, fo, po);
  const men = (exprAt: (e: Expr, i: number) => Expr = (e) => e, n = 10) => pocketMen.slice(0, n).forEach(([x, z, v, e], i) =>
    E(DOUGHBOY(v), `d${v}`, x, 0, z, { mode: "stand", expr: exprAt(e, i), look: i % 3 - 1 }, { i: 20 + i }));
  const major = (fo: FrontOpts) => E(MAJOR, "major", 0.5, 0, 1.0, { mode: "stand", ...fo }, { i: 5 });
  const LX = LOFT[0], LZ = LOFT[2], H = HQ[0], GX = GUN[0];
  const onBoard: V3 = [LX - 0.05, 2.2, LZ + 1.35];
  switch (id) {
    case 1: case 2: case 4: {
      const expr = id === 4 ? "squint" : "proud";
      pigeon(out, cam, t, onBoard[0], onBoard[1], onBoard[2], { mode: "stand", expr, eyeX: true, leg: 2, bandage: true, medal: true, squash: id === 4 && t < EV.maybe + 0.12 ? 0.15 : 0 }, true, false);
      break;
    }
    case 3: men((e) => "grin"); major({ expr: "smile" }); break;
    case 6: men(); major({ expr: "nervous" }); break;
    case 7: for (const [x, v, i] of [[-2.2, 0, 60], [0.2, 2, 61], [2.6, 1, 62], [-4.5, 1, 63], [4.8, 0, 64]] as const) E(FRITZ(v), `g${v}`, x, 0, GERZ + (i % 2) * 0.8, { mode: "stand", expr: "stern" }, { i }); break;
    case 8: major({ expr: "pained", headTilt: Math.sin(t * 9) * 6 }); men(undefined, 3); break;
    case 9: men(); major({ expr: "nervous" }); break;
    case 10: major({ expr: "shock" }); break;
    case 11: {
      for (const [x, z, v] of [[GX - 1.2, 1.2, 1], [GX + 0.2, 1.6, 3]] as const) E(DOUGHBOY(v), `d${v}`, x, 0, z, { mode: "stand", expr: t > EV.artillery ? "grin" : "stern" }, { i: 40 + v });
      burst(out, t, EV.artillery, GX + 2.9, 2.3, GUN[2], 1.6, "#ffd27a", 0.25);
      puffs(out, t, EV.artillery + 0.05, [[GX + 3.1, 2.2, GUN[2]]], 1.6, 0.9);
      break;
    }
    case 12: {
      men((e, i) => (t > EV.shelling - 0.07 ? (i % 2 ? "shock" : "nervous") : e));
      major({ expr: t > EV.shelling - 0.07 ? "shock" : "nervous" });
      boom(out, t, EV.shelling, -3, -4, 4); boom(out, t, 16.95, 4, -2, 3.5); boom(out, t, 17.4, 1.5, 7, 3.5);
      break;
    }
    case 13: major({ expr: ex(t, [[0, "pained"], [18.36, "grin"]]) }); men(undefined, 4); break;
    case 14: case 18: {
      const n = id === 14 ? 3 : 1;
      fx(out, `basket${n}`, 500, 360, basket(n), 1.1, 0.3, 1.4, 0.62, 0.45);
      break;
    }
    case 15: case 16: {
      const p = flight1(t);
      if (id === 16 && t < EV.shoot1) {
        E(FRITZ(0), "g0", 0.4, 0, GERZ - 0.3, { mode: "stand", expr: "stern", tilt: t > EV.shoot1 - 0.15 ? -6 : 0 }, { i: 60 });
        burst(out, t, EV.shoot1 - 0.12, 0.85, 1.55, GERZ - 0.6, 0.5, "#ffd27a", 0.2);
      } else if (t < 22.31) {
        const falling = t > EV.shoot1;
        pigeon(out, cam, t, p[0], Math.max(0.05, p[1]), p[2], { mode: falling ? "fall" : "fly", phase: (t * 3.2) % 1, expr: falling ? "shock" : "neutral", tilt: falling ? 40 : 0 }, false, false, 91);
        if (id === 16) { burst(out, t, EV.shoot1, p[0], p[1] + 0.1, p[2], 0.6, "#ffffff", 0.25); for (let k = 0; k < 4; k++) if (falling && t - EV.shoot1 < 0.6) fx(out, "feather", 120, 120, feather, p[0] + 0.3 * Math.sin(k * 2 + t * 3), p[1] + 0.2 + 0.4 * (t - EV.shoot1) * k, p[2], 0.12, 0.12, t * 2 + k); }
      }
      if (id === 15) men(undefined, 4);
      break;
    }
    case 17: {
      const p = flight2(t), falling = t > EV.shoot2;
      pigeon(out, cam, t, p[0], Math.max(0.05, p[1]), p[2], { mode: falling ? "fall" : "fly", phase: (t * 3.2) % 1, expr: falling ? "shock" : "neutral", tilt: falling ? -40 : 0 }, true, false, 92);
      burst(out, t, EV.shoot2, p[0], p[1] + 0.1, p[2], 0.6, "#ffffff", 0.25);
      fx(out, "tracer", 400, 60, tracer, p[0] + 1.5 - 6 * clamp01((t - (EV.shoot2 - 0.2)) / 0.25), p[1], p[2] - 0.2, 0.9, 0.12, -0.2);
      break;
    }
    case 19: pigeon(out, cam, t, 0.95, 0.66, 1.45, { mode: "stand", expr: "proud", squash: t < EV.name + 0.12 && t > EV.name - 0.05 ? -0.12 : 0 }, true, true, 93); break;
    case 20: {
      major({ expr: "stern", prop: "hand", facing: -1 });
      pigeon(out, cam, t, 0.95, 0.66, 1.45, { mode: "stand", expr: "proud", canister: t > EV.note }, true, true, 93);
      break;
    }
    case 21: fx(out, "notepaper", 400, 260, fxNotePaper, 0.9, 1.25, 1.42, 0.42, 0.27, -0.05 + 0.02 * Math.sin(t * 2)); break;
    case 22: case 23: case 24: {
      const p = heroFly(t), hit = t > EV.shot, down = t > EV.falls - 0.3 && t < 32.9;
      pigeon(out, cam, t, p[0], p[1], p[2], { mode: down ? "fall" : "fly", phase: (t * (hit ? 4.2 : 3.2)) % 1, expr: hit ? (t > 33.3 ? "proud" : "pained") : "neutral", canister: true, leg: hit ? 1 : 0, eyeX: hit, bandage: false, tilt: down ? 30 : 0 }, false, false, 93);
      burst(out, t, EV.shot, p[0], p[1] + 0.1, p[2], 0.7, "#ffffff", 0.3);
      if (id === 23 && t > EV.falls) puffs(out, t, EV.falls + 0.1, [[p[0], 0.3, p[2]]], 0.6, 0.6);
      break;
    }
    case 25: E(DOUGHBOY(0), "d0", -1.3, 0, 1.8, { mode: "stand", expr: "shock" }, { i: 20, popAt: EV.wait }); break;
    case 26: {
      const u = (t - 35.27) / 2.06;
      pigeon(out, cam, t, -8 + 5 * u, 6.5 + 1.5 * u, 0 + 4 * u, { mode: "fly", phase: (t * 3.4) % 1, leg: 1, eyeX: true, canister: true, expr: "pained" }, false, false, 93);
      if (t > EV.home - 0.1) fx(out, "question", 200, 300, fxQuestion, -8 + 5 * u + 0.4, 7.4 + 1.5 * u, 4 * u, 0.5, 0.75);
      break;
    }
    case 27: {
      for (const [dx, k] of [[-0.8, 0], [0.8, 1]] as const) pigeon(out, cam, t, LX + dx, 2.2, LZ + 1.35, { mode: "stand", expr: "neutral" }, k === 1, false, 95 + k);
      const u = clamp01((t - 37.4) / 2.0);
      pigeon(out, cam, t, LX + 6 - 6 * u, 2.25 + 2.5 * (1 - u) ** 2, LZ + 1.35 + 3 * (1 - u), { mode: u < 1 ? "fly" : "stand", phase: (t * 3.4) % 1 }, true, false, 97);
      break;
    }
    case 28: {
      const u = clamp01((t - 40.0) / 1.4);
      // walks to the bed in the dark (eyes shut), then sits down on it
      const sit = t > 40.75;
      E(HISTORIAN(1), "h1", sit ? H + 0.15 : H + 1.6 - 1.45 * u, sit ? 0.5 : 0, sit ? -2.5 : -1.2, { mode: sit ? "sit" : "stand", expr: "smile_closed", blink: 1 }, { i: 70, shadow: !sit, popAt: sit ? 40.76 : undefined });
      break;
    }
    case 29: {
      const x = -14 + 9 * (t - 41.65) + 0.4;
      pigeon(out, cam, t, x, 7.2, 0, { mode: "fly", phase: (t * 3.6) % 1, leg: 1, eyeX: true, canister: true, expr: "proud" }, false, false, 93);
      for (let k = 0; k < 5; k++) { const s2 = (t * 2.2 + k * 0.37) % 1; fx(out, "tracer", 400, 60, tracer, x + 3 - 7 * s2, 7.2 + (k - 2) * 0.35, -0.3 + 0.1 * k, 0.8, 0.1, 0.05 * (k - 2)); }
      break;
    }
    case 30: {
      const u = clamp01((t - 43.9) / 1.4), land = t > EV.lands;
      pigeon(out, cam, t, LX - 0.05 + 2.4 * (1 - u), 2.2 + 1.6 * (1 - u) ** 2, LZ + 1.35 + 0.8 * (1 - u), { mode: land ? "stand" : "fly", phase: (t * 3.4) % 1, leg: 1, eyeX: true, canister: true, expr: "pained", bandage: land, squash: land && t < EV.lands + 0.12 ? 0.2 : 0 }, true, false, 93);
      E(HANDLER, "handler", LX + 1.05, 0, LZ + 1.7, { mode: "stand", expr: ex(t, [[0, "neutral"], [EV.lands, "shock"]]), facing: -1 }, { i: 71 });
      puffs(out, t, EV.lands, [[LX, 2.25, LZ + 1.4]], 0.35, 0.5);
      break;
    }
    case 31: pigeon(out, cam, t, onBoard[0], onBoard[1], onBoard[2], { mode: "stand", expr: "pained", eyeX: true, leg: 1, bandage: true, canister: true }, true, false); break;
    case 32: for (const [x, z, v] of [[GX - 1.2, 1.2, 1], [GX + 0.2, 1.6, 3]] as const) E(DOUGHBOY(v), `d${v}`, x, 0, z, { mode: "stand", expr: ex(t, [[0, "nervous"], [EV.gunsStop, "relief"]]), prop: x > GX ? "photo" : null }, { i: 40 + v }); break;
    case 33: {
      const u = (t - 49.9) * 0.8;
      pocketMen.forEach(([x, z, v], i) => E(DOUGHBOY(v), `d${v}`, x + 0.3 * u, 0, z + 1.4 * u, { mode: "stroll", phase: q((t * 1.1 + i * 0.13) % 1, 30), expr: (["grin", "laugh", "relief_open", "smile_closed"] as Expr[])[i % 4], wave: i % 3 === 0 ? q(Math.sin(t * 8 + i), 20) : undefined }, { i: 20 + i }));
      major({ expr: "relief" });
      break;
    }
    case 34: {
      E(FRENCH_GENERAL, "fg", LX + 0.9, 0, LZ + 2.6, { mode: "stand", expr: "smile", prop: t < EV.medal ? "button" : null, facing: -1 }, { i: 72, popAt: EV.medal });
      pigeon(out, cam, t, LX - 0.35, 1.0, LZ + 2.6, { mode: "stand", expr: "proud", eyeX: true, leg: 1, bandage: true, medal: t > EV.medal }, false, false);
      fx(out, "crate", 200, 200, (p: Pen) => { p.poly([[10, 10], [190, 10], [190, 190], [10, 190]], "#a8724a", 8); p.stroke([[10, 10], [190, 190]], 8, "#7a4f33"); }, LX - 0.35, 0.5, LZ + 2.62, 0.5, 0.5 * 2);
      burst(out, t, EV.medal, LX - 0.3, 1.25, LZ + 2.7, 0.5, "#ffe07a");
      break;
    }
    case 35: pigeon(out, cam, t, onBoard[0], onBoard[1], onBoard[2], { mode: "stand", expr: "smug", eyeX: true, leg: t > EV.leg - 0.07 ? 2 : 1, bandage: true, medal: true, squash: t > EV.leg - 0.07 && t < EV.leg + 0.08 ? -0.15 : 0 }, true, false); break;
    case 36: case 37: {
      const arg = t > EV.arguing - 0.07;
      E(HISTORIAN(0), "h0", H - 0.6, 0, -0.9, { mode: "stand", expr: arg ? "stern" : "neutral", prop: arg ? "fist" : null, facing: 1 }, { i: 73 });
      E(HISTORIAN(1), "h1", H + 0.6, 0, -0.9, { mode: "stand", expr: arg ? "shock" : "neutral", wave: arg ? q(Math.sin(t * 10), 20) : undefined, facing: -1 }, { i: 74, flip: true });
      break;
    }
    case 38: {
      E(SCIENTIST, "sci", H + 0.4, 0, -1.0, { mode: "stand", expr: "grin", facing: -1 }, { i: 75 });
      pigeon(out, cam, t, H - 0.6, 1.0, -1.9, { mode: "stand", expr: "neutral", eyeX: true, leg: 2, medal: true }, true, false);
      break;
    }
    case 39: fx(out, `dna${q((t * 0.5) % 1, 20)}`, 300, 600, (p: Pen) => fxDNA(p, q((t * 0.5) % 1, 20)), H - 0.6, 1.5, -1.0, 0.45, 0.9); break;
    case 40: case 41: {
      const boy = id === 41 && t > EV.boy - 0.07;
      pigeon(out, cam, t, H - 0.6, 1.0, -1.3, { mode: "stand", expr: boy ? "smug" : "neutral", eyeX: true, leg: 2, medal: true, bow: !boy, squash: boy && t < EV.boy + 0.15 ? -0.15 : 0 }, true, false);
      if (!boy) fx(out, "female", 300, 360, fxFemaleX, H - 0.95, 1.6, -1.25, 0.28, 0.34);
      else { fx(out, "male", 300, 300, fxMale, H - 0.95, 1.6, -1.25, 0.3, 0.3); burst(out, t, EV.boy, H - 0.6, 1.45, -1.25, 0.6, "#bfe0ff"); }
      if (id === 41 && t > EV.boy && t < EV.boy + 0.5) fx(out, "bowfly", 200, 120, (p: Pen) => { p.poly([[100, 60], [20, 20], [20, 100]], "#f28fb5", 6); p.poly([[100, 60], [180, 20], [180, 100]], "#f28fb5", 6); }, H - 0.5 - (t - EV.boy), 1.45 + 1.2 * (t - EV.boy), -1.25, 0.15, 0.09, t * 8);
      break;
    }
  }
  return out;
};
const feather = (p: Pen) => { p.ell(60, 60, 18, 46, "#c3c9d4", 5, 0, 360, 30); p.stroke([[40, 100], [80, 20]], 4); };
