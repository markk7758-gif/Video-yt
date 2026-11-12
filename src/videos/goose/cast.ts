// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxBurst, fxSplash, fxStars, fxRing, fxShadow, fxContact, fxPuff, fxFire, fxSandwich, fxChain, fxSnow, fxCake, fxCart,
  gooseDraw, eelDraw, GooseOpts, crownShape, EDWIN, EDWIN_THIN, CHEF, GUARD, GUEST, townsfolk, Outfit, Expr, FrontOpts, SideOpts,
} from "./toon";
import { FPS, V3, smooth, clamp01, EV, Build, HALL, DAIS, WATER_Y, WALL2_TOP, WALL2_WALK, HILL, SLIT_X, W1, W2, M1, M2, gooseIceX, gooseSwimX } from "./story";
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
const CONTACT: Record<LightName, [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33], winter: [0.3, 0.33, 0.48], hall: [0.22, 0.18, 0.3] };
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

// ---------------- The Goose King: who is where, shot by shot ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };
const H = HALL[0];
const SEAT = DAIS + 0.62; // goose sits on the throne cushion
/** expression timeline: the last [time, expr] whose time (minus the 2-frame lead) has passed */
/** time of the last expression switch seen by ex(), consumed by the next human() call (drives the pose pop) */
let EX_T0 = -1;
const ex = (t: number, tl: [number, Expr][]): Expr => {
  let e = tl[0][1]; EX_T0 = -1;
  for (const [t0, x] of tl) if (t >= t0 - LEAD) { e = x; if (t0 > 0) EX_T0 = t0; }
  return e;
};
/** snappy pop with overshoot after a pose/face change: stretch up, dip, settle (age in s) */
const popK = (age: number) => (age >= 0 && age < 0.45 ? Math.exp(-age * 9) * Math.cos(age * 22) : 0);
type PersonOpts = { side?: boolean; mirror?: boolean; so?: SideOpts; scale?: number; shadow?: boolean; i?: number };
const human = (out: Stage, cam: CamInfo, t: number, o: Outfit, okey: string, x: number, y: number, z: number, fo: FrontOpts, po: PersonOpts = {}) => {
  const i = po.i ?? okey.length * 7;
  const blink = lidAt(t, i);
  const who: Who = { i, o, okey };
  const pl = person(cam, who, x, y, z, { side: !!po.side, mirror: !!po.mirror }, { blink, ...fo }, { blink, ...(po.so ?? {}), expr: po.so?.expr ?? fo.expr }, po.scale ?? 1);
  // idle life: slow breathing squash + a small sway from the feet, own phase per character; a squash-stretch pop
  // with overshoot on every face change (lands with the 2-frame lead on the beat word)
  const ph = hh(i, 17) * Math.PI * 2, still = (fo.mode ?? "stand") === "stand" || po.side;
  const k = EX_T0 > 0 ? popK(t - (EX_T0 - LEAD)) : 0;
  EX_T0 = -1;
  pl.sy = (1 + 0.07 * k) * (still ? 1 + 0.012 * Math.sin(2 * Math.PI * 0.5 * t + ph) : 1);
  pl.sx = 1 - 0.045 * k;
  if (still && !po.side) pl.roll = (fo.tilt ? 0 : 0.018 * Math.sin(2 * Math.PI * 0.31 * t + 1.3 * ph)) + 0.03 * k;
  out.places.push(pl);
  if (po.shadow !== false) blob(out, x, y, z, po.scale ?? 1);
};
/** goose card (same 600 x 1000 canvas as the people: soles at y), side view facing screen-right unless mirrored */
const goose = (out: Stage, cam: CamInfo, t: number, x: number, y: number, z: number, o: GooseOpts, mirror = false, shadow = true, scale = 1) => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 0.6, z)) / scale, [w, h, k] = tier(d * 1.4);
  const g: GooseOpts = { blink: lidAt(t, 91) ? 1 : 0, ...o, light: light2D(cam, mirror) };
  const breathe = o.mode === "sit" || o.mode === "stand" || o.mode === undefined ? 1 + 0.015 * Math.sin(2 * Math.PI * 0.45 * t) : 1;
  out.places.push({ key: `G|${fkey(g)}`, x, y, z, mirror, scale, sy: breathe, size: [w, h, k], draw: (p) => gooseDraw(p, g) });
  if (shadow) blob(out, x, y, z, 0.8 * scale);
};
/** eel rising out of the water at (x, z); its canvas waterline sits on the water surface */
const eel = (out: Stage, cam: CamInfo, x: number, z: number, o: { t?: number; expr?: string; rise?: number; rod?: number }, mirror = false, scale = 0.9) => {
  if ((o.rise ?? 1) <= 0.01) return;
  const d = cam.pos.distanceTo(tmp.set(x, WATER_Y + 0.6, z)) / scale, [w, h, k] = tier(d * 1.4);
  const e = { ...o, t: q(o.t ?? 0, 20), light: light2D(cam, mirror) };
  out.places.push({ key: `E|${fkey(e)}`, x, y: WATER_Y - 0.05, z, mirror, scale, size: [w, h, k], draw: (p) => eelDraw(p, e) });
  out.fx.push({ key: `ring${q((o.t ?? 0) % 1, 30)}`, cw: 600, ch: 600, draw: (p) => fxRing(p, q((o.t ?? 0) % 1, 30)), x, y: WATER_Y + 0.03, z, w: 1.6, h: 1.6, flat: true });
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
const splash = (out: Stage, t: number, t0: number, x: number, z: number, size = 5, dur = 0.9) => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  out.fx.push({ key: `splash${u}`, cw: 800, ch: 800, draw: (p) => fxSplash(p, u), x, y: WATER_Y + size * 0.37, z, w: size, h: size });
};
/** falling snow: soft flakes in a box in front of the camera, deterministic per index */
const snow = (out: Stage, cam: CamInfo, t: number, n = 90, near = 2, far = 26) => {
  const fw = tmp.set(cam.right.z, 0, -cam.right.x).normalize(); // camera forward on the ground plane
  for (let i = 0; i < n; i++) {
    const d = near + (far - near) * hh(i, 1), sx = (hh(i, 2) - 0.5) * d * 1.1, fall = (t * (0.9 + 0.5 * hh(i, 3)) + hh(i, 4) * 12) % 12;
    const x = cam.pos.x + fw.x * d + cam.right.x * sx + 0.3 * Math.sin(t * 1.3 + i), z = cam.pos.z + fw.z * d + cam.right.z * sx;
    const s = 0.05 + 0.03 * hh(i, 5) + d * 0.004;
    out.fx.push({ key: "snow", cw: 64, ch: 64, draw: fxSnow, x, y: cam.pos.y + 6 - fall, z, w: s, h: s, soft: true });
  }
};
const crownFx = (p: Pen) => crownShape(p, 150, 190, 110);
const bobber = (p: Pen) => { p.ell(60, 60, 40, 40, "#f4f1ea", 8); p.ell(60, 60, 40, 40, "#e2453c", 8, 180, 360); };

