// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxBurst, fxShadow, fxContact, fxPuff, fxFire, fxSnow, fxNote, TOMMY, FRITZ, BRIT_GENERAL, GER_GENERAL, POPE,
  Outfit, Expr, FrontOpts, SideOpts,
} from "./toon";
import { FPS, V3, smooth, clamp01, EV, GZ, FLOOR, STEP, HQ, TREE_Z, climbK, ballAt } from "./story";
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
/** falling snow: soft flakes in a box in front of the camera, deterministic per index */
const snow = (out: Stage, cam: CamInfo, t: number, n = 90, near = 2, far = 26, fall0 = 6) => {
  const fw = tmp.set(cam.right.z, 0, -cam.right.x).normalize();
  for (let i = 0; i < n; i++) {
    const d = near + (far - near) * hh(i, 1), sx = (hh(i, 2) - 0.5) * d * 1.1, fall = (t * (0.5 + 0.3 * hh(i, 3)) + hh(i, 4) * 12) % 12;
    const x = cam.pos.x + fw.x * d + cam.right.x * sx + 0.3 * Math.sin(t * 1.1 + i), z = cam.pos.z + fw.z * d + cam.right.z * sx;
    const s = 0.04 + 0.03 * hh(i, 5) + d * 0.004;
    out.fx.push({ key: "snow", cw: 64, ch: 64, draw: fxSnow, x, y: cam.pos.y + fall0 - fall, z, w: s, h: s, soft: true });
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
const H = HQ[0];
const T = (v: number) => TOMMY(v), G = (v: number) => FRITZ(v);
const STEPZ = 0.55, GSTEPZ = GZ - 0.55;

/** everything with a face (and every 2D effect) in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo, light: LightName): Stage => {
  const out: Stage = { places: [], fx: [] };
  LNAME = light;
  findSun(cam, SUN);
  const E = (o: Outfit, k: string, x: number, y: number, z: number, fo: FrontOpts, po?: PersonOpts) => human(out, cam, t, o, k, x, y, z, fo, po);
  const tommyPeek = (fo: FrontOpts, po?: PersonOpts) => E(T(0), "tommy", 0, STEP, STEPZ, { mode: "stand", ...fo }, { i: 1, ...po });
  const hansPeek = (fo: FrontOpts, x = 0, v = 0, i = 2) => E(G(v), `hans${v}`, x, STEP, GSTEPZ, { mode: "stand", ...fo }, { i });
  switch (id) {
    case 1: {
      E(T(0), "tommy", -1.5, FLOOR, 0.15, { mode: "stand", expr: "nervous", prop: "mug" }, { i: 1 });
      E(T(1), "t1", -4.2, FLOOR, -0.1, { mode: "stand", expr: "neutral" }, { i: 3 });
      breath(out, t, -1.5, FLOOR + 1.62, 0.15, 1, -1);
      snow(out, cam, t, 60, 1.5, 14, 4);
      break;
    }
    case 2: snow(out, cam, t, 50, 2, 26); break;
    case 3: case 13: {
      hansPeek({ expr: "whistle", look: -1 });
      notes(out, t, 0, STEP + 1.75, GSTEPZ - 0.1, 2, "#f4f0e6", -1);
      snow(out, cam, t, 40, 1, 8, 3);
      break;
    }
    case 4: {
      for (const [x, v] of [[-3, 1], [0.4, 0], [2.6, 2], [5.6, 3]] as const) E(T(v), v ? `t${v}` : "tommy", x, FLOOR, 0.1, { mode: "stand", expr: v ? "neutral" : "nervous", prop: v === 0 ? "mug" : null }, { i: 3 + v });
      snow(out, cam, t, 50, 2, 16, 4);
      for (const [x, v] of [[-4, 1], [6, 2]] as const) E(G(v), `g${v}`, x, FLOOR, GZ - 0.1, { mode: "stand", expr: "neutral" }, { i: 10 + v });
      break;
    }
    case 5: {
      E(T(0), "tommy", -0.6, FLOOR, 0.15, { mode: "stand", expr: ex(t, [[0, "nervous"], [6.75, "pained"]]), prop: "mug" }, { i: 1 });
      E(T(2), "t2", -2.9, FLOOR, -0.05, { mode: "stand", expr: "neutral" }, { i: 5 });
      breath(out, t, -0.6, FLOOR + 1.62, 0.15, 1, -1);
      snow(out, cam, t, 40, 1, 10, 3);
      break;
    }
    case 6: {
      hansPeek({ expr: "neutral" }, 0.6, 0, 2);
      hansPeek({ expr: "neutral" }, -5.5, 1, 12);
      break;
    }
    case 7: {
      hansPeek({ expr: ex(t, [[0, "neutral"], [EV.cough, "pained"]]), look: -1 });
      if (t >= EV.cough - 0.05) puffs(out, t, EV.cough - 0.05, [[0.25, STEP + 1.42, GSTEPZ - 0.55]], 0.22, 0.6);
      break;
    }
    case 8: E(POPE, "pope", H, 0, -0.6, { mode: "stand", expr: ex(t, [[0, "nervous"], [EV.begged, "relief"], [11.6, "nervous"]]), prop: "pray" }, { i: 7 }); break;
    case 9: {
      const shake = t > EV.no - 0.1 ? Math.sin((t - EV.no) * 24) * 7 * Math.max(0, 1 - (t - EV.no) / 0.5) : 0;
      E(BRIT_GENERAL, "bg", H - 0.5, 0, -0.5, { mode: "stand", expr: ex(t, [[0, "neutral"], [EV.no, "stern"]]), headTilt: shake, facing: 1 }, { i: 8 });
      E(GER_GENERAL, "gg", H + 0.5, 0, -0.5, { mode: "stand", expr: ex(t, [[0, "neutral"], [EV.no, "stern"]]), headTilt: -shake, facing: -1 }, { i: 9 });
      break;
    }
    case 10: tommyPeek({ expr: ex(t, [[0, "neutral"], [14.92, "shock"]]) }); snow(out, cam, t, 40, 1, 10, 3); break;
    case 11: {
      hansPeek({ expr: "neutral" }, -6, 1, 12); hansPeek({ expr: "neutral" }, 5.4, 2, 13);
      snow(out, cam, t, 60, 2, 30);
      break;
    }
    case 12: snow(out, cam, t, 50, 0.8, 8, 3); break;
    case 14: {
      for (const [x, v, i] of [[-0.95, 1, 12], [0, 0, 2], [0.95, 2, 13]] as const) {
        hansPeek({ expr: "whistle", look: 0 }, x, v, i);
        notes(out, t, x, STEP + 1.75, GSTEPZ - 0.1, i, "#f4f0e6", i % 2 ? 1 : -1);
      }
      snow(out, cam, t, 50, 1.5, 12, 3);
      break;
    }
    case 15: tommyPeek({ expr: ex(t, [[0, "neutral"], [EV.know, "smile_closed"]]) }); snow(out, cam, t, 40, 0.8, 6, 2); break;
    case 16: {
      tommyPeek({ expr: "whistle" });
      for (const [x, v, i] of [[-1.7, 1, 3], [1.9, 2, 5], [-3.6, 3, 6]] as const) E(T(v), `t${v}`, x, STEP, STEPZ, { mode: "stand", expr: "whistle" }, { i });
      for (const [x, i] of [[0, 1], [-1.7, 3], [1.9, 5]] as const) notes(out, t, x, STEP + 1.75, STEPZ + 0.1, i, "#ffe9a8", 1);
      snow(out, cam, t, 50, 1.5, 14, 4);
      break;
    }
    case 17: {
      const k = climbK(t);
      E(G(0), "hans0", 0, STEP + (0 - STEP) * k + 0.75 * Math.sin(Math.PI * k), GSTEPZ - 1.9 * k, { mode: "stand", expr: "nervous" }, { i: 2, shadow: k > 0.95 });
      hansPeek({ expr: "nervous" }, -1.7, 1, 12);
      break;
    }
    case 18: E(G(0), "hans0", 0, 0, GZ - 2.45, { mode: "stand", expr: "nervous", prop: "hand" }, { i: 2, popAt: 26.2 }); break;
    case 19: E(G(0), "hans0", 0, 0, GZ - 2.45, { mode: "stand", expr: "smile", wave: q(Math.sin(t * 9), 20) }, { i: 2, popAt: EV.waves }); break;
    case 20: {
      tommyPeek({ expr: "shock" }, { popAt: 27.87 });
      for (const [x, v, i] of [[-1.7, 1, 3], [1.9, 2, 5]] as const) E(T(v), `t${v}`, x, STEP, STEPZ, { mode: "stand", expr: "nervous" }, { i });
      break;
    }
    case 21: {
      for (let i = 0; i < 64; i++) {
        const brit = i % 2 === 0, x = (hh(i, 31) - 0.5) * (30 + 30 * hh(i, 33)), z = 7 + hh(i, 32) * 17;
        const ex2: Expr = (["smile", "grin", "laugh", "smile_closed"] as Expr[])[i % 4];
        E(brit ? T(i % 4) : G(i % 3), `${brit ? "t" : "g"}${i % 4}`, x, 0, z, { mode: "stand", expr: ex2, prop: i % 5 === 0 ? "hand" : null, wave: i % 7 === 3 ? q(Math.sin(t * 8 + i), 20) : undefined, facing: i % 2 ? -1 : 1 }, { i: 40 + i, flip: !brit && i % 3 === 0 });
      }
      break;
    }
    case 22: case 23: case 24: case 25: {
      const tp = id === 22 ? "hand" : id === 24 ? "choc" : id === 25 ? "button" : null;
      const hp = id === 22 ? "hand" : id === 23 ? "cig" : id === 25 ? "button" : null;
      const pop = [EV.shaking, EV.cigs, EV.choc, EV.buttons][id - 22];
      E(T(0), "tommy", 0.33, 0, 15.0, { mode: "stand", expr: id === 23 ? "grin" : "smile", prop: tp, facing: 1 }, { i: 1, popAt: pop });
      E(G(0), "hans0", -0.33, 0, 15.0, { mode: "stand", expr: id === 24 ? "grin" : "smile", prop: hp, facing: 1 }, { i: 2, flip: true, popAt: pop });
      break;
    }
    case 26: {
      for (const [x, z, brit, v, i] of [[8.6, 15.2, true, 0, 1], [9.8, 15.0, false, 0, 2], [11.0, 15.1, true, 2, 5], [12.2, 15.0, false, 1, 12], [13.4, 15.2, true, 3, 6]] as const)
        E(brit ? T(v) : G(v), brit ? (v ? `t${v}` : "tommy") : `hans${v}`, x, 0, z, { mode: "stand", expr: "neutral", blink: 1, headTilt: 8 }, { i });
      break;
    }
    case 27: {
      const b = ballAt(t);
      const kick = (who: number) => { const k = (t - 38.52) / 0.55, i = Math.floor(k); return (i % 2 === who) && k - i < 0.15; };
      E(T(0), "tommy", -7.25, 0, 15.0, { mode: "stand", expr: "laugh", tilt: kick(0) ? -8 : 0, facing: 1 }, { i: 1 });
      E(G(0), "hans0", -8.75, 0, 15.0, { mode: "stand", expr: "laugh", tilt: kick(1) ? -8 : 0, facing: 1 }, { i: 2, flip: true });
      for (const [x, z, brit, v, i] of [[-11.5, 17.5, false, 1, 12], [-8.0, 18.2, true, 2, 5], [-5.0, 17.4, false, 2, 13], [-12.6, 16.2, true, 3, 6]] as const)
        E(brit ? T(v) : G(v), brit ? `t${v}` : `hans${v}`, x, 0, z, { mode: "stand", expr: "grin", wave: q(Math.sin(t * 8 + i), 20) }, { i });
      out.fx.push({ key: "ball", cw: 120, ch: 120, draw: ball, x: b[0], y: b[1], z: b[2], w: 0.24, h: 0.24, rot: t * 9 });
      break;
    }
    case 28: tommyPeek({ expr: "shock", look: 0 }, { popAt: EV.wait }); break;
    case 29: {
      const u = (t - 41.3) / 1.8;
      out.fx.push({ key: "noteBig", cw: 220, ch: 260, draw: (p) => fxNote(p, 1, "#f4f0e6"), x: -6 + 12 * u, y: 2.2 + 0.5 * Math.sin(u * 6), z: 15, w: 0.9, h: 1.05, rot: 0.2 * Math.sin(u * 5) });
      break;
    }
    case 30: E(T(0), "tommy", 0, FLOOR, 0.15, { mode: "stand", expr: "neutral", prop: "mug" }, { i: 1 }); breath(out, t, 0, FLOOR + 1.62, 0.15, 1, -1); break;
    case 31: E(G(0), "hans0", 0, FLOOR, GZ - 0.15, { mode: "stand", expr: "neutral", prop: "mug" }, { i: 2, flip: true }); breath(out, t, 0, FLOOR + 1.62, GZ - 0.15, 2, 1); break;
    case 32: {
      const jit = 0.012 * Math.sin(t * 60);
      E(T(0), "tommy", jit, FLOOR, 0.15, { mode: "stand", expr: "pained", prop: "mug" }, { i: 1, popAt: 45.7 });
      breath(out, t, 0, FLOOR + 1.62, 0.15, 7, -1); snow(out, cam, t, 30, 0.6, 4, 2);
      break;
    }
    case 33: E(G(0), "hans0", 0, FLOOR, GZ - 0.15, { mode: "stand", expr: "nervous", look: 1 }, { i: 2, flip: true, popAt: 46.34 }); break;
    case 34: E(T(0), "tommy", 0, FLOOR, 0.15, { mode: "stand", expr: "nervous", prop: "photo", look: 1 }, { i: 1, popAt: 46.98 }); break;
    case 35: {
      E(T(0), "tommy", 0.4, 0, 15.0, { mode: "stand", expr: "whistle", facing: 1 }, { i: 1 });
      E(G(0), "hans0", -0.4, 0, 15.0, { mode: "stand", expr: "whistle", facing: 1 }, { i: 2, flip: true });
      notes(out, t, 0.4, 1.8, 14.95, 1, "#ffe9a8", 1);
      notes(out, t, -0.4, 1.8, 14.95, 2, "#f4f0e6", -1);
      snow(out, cam, t, 50, 1, 10, 3);
      break;
    }
    case 36: tommyPeek({ expr: ex(t, [[0, "neutral"], [51.54, "smile_closed"]]) }); break;
    case 37: {
      E(BRIT_GENERAL, "bg", H - 0.5, 0, -0.5, { mode: "stand", expr: ex(t, [[0, "stern"], [EV.hated, "shock"]]), prop: "fist", facing: 1 }, { i: 8 });
      E(GER_GENERAL, "gg", H + 0.5, 0, -0.5, { mode: "stand", expr: ex(t, [[0, "stern"], [EV.hated, "shock"]]), facing: -1 }, { i: 9 });
      break;
    }
    case 38: {
      const k = t < EV.banned - 0.25 ? 0 : t < EV.banned ? smooth((t - (EV.banned - 0.25)) / 0.25) : 1;
      E(GER_GENERAL, "gg", H + 0.6, 0, -0.9, { mode: "stand", expr: "stern", prop: ["stamp", q(k, 20)], facing: -1 }, { i: 9, popAt: EV.banned });
      E(BRIT_GENERAL, "bg", H - 0.7, 0, -0.9, { mode: "stand", expr: ex(t, [[0, "stern"], [EV.banned, "grin"]]), facing: 1 }, { i: 8 });
      burst(out, t, EV.banned, H + 0.25, 1.05, -1.6, 0.8, "#ffffff", 0.25);
      break;
    }
    case 39: {
      E(T(0), "tommy", -0.3, FLOOR, 0.3, { mode: "stand", expr: ex(t, [[0, "nervous"], [EV.firing, "shock"]]), tilt: t > EV.firing ? -6 : 0 }, { i: 1 });
      boom(out, t, EV.firing, -2.5, 12, 6); boom(out, t, 56.2, 4, 18, 7); boom(out, t, 56.45, -7, 22, 6);
      snow(out, cam, t, 40, 1, 12, 3);
      break;
    }
    case 41: {
      E(T(0), "tommy", 3.25, 0, TREE_Z - 3.2, { mode: "stand", expr: "smile_closed", facing: 1 }, { i: 1 });
      E(G(0), "hans0", 1.75, 0, TREE_Z - 3.2, { mode: "stand", expr: "smile_closed", facing: 1 }, { i: 2, flip: true });
      snow(out, cam, t, 70, 1, 16, 4);
      break;
    }
  }
  return out;
};