/** everything with a face (and every 2D effect) in shot `id` at time t */
export const stage = (id: number, t: number, B: Build, cam: CamInfo, light: LightName): Stage => {
  const out: Stage = { places: [], fx: [] };
  LNAME = light;
  findSun(cam, SUN);
  const E = (o: Outfit, k: string, x: number, y: number, z: number, fo: FrontOpts, po?: PersonOpts) => human(out, cam, t, o, k, x, y, z, fo, po);
  const wall = WALL2_TOP;
  switch (id) {
    // ---- hook: the starving king offers his crown to the goose on the throne ----
    case 1: case 2: {
      E(EDWIN_THIN, "et", H + 0.95, DAIS, -8.1, { mode: "stand", expr: ex(t, [[0, "nervous"], [1.71, "pained"]]), prop: "crown", facing: -1, look: -1 });
      goose(out, cam, t, H, SEAT, -10.2, { mode: "sit" });
      break;
    }
    case 3: {
      const k = clamp01((t - (EV.goose1 - 0.3)) / 0.3);
      goose(out, cam, t, H, SEAT, -10.2, { mode: "sit", crown: t >= EV.goose1, squash: t >= EV.goose1 && t < EV.goose1 + 0.12 ? 0.25 : 0 });
      if (t < EV.goose1) out.fx.push({ key: "crownFx", cw: 300, ch: 300, draw: crownFx, x: H + 0.08, y: SEAT + 1.15 + 0.9 * (1 - k * k), z: -10.15, w: 0.42, h: 0.42, rot: 0.3 * (1 - k) });
      burst(out, t, EV.goose1, H + 0.1, SEAT + 1.0, -10.0, 1.1, "#ffe07a");
      break;
    }
    // ---- the birthday party ----
    case 4: case 5: case 6: case 7: case 8: case 9: {
      const jump = id >= 6 ? Math.sin(Math.PI * clamp01((t - EV.bite - 0.04) / 0.8)) * 1.1 : 0;
      const edwinExpr = ex(t, [[0, "grin"], [4.63, "laugh"], [EV.bite, "shock"], [7.11, "pained"], [7.72, "stern"], [EV.never, "stern"], [8.78, "stern"]]);
      if (id === 6) {
        E(EDWIN, "e", 0, jump, 6, {}, { side: true, mirror: false, so: { mode: "stand", expr: edwinExpr }, shadow: false });
        blob(out, 0, 0, 6, 1, 1 - 0.6 * jump);
        goose(out, cam, t, 0.1, 0, 6.75, { mode: t < EV.bite ? "walk" : "stand", phase: (t * 2.4) % 1, honk: t >= EV.bite - 0.05 && t < EV.bite + 0.3 ? 0.7 : 0, bite: t >= EV.bite && t < EV.bite + 0.15 });
        burst(out, t, EV.bite, 0.1, 0.95 + jump * 0.3, 6.45, 1.3, "#ffffff", 0.3);
      } else {
        const rub = id === 8 && t < 7.72 ? "rub" : null;
        E(EDWIN, "e", 0, id === 7 ? 0.35 + 0.5 * clamp01((t - 6.55) / 0.5) : 0, 6, { mode: "stand", expr: edwinExpr, prop: rub, wave: id === 4 && t > 4.6 ? q(Math.sin(t * 8), 20) : undefined, facing: id >= 8 ? 1 : 0 });
        if (id === 7) out.fx.push({ key: `stars${q((t * 1.4) % 1, 30)}`, cw: 420, ch: 210, draw: (p) => fxStars(p, q((t * 1.4) % 1, 30)), x: 0, y: 2.55 + 0.5 * clamp01((t - 6.55) / 0.5), z: 6, w: 1.0, h: 0.5 });
      }
      if (id === 4 || id === 6) {
        const guests: [number, number, number][] = [[-2.6, 4.6, 0], [2.4, 5.0, 1], [-1.5, 3.2, 2], [3.6, 3.4, 3]];
        guests.forEach(([x, z, v], i) => E(GUEST(v), `g${v}`, x, 0, z, { mode: "stand", expr: ex(t, [[0, (["grin", "laugh", "smile_closed", "grin"] as Expr[])[i]], [EV.bite, "shock"]]), wave: i % 2 ? q(Math.sin(t * 7 + i), 20) : undefined }, { i: 20 + i }));
        out.fx.push({ key: `cake${q(t % 1, 15)}`, cw: 500, ch: 500, draw: (p) => fxCake(p, q(t % 1, 15)), x: -1.35, y: 0.86 + 0.45, z: 6.8, w: 0.95, h: 0.95 });
      }
      if (id === 4 && t > 4.1) goose(out, cam, t, 5.6 - 1.2 * (t - 4.1), 0, 3.0, { mode: "walk", phase: (t * 2.4) % 1 }, true);
      if (id === 5) goose(out, cam, t, 3.5 - 2.6 * clamp01((t - 4.95) / 0.71), 0, 4.3 + 1.2 * clamp01((t - 4.95) / 0.71), { mode: "walk", phase: (t * 2.6) % 1, look: 1 }, true);
      if (id === 8) goose(out, cam, t, -1.5 - 1.6 * (t - 7.11), 0, 3.4, { mode: "walk", phase: (t * 2.4) % 1 }, true);
      break;
    }
    // ---- walls pop up, moats fill ----
    case 10: puffs(out, t, EV.wall1 - 0.05, [[0, 0.5, W1 + 1.5], [-W1 - 1.5, 0.5, 4], [W1 + 1.5, 0.5, 4], [-8, 0.5, W1 + 1.5], [8, 0.5, W1 + 1.5], [W1 + 1.5, 0.5, -8]], 5); break;
    case 11: puffs(out, t, EV.wall2 - 0.05, [[0, 0.5, W2 + 1.8], [-W2 - 1.8, 0.5, 6], [W2 + 1.8, 0.5, 6], [-12, 0.5, W2 + 1.8], [12, 0.5, W2 + 1.8], [W2 + 1.8, 0.5, -10], [-W2 - 1.8, 0.5, -10]], 7); break;
    case 12: splash(out, t, EV.moat1 - 0.1, 7.5, (M1[0] + M1[1]) / 2, 3); splash(out, t, EV.moat1, 3, (M1[0] + M1[1]) / 2, 2.6); break;
    case 13: for (const [x, z] of [[0, 36.5], [-20, 36.5], [20, 36.5], [36.5, 0], [-36.5, -10]] as const) splash(out, t, EV.moat2 - 0.1, x, z, 9); break;
    case 14: {
      [[2.6, 36.8], [4.9, 37.6], [7.1, 36.4]].forEach(([x, z], i) =>
        eel(out, cam, x, z, { t: t * 0.6 + i * 0.3, rise: Math.max(0, 1 - (1 - clamp01((t - EV.eels - i * 0.08) / 0.25)) ** 2), expr: "grin" }, i === 1));
      splash(out, t, EV.eels - 0.05, 4.9, 37, 3.5, 0.6);
      break;
    }
    case 15: {
      E(EDWIN, "e", 8.6, wall, WALL2_WALK, { mode: "stand", expr: ex(t, [[0, "smile"], [17.03, "smile_closed"]]), facing: 1 });
      E(GUARD, "gd", 10.4, wall, WALL2_WALK - 0.3, { mode: "stand", expr: "neutral" }, { i: 31 });
      break;
    }
    case 16: {
      const x = gooseSwimX(t);
      goose(out, cam, t, x, WATER_Y + 0.02, 36.6, { mode: "swim", phase: (t * 1.5) % 1 }, false, false);
      out.fx.push({ key: `ring${q((t * 1.2) % 1, 30)}`, cw: 600, ch: 600, draw: (p) => fxRing(p, q((t * 1.2) % 1, 30)), x: x - 0.2, y: WATER_Y + 0.03, z: 36.6, w: 2.2, h: 2.2, flat: true });
      [[x + 2.6, 37.8], [x + 3.9, 37.2]].forEach(([ex2, z], i) => eel(out, cam, ex2, z, { t: t * 0.6 + i, expr: t >= EV.itCould - LEAD ? "shock" : "grin", rise: 0.8 }, true, 0.8));
      break;
    }
    case 17: puffs(out, t, EV.bridgeShut, [[0, 3.5, 25.5], [-2.4, 1, 25.4], [2.4, 1, 25.4]], 3, 0.6); break;
    case 18: {
      E(EDWIN, "e", 0.9, 0, 10.2, { mode: "stand", expr: ex(t, [[0, "smile"], [EV.melt, "grin"]]), facing: 1 });
      E(GUARD, "gd", 4.7, 0, 10.0, { mode: "stand", expr: "neutral", facing: -1 }, { i: 31 });
      out.fx.push({ key: `fire${q(t * 3 % 1, 12)}`, cw: 300, ch: 400, draw: (p) => fxFire(p, q(t * 3 % 1, 12)), x: 3.2, y: 0.32, z: 9.75, w: 1.2, h: 0.6 });
      if (t < EV.melt) { const k = clamp01((t - 20.33) / (EV.melt - 20.33)); out.fx.push({ key: "chain", cw: 400, ch: 300, draw: fxChain, x: 3.25, y: 2.8 - 1.6 * k * k, z: 9.6, w: 0.9, h: 0.68, rot: 0.4 * k }); }
      burst(out, t, EV.melt, 3.2, 1.3, 9.8, 1.2, "#ffb347", 0.3);
      puffs(out, t, EV.melt + 0.1, [[3.2, 1.6, 9.6]], 1.4, 1.0);
      break;
    }
    case 20: case 21: {
      const cheer = id === 20;
      E(EDWIN, "e", 9.0, wall, WALL2_WALK, { mode: "stand", expr: cheer ? "laugh" : ex(t, [[0, "grin"], [26.73, "nervous"]]), wave: cheer ? q(Math.sin(t * 9), 20) : undefined, look: cheer ? 0 : -1 });
      if (cheer) for (const [x, v] of [[11.4, 0], [13.6, 1]] as const) E(GUARD, `gd${v}`, x, wall, WALL2_WALK, { mode: "stand", expr: v ? "grin" : "laugh", wave: q(Math.sin(t * 8 + v * 2), 20) }, { i: 31 + v });
      break;
    }
    case 22: {
      out.fx.push({ key: "cart", cw: 600, ch: 500, draw: fxCart, x: 4.0, y: 0.95, z: 43.0, w: 2.3, h: 1.9 });
      E({ ...townsfolk(2), skin: "#ecd0b6" }, "m", 6.3, 0, 43.6, { mode: "stand", expr: "nervous", facing: -1 }, { i: 41 });
      break;
    }
    case 25: {
      const k = clamp01((t - 31.9) / (EV.lunch - 31.9));
      if (t < EV.lunch + 0.1) out.fx.push({ key: "sandwich", cw: 600, ch: 400, draw: fxSandwich, x: 0, y: 140 - 112 * k * k, z: 0, w: 40, h: 27 });
      puffs(out, t, EV.lunch, [[0, 26, 0]], 30, 0.8);
      break;
    }
    // ---- weeks in the hall ----
    case 26: {
      E(EDWIN, "e", H, 0, -1.2, { mode: "stand", expr: ex(t, [[0, "grin"], [34.64, "smile_closed"]]), prop: "bread" });
      E(GUARD, "gd", H - 1.0, 0, -1.5, { mode: "stand", expr: "grin", look: 1 }, { i: 31 });
      E(GUARD, "gd2", H + 1.1, 0, -1.5, { mode: "stand", expr: "smile", look: -1 }, { i: 32 });
      E(CHEF, "c", H + 1.9, 0, -2.0, { mode: "stand", expr: "smile", facing: -1 });
      break;
    }
    case 27: E({ ...EDWIN, build: "adult" }, "ea", H, 0, -1.2, { mode: "stand", expr: ex(t, [[0, "neutral"], [EV.boot, "pained"]]), prop: "bowl" }); break;
    // ---- the chef fishes; the eels fish back ----
    case 28: {
      E(CHEF, "c", 12, wall, WALL2_WALK, { mode: "stand", expr: ex(t, [[0, "smile"], [38.46, "neutral"]]), prop: "rod", facing: 1 });
      if (t >= 38.46) {
        out.fx.push({ key: "bobber", cw: 120, ch: 120, draw: bobber, x: 12.6, y: WATER_Y + 0.12 + 0.03 * Math.sin(t * 5), z: 27.4, w: 0.18, h: 0.18 });
        eel(out, cam, 12.0, 28.2, { t: t * 0.5, rise: 0.45, expr: "grin" }, true, 0.8);
      }
      break;
    }
    case 29: eel(out, cam, 12.4, 27.8, { t: t * 0.5, expr: "grin", rod: q(smooth((t - 40.4) / 0.5), 20), rise: 0.95 }, false, 0.85); break;
    case 30: {
      const yank = smooth((t - EV.back) / 0.25);
      E(CHEF, "c", 12, wall, WALL2_WALK + 0.4 * yank, { mode: "stand", expr: "shock", prop: "rod", facing: 1, tilt: 24 * yank });
      burst(out, t, EV.back, 12.9, wall + 1.1, WALL2_WALK + 0.6, 1.0, "#ffffff", 0.3);
      break;
    }
    // ---- week six: one goose on the horizon ----
    case 31: E({ ...GUARD, build: "thin" }, "gt", -11.3, wall, WALL2_WALK, {}, { side: true, mirror: false, so: { mode: "stand", expr: ex(t, [[0, "neutral"], [42.59, "stern"]]) }, i: 33 }); break;
    case 32: goose(out, cam, t, HILL[0], HILL[1] - 0.05, HILL[2], { mode: "stand" }, true, false); break;
    case 33: E({ ...GUARD, build: "thin" }, "gt", -12.0, wall, WALL2_WALK, { mode: "stand", expr: ex(t, [[0, "stern"], [44.65, "nervous"]]) }, { i: 33 }); break;
    case 34: goose(out, cam, t, HILL[0], HILL[1] - 0.05, HILL[2], { mode: "stand", look: 1 }, true); break;
    // ---- winter ----
    case 35: {
      if (t >= 47.49) [[0.5, 36.2], [3.5, 37.4]].forEach(([x, z], i) => eel(out, cam, x, z, { t: 0.2 + i, expr: "frozen", rise: 0.5 }, i === 1, 0.8));
      snow(out, cam, t, 110, 3, 40);
      break;
    }
    case 36: {
      const x = gooseIceX(t);
      goose(out, cam, t, x, WATER_Y + 0.05, 36.6, { mode: "walk", phase: (t * 2.2) % 1 });
      [[-5.6, 37.6], [-2.4, 37.2]].forEach(([ex2, z], i) => eel(out, cam, ex2, z, { t: 0.3 + i, expr: "frozen", rise: 0.55 }, i === 0, 0.8));
      snow(out, cam, t, 80, 1.5, 18);
      break;
    }
    case 37: {
      const walkIn = clamp01((t - 50.23) / 0.6), sq = smooth((t - 50.85) / 0.55);
      if (t < 51.5) goose(out, cam, t, SLIT_X - 2.0 + 2.0 * walkIn, 0, W2 + 1.25 + 0.45 - 0.5 * sq, { mode: sq > 0 ? "squeeze" : "walk", phase: (t * 2.4) % 1, squash: 0.8 * sq }, false, true, 1 - 0.3 * sq);
      puffs(out, t, 51.45, [[SLIT_X, 1.0, W2 + 1.4]], 1.2, 0.6);
      snow(out, cam, t, 70, 1.2, 14);
      break;
    }
    case 38: {
      const hop = clamp01((t - 52.0) / (EV.sit - 52.0));
      const walk = clamp01((t - 51.75) / 0.25);
      if (t < 52.0) goose(out, cam, t, H + 1.4 - 0.5 * walk, DAIS, -9.6, { mode: "walk", phase: (t * 2.5) % 1 }, true);
      else if (t < EV.sit) goose(out, cam, t, H + 0.9 * (1 - hop), DAIS + 0.62 * hop + 0.7 * Math.sin(Math.PI * hop), -9.6 - 0.6 * hop, { mode: "stand" }, true, false);
      else goose(out, cam, t, H, SEAT, -10.2, { mode: "sit", squash: t < EV.sit + 0.1 ? 0.2 : 0 }, true, false);
      puffs(out, t, EV.sit, [[H, SEAT + 0.2, -10.0]], 1.2, 0.5);
      break;
    }
    case 39: {
      E(EDWIN_THIN, "et", H, 0, 8.6, { mode: "stand", expr: ex(t, [[0, "nervous"], [EV.look, "shock"]]) });
      break;
    }
    case 40: {
      E(EDWIN_THIN, "et", H + 1.45, DAIS, -8.9, { mode: "stand", expr: ex(t, [[0, "nervous"], [EV.crown, "pained"]]), prop: t < EV.crown ? "crown" : null, facing: -1, look: -1 });
      goose(out, cam, t, H, SEAT, -10.2, { mode: "sit", crown: t >= EV.crown });
      burst(out, t, EV.crown, H + 0.1, SEAT + 1.0, -10.0, 1.0, "#ffe07a");
      break;
    }
    case 41: snow(out, cam, t, 110, 3, 40); break;
    case 42: case 43: {
      const honk = id === 43 ? Math.min(1, (t - EV.honk) / 0.08) : 0;
      goose(out, cam, t, H, SEAT, -10.2, { mode: "sit", crown: true, honk, squash: id === 43 && t < EV.honk + 0.12 ? -0.15 : 0, blink: id === 43 ? 0 : undefined });
      burst(out, t, EV.honk, H + 0.55, SEAT + 0.68, -10.0, 0.9, "#ffffff", 0.4);
      break;
    }
  }
  return out;
};
