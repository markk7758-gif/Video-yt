// The Goose King's world as one three.js scene: sky, hills, trees, the castle (keep, courtyard houses, inner wall,
// outer wall with gatehouse + drawbridge, two square moats that fill, freeze and grow eels), the giant lunchbox and the
// throne room (at x = 300). update(id, f, camera) poses everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { Batch, boxGeo, V, lam, Kit, Ray, house, prop, setSight, quad } from "./build";
import { rep, ctex, stoneHD, cobbleHD, grassHD, planksHD, roofHD, waterNear, waterFar, cloudHD, rng } from "./paint";
import { Pen, crownShape, gooseDraw } from "./toon";
import { LIGHTS, LOOK, LightPreset, LightName } from "./lights";
import { TONE, CHAR, LFB, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, camAt, buildAt, V3, ShotDef, W1, W1T, W1H, W2, W2T, W2H, M1, M2, WATER_Y, HALL, DAIS, HILL, SLIT_X, EV, smooth, clamp01 } from "./story";

export const loadKit = () => Promise.resolve({} as Kit); // no external models: every prop is built here

// ---------------- painted textures ----------------
const flagCrown = () => ctex("flagCrown", 256, 160, (g) => {
  g.fillStyle = "#b8323a"; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#f2c23c"; g.fillRect(0, 0, 256, 12); g.fillRect(0, 148, 256, 12);
  crownShape(new Pen(g), 128, 110, 50);
});
const flagGoose = () => ctex("flagGoose", 256, 160, (g) => {
  g.fillStyle = "#3f6fb5"; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#f2c23c"; g.fillRect(0, 0, 256, 12); g.fillRect(0, 148, 256, 12);
  g.save(); g.translate(60, -40); g.scale(0.2, 0.2); gooseDraw(new Pen(g), { mode: "sit", crown: true }); g.restore();
});
const iceTex = () => ctex("iceHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#cfe6f2"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + 0.25 * r()})`; g.beginPath(); g.ellipse(r() * 1024, r() * 1024, 40 + r() * 140, 10 + r() * 30, r() * 3, 0, 7); g.fill(); }
  g.strokeStyle = "rgba(90,140,180,0.55)"; g.lineWidth = 3;
  for (let i = 0; i < 26; i++) { let x = r() * 1024, y = r() * 1024; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 160; y += (r() - 0.5) * 160; g.lineTo(x, y); } g.stroke(); }
});
const snowTex = () => ctex("snowHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#eef3f9"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 220; i++) { g.fillStyle = r() < 0.5 ? "rgba(200,214,236,0.35)" : "rgba(255,255,255,0.7)"; g.beginPath(); g.ellipse(r() * 1024, r() * 1024, 10 + r() * 50, 4 + r() * 14, 0, 0, 7); g.fill(); }
});
const carpetTex = () => ctex("carpet", 256, 1024, (g) => {
  g.fillStyle = "#b02e3a"; g.fillRect(0, 0, 256, 1024);
  g.fillStyle = "#f2c23c"; g.fillRect(14, 0, 14, 1024); g.fillRect(228, 0, 14, 1024);
  for (let y = 60; y < 1024; y += 160) { g.beginPath(); g.moveTo(128, y); g.lineTo(168, y + 40); g.lineTo(128, y + 80); g.lineTo(88, y + 40); g.closePath(); g.fill(); }
});
const bannerTex = (goose: boolean) => ctex(goose ? "bannerGoose" : "bannerCrown", 256, 512, (g) => {
  g.fillStyle = goose ? "#3f6fb5" : "#a52d3b"; g.fillRect(0, 0, 256, 512);
  g.fillStyle = "#f2c23c"; g.fillRect(0, 0, 256, 20);
  for (let x = 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x, 470); g.lineTo(x + 32, 512); g.lineTo(x + 64, 470); g.fill(); }
  if (goose) { g.save(); g.translate(18, 30); g.scale(0.36, 0.36); gooseDraw(new Pen(g), { mode: "sit", crown: true }); g.restore(); }
  else crownShape(new Pen(g), 128, 280, 70);
});
const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

/** every lens position of the film looking at its subject (trees there are left out) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 4; f < s.b + 4; f += 3) {
    const c = camAt(s.id, Math.max(0, f)), o = V(...c.pos), look = V(...c.look);
    const fw = look.clone().sub(o), len = Math.min(fw.length(), 60);
    fw.normalize();
    const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
    const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
    for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, -0.4]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
};

/** horizontal rectangle facing up at height y, texture tiled every `tile` metres */
const flat = (x0: number, x1: number, z0: number, z1: number, y: number, tile = 4) =>
  quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), (x1 - x0) / tile, (z1 - z0) / tile);
/** square ring r0..r1 (half-sizes) as 4 rectangles */
const ring = (r0: number, r1: number, y: number, tile = 4) => [
  flat(-r1, r1, r0, r1, y, tile), flat(-r1, r1, -r1, -r0, y, tile), flat(-r1, -r0, -r0, r0, y, tile), flat(r0, r1, -r0, r0, y, tile)];
/** vertical wall quad from (x0,z0) to (x1,z1), y0..y1, facing the left of the walking direction */
const vwall = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tile = 4) =>
  quad(V(x0, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z0), Math.hypot(x1 - x0, z1 - z0) / tile, (y1 - y0) / tile);

type WallMats = { stone: THREE.Material; cap: THREE.Material; roof: THREE.Material; dark: THREE.Material; snow: THREE.Material };
/** square curtain wall of half-size r (centre line), thickness t, height h; gate gap on the +z side; corner towers.
 *  Snow caps go into `winter` (same transform so they scale with the wall). */
const curtain = (b: Batch, w: Batch, M: WallMats, r: number, t: number, h: number, towerR: number, gate: number) => {
  const segs: [number, number, number, number][] = []; // x0, z0, x1, z1 along the centre line
  segs.push([-r, -r, r, -r], [-r, -r, -r, r], [r, -r, r, r], [-r, r, -gate / 2, r], [gate / 2, r, r, r]);
  for (const [x0, z0, x1, z1] of segs) {
    const mnx = Math.min(x0, x1) - (x0 === x1 ? t / 2 : 0), mxx = Math.max(x0, x1) + (x0 === x1 ? t / 2 : 0);
    const mnz = Math.min(z0, z1) - (z0 === z1 ? t / 2 : 0), mxz = Math.max(z0, z1) + (z0 === z1 ? t / 2 : 0);
    b.add(boxGeo(V(mnx, 0, mnz), V(mxx, h, mxz), 4), M.stone);
    b.add(boxGeo(V(mnx - 0.15, h - 0.05, mnz - 0.15), V(mxx + 0.15, h + 0.25, mxz + 0.15), 2), M.cap);
    w.add(boxGeo(V(mnx - 0.1, h + 0.25, mnz - 0.1), V(mxx + 0.1, h + 0.5, mxz + 0.1)), M.snow);
    // merlons along the outer edge
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 1.7), ox = x0 === x1 ? Math.sign(x0) : 0, oz = z0 === z1 ? Math.sign(z0) : 0;
    for (let i = 0; i <= n; i++) {
      if (i % 2) continue;
      const u = i / n, cx = x0 + (x1 - x0) * u + ox * (t / 2 - 0.35), cz = z0 + (z1 - z0) * u + oz * (t / 2 - 0.35);
      b.add(boxGeo(V(cx - 0.45, h + 0.25, cz - 0.45), V(cx + 0.45, h + 1.35, cz + 0.45), 2), M.stone);
      w.add(boxGeo(V(cx - 0.5, h + 1.35, cz - 0.5), V(cx + 0.5, h + 1.55, cz + 0.5)), M.snow);
    }
  }
  for (const [x, z] of [[-r, -r], [r, -r], [-r, r], [r, r], [-gate / 2 - towerR * 0.7, r], [gate / 2 + towerR * 0.7, r]]) {
    const gateT = Math.abs(x) < r - 1, R = gateT ? towerR * 0.8 : towerR, th = h + (gateT ? 2.5 : 3.5);
    b.add(new THREE.CylinderGeometry(R, R * 1.06, th, 20).translate(x, th / 2, z), M.stone);
    b.add(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.6, 20).translate(x, th + 0.3, z), M.cap);
    b.add(new THREE.ConeGeometry(R + 0.6, R * 2.2, 20).translate(x, th + 0.6 + R * 1.1, z), M.roof);
    w.add(new THREE.ConeGeometry(R + 0.66, R * 0.9, 20).translate(x, th + 0.6 + R * 1.75, z), M.snow);
    // two dark arrow slits on each tower
    for (const a of [0.6, 2.4]) b.add(boxGeo(V(-0.12, th * 0.45, -0.02), V(0.12, th * 0.45 + 1.4, 0.04)).translate(0, 0, R + 0.02).rotateY(a).translate(x, 0, z), M.dark);
  }
};

type Mats = Record<string, THREE.Material>;
export class World {
  root = new THREE.Group();
  private castle = new THREE.Group(); private hall = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private WU: Record<string, THREE.IUniform>;
  private sunCache = new Map<number, THREE.Vector3>();
  private clouds: THREE.Mesh[] = []; private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private wall1 = new THREE.Group(); private wall2 = new THREE.Group();
  private snowCaps: THREE.Object3D[] = [];
  private groundDay = new THREE.Group(); private groundWinter = new THREE.Group();
  private lids: THREE.Group[] = [new THREE.Group(), new THREE.Group()];
  private waters: THREE.Group[] = [new THREE.Group(), new THREE.Group()];
  private ices: THREE.Group[] = [new THREE.Group(), new THREE.Group()];
  private bridge = new THREE.Group(); private chains: THREE.Mesh[] = [];
  private flags: THREE.Mesh[] = []; private flagMat: THREE.MeshLambertMaterial;
  private box = new THREE.Group(); private lid = new THREE.Group();
  private table = new THREE.Group(); private partyTable = new THREE.Group(); private cauldron = new THREE.Group(); private banners: THREE.MeshBasicMaterial[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit, shadowSize = 4096) {
    const R = this.root, M: Mats = {};
    R.add(this.castle, this.hall);
    // ---- sky + light ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el)); gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 110 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- materials ----
    M.grass = lam("grassHD", () => ({ map: grassHD(), color: new THREE.Color(0.82, 0.8, 0.72) }));
    M.snowG = lam("snowHD", () => ({ map: snowTex() }));
    M.snow = lam("snowCap", () => ({ color: "#f3f6fb" }));
    M.cobble = lam("cobbleHD", () => ({ map: cobbleHD() }));
    M.stone = lam("castleHD", () => ({ map: stoneHD("castleHD", ["#d9cdb8", "#cfc2ab", "#e2d7c4", "#c6b89f"], "#9d8f7c") }));
    M.cap = lam("castleCapHD", () => ({ map: stoneHD("castleCapHD", ["#e8dfcf", "#e0d6c4", "#efe7da", "#d8ccb8"], "#b0a390") }));
    M.bank = lam("bankHD", () => ({ map: stoneHD("bankHD", ["#a99c88", "#9f927e", "#b3a691", "#968873"], "#7a6e5e") }));
    M.bed = lam("moatBed", () => ({ color: "#6b5a46" }));
    M.dark = lam("slit", () => ({ color: "#2a2230" }));
    M.roof = lam("roofTower", () => ({ map: roofHD("#3f5f9a", true), side: THREE.DoubleSide }));
    M.roofR = lam("roofRed", () => ({ map: roofHD("#b8644f"), side: THREE.DoubleSide }));
    M.wood = lam("planksHD", () => ({ map: planksHD() }));
    M.iron = twoTone(new THREE.MeshPhongMaterial({ color: "#3d414c", specular: "#8a8a8a", shininess: 60 }), 0.15);
    M.gold = twoTone(new THREE.MeshPhongMaterial({ color: "#e0a92c", specular: "#fff0b0", shininess: 50 }), 0.2);
    M.red = lam("velvet", () => ({ color: "#c0333a" }));
    M.box = lam("lunchRed", () => ({ color: "#d8443c" }));
    M.boxRim = lam("lunchRim", () => ({ color: "#f2c23c" }));
    M.ice = lam("iceHD", () => ({ map: iceTex() }));
    M.hallFloor = lam("hallFloorHD", () => ({ map: stoneHD("hallFloorHD", ["#b9a58e", "#ad9982", "#c4b19b", "#a28e78"], "#7d6c5a") }));
    M.hallWall = lam("hallWallHD", () => ({ map: stoneHD("hallWallHD", ["#c9b9a2", "#bfae96", "#d2c3ad", "#b5a48c"], "#8d7d6a") }));
    M.carpet = lam("carpet", () => ({ map: carpetTex() }));
    const wm: WallMats = { stone: M.stone, cap: M.cap, roof: M.roof, dark: M.dark, snow: M.snow };

    // ---- ground (day + winter copies), moat beds and banks ----
    const C = this.castle;
    const gd = new Batch(), gw = new Batch(), st = new Batch();
    const lay = (g: THREE.BufferGeometry, day: THREE.Material) => { gd.add(g, day); gw.add(g, M.snowG); };
    lay(flat(-M1[0], M1[0], -M1[0], M1[0], 0), M.grass);
    for (const g of ring(M1[1], M2[0], 0)) lay(g, M.grass);
    for (const g of ring(M2[1], 600, 0, 4)) lay(g, M.grass);
    st.add(flat(-W1 + 1, W1 - 1, -W1 + 1, W1 - 1, 0.02, 3), M.cobble);
    st.add(flat(-2, 2, W1, M1[0], 0.02, 3), M.cobble); // gate road
    for (const [r0, r1] of [M1, M2]) {
      for (const g of ring(r0, r1, -2.2, 4)) st.add(g, M.bed);
      // banks: inner edge faces outward, outer edge faces inward
      for (const s of [-1, 1]) {
        st.add(vwall(-r0 * s, r0 * s, r0 * s, r0 * s, -2.2, 0), M.bank); st.add(vwall(r0 * s, r0 * s, r0 * s, -r0 * s, -2.2, 0), M.bank);
        st.add(vwall(r1 * s, r1 * s, -r1 * s, r1 * s, -2.2, 0), M.bank); st.add(vwall(r1 * s, -r1 * s, r1 * s, r1 * s, -2.2, 0), M.bank);
      }
    }
    gd.build(this.groundDay, false); gw.build(this.groundWinter, false); st.build(C);
    this.groundDay.traverse((o) => (o.receiveShadow = true)); this.groundWinter.traverse((o) => (o.receiveShadow = true));
    C.add(this.groundDay, this.groundWinter);
    // moat lids (grass before the moats are dug), water and ice
    for (const [k, [r0, r1]] of [[0, M1], [1, M2]] as const) {
      const lb = new Batch(); for (const g of ring(r0, r1, 0)) lb.add(g, M.grass); // flush with the ground: a 1 cm step drew ink lines lb.build(this.lids[k], false);
      const ib = new Batch(); for (const g of ring(r0, r1, WATER_Y + 0.05, 6)) ib.add(g, M.ice); ib.build(this.ices[k], false);
      C.add(this.lids[k], this.waters[k], this.ices[k]);
    }
    const wNear = waterNear(), wFar = waterFar();
    for (const t of [wNear, wFar]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 1; t.needsUpdate = true; }
    this.WU = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: wNear }, wFarTex: { value: wFar }, wTime: { value: 0 },
    };
    const waterM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    waterM.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.WU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", WATER_DECL).replace("#include <map_fragment>", WATER_COL)
        .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);");
    };
    waterM.customProgramCacheKey = () => "moat1";
    for (const [k, [r0, r1]] of [[0, M1], [1, M2]] as const) for (const g of ring(r0, r1, 0, 1)) {
      const m = new THREE.Mesh(g, waterM); m.receiveShadow = true; this.waters[k].add(m);
    }

    // ---- castle: keep, houses, inner wall, outer wall, gatehouse, drawbridge ----
    const kb = new Batch();
    kb.add(boxGeo(V(-6, 0, -14), V(6, 14, -4), 4), M.stone);
    kb.add(boxGeo(V(-6.3, 13.9, -14.3), V(6.3, 14.4, -3.7), 2), M.cap);
    for (let i = -5; i <= 5; i += 2) for (const z of [-3.95, -14.05]) kb.add(boxGeo(V(i - 0.45, 14.4, z - 0.45), V(i + 0.45, 15.5, z + 0.45), 2), M.stone);
    for (const [x, z] of [[-6, -14], [6, -14], [-6, -4], [6, -4]]) {
      kb.add(new THREE.CylinderGeometry(2.2, 2.3, 18, 20).translate(x, 9, z), M.stone);
      kb.add(new THREE.ConeGeometry(2.8, 5.2, 20).translate(x, 20.6, z), M.roofR);
    }
    kb.add(boxGeo(V(-1.6, 0, -4.05), V(1.6, 3.6, -3.85), 1.2), M.wood); // door
    for (const x of [-3.5, 3.5]) for (const y of [5, 9.5]) kb.add(boxGeo(V(x - 0.4, y, -3.98), V(x + 0.4, y + 1.6, -3.9)), M.dark);
    kb.build(C);
    const ks = new Batch();
    ks.add(boxGeo(V(-6.2, 14.4, -14.2), V(6.2, 14.6, -3.8)), M.snow);
    for (const [x, z] of [[-6, -14], [6, -14], [-6, -4], [6, -4]]) ks.add(new THREE.ConeGeometry(2.86, 2.2, 20).translate(x, 22.1, z), M.snow);
    const keepSnow = new THREE.Group(); ks.build(keepSnow, false); C.add(keepSnow); this.snowCaps.push(keepSnow);
    // flags on the keep turrets and gate towers
    this.flagMat = lam("flagM", () => ({ map: flagCrown(), side: THREE.DoubleSide })) as THREE.MeshLambertMaterial;
    for (const [x, y, z] of [[-6, 23.2, -14], [6, 23.2, -14], [-6, 23.2, -4], [6, 23.2, -4]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), M.iron); pole.position.set(x, y + 0.2, z); C.add(pole);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 12, 1), this.flagMat);
      f.position.set(x + 1.2, y + 1.2, z); f.castShadow = true; f.frustumCulled = false; this.flags.push(f); C.add(f);
    }
    // courtyard houses (inside the inner wall, beside the keep)
    const hb = new Batch();
    house(hb, -10.5, -9, Math.PI / 2, 6, 5, 4.5, 1, 0);
    house(hb, 10.5, -9, -Math.PI / 2, 6, 5, 4.8, 3, 0);
    house(hb, -11, 1, Math.PI / 2, 5, 4.5, 4.2, 4, 0);
    house(hb, 11, 2, -Math.PI / 2, 5, 4.5, 4.4, 0, 0);
    hb.build(C);
    // walls (pop up from the ground: scaled in y about their base)
    for (const [grp, r, t, h, tr, gate] of [[this.wall1, W1, W1T, W1H, 2.2, 4], [this.wall2, W2, W2T, W2H, 3.0, 4.4]] as const) {
      const wb = new Batch(), sb = new Batch();
      curtain(wb, sb, wm, r, t, h, tr, gate);
      wb.build(grp);
      const caps = new THREE.Group(); sb.build(caps, false); grp.add(caps); this.snowCaps.push(caps);
      C.add(grp);
    }
    // the arrow slit the goose squeezes through: low in the outer wall's front face
    const slit = new Batch();
    slit.add(boxGeo(V(SLIT_X - 0.32, 0.05, W2 + W2T / 2 - 0.02), V(SLIT_X + 0.32, 2.6, W2 + W2T / 2 + 0.03)), M.dark);
    slit.build(this.wall2);
    // gate arch shadow behind the drawbridge + the drawbridge on a hinge at the outer wall's foot
    const ga = new Batch();
    ga.add(boxGeo(V(-2.2, 0, W2 - W2T / 2), V(2.2, 5.2, W2 + W2T / 2 - 0.7)), M.dark); // recessed: the raised bridge closes in front of it
    ga.add(boxGeo(V(-2.6, 5.2, W2 - W2T / 2 - 0.1), V(2.6, 7.0, W2 + W2T / 2 + 0.1), 4), M.stone);
    ga.build(this.wall2);
    const bb = new Batch();
    bb.add(boxGeo(V(-2.1, 0, 0), V(2.1, 0.4, M1[1] + 0.6 - (W2 + W2T / 2)), 3, true), M.wood);
    for (const zz of [1, 3, 5]) bb.add(boxGeo(V(-2.15, 0.4, zz), V(2.15, 0.55, zz + 0.3)), M.iron);
    bb.build(this.bridge);
    this.bridge.position.set(0, 0, W2 + W2T / 2);
    C.add(this.bridge);
    for (const x of [-1.9, 1.9]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6).translate(0, 0.5, 0), M.iron);
      c.castShadow = true; this.chains.push(c); C.add(c);
    }
    // the cauldron where the chains are melted (shot 18)
    const cb = new Batch();
    const pot = new THREE.CylinderGeometry(1.0, 0.75, 1.1, 24, 1, true).translate(0, 1.0, 0);
    const potM = twoTone(new THREE.MeshPhongMaterial({ color: "#5d6270", specular: "#a0a4ac", shininess: 40, side: THREE.DoubleSide }), 0.2);
    cb.add(pot, potM); cb.add(new THREE.TorusGeometry(1.0, 0.09, 8, 24).rotateX(Math.PI / 2).translate(0, 1.55, 0), potM);
    cb.add(new THREE.CylinderGeometry(0.98, 0.98, 0.05, 24).translate(0, 1.45, 0), lam("molten", () => ({ color: "#ff9a3a", emissive: new THREE.Color("#ff7a1a") })));
    for (const a of [0, 2.1, 4.2]) cb.add(boxGeo(V(-0.07, 0, -0.07), V(0.07, 0.6, 0.07)).translate(0.7 * Math.cos(a), 0, 0.7 * Math.sin(a)), M.iron);
    cb.build(this.cauldron); this.cauldron.position.set(3.2, 0, 9.6); this.cauldron.scale.setScalar(0.75); C.add(this.cauldron);

    // ---- outside: trees (kept out of every sight line), hills, the goose's horizon hill ----
    setSight(sightLines());
    const tb = new Batch(), r = rng(7);
    for (let i = 0; i < 150; i++) {
      const a = r() * Math.PI * 2, d = 46 + r() * 110, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 8 && z > 0 && z < 175) continue; // keep the road to the horizon hill clear
      prop(tb, {}, r() < 0.55 ? "tree_cone" : "tree_oak", x, 0, z, 6 + r() * 5, r() * 6);
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + r() * 0.2, d = 240 + r() * 120;
      tb.add(new THREE.SphereGeometry(1, 24, 12).scale(70 + r() * 50, 22 + r() * 22, 70 + r() * 40).translate(Math.cos(a) * d, -4, Math.sin(a) * d), M.grass);
    }
    tb.add(new THREE.SphereGeometry(1, 32, 16).scale(48, HILL[1] / 1.0, 48).translate(HILL[0], 0, HILL[2]), M.grass);
    tb.build(C);
    // winter hills: same shapes under snow (drawn slightly larger so they cover the green ones)
    const hw = new Batch(), r2 = rng(7);
    for (let i = 0; i < 150; i++) { r2(); r2(); r2(); r2(); r2(); }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + r2() * 0.2, d = 240 + r2() * 120;
      hw.add(new THREE.SphereGeometry(1, 24, 12).scale(70.5 + r2() * 50, 22.3 + r2() * 22, 70.5 + r2() * 40).translate(Math.cos(a) * d, -4, Math.sin(a) * d), M.snowG);
    }
    hw.add(new THREE.SphereGeometry(1, 32, 16).scale(48.3, HILL[1] + 0.3, 48.3).translate(HILL[0], 0, HILL[2]), M.snowG);
    const hillSnow = new THREE.Group(); hw.build(hillSnow, false); C.add(hillSnow); this.snowCaps.push(hillSnow);

    // ---- the giant lunchbox around the whole castle (shots 23-25) ----
    const L = 46, LH = 24, lb2 = new Batch();
    for (const s of [-1, 1]) {
      lb2.add(boxGeo(V(-L, 0, s * L - 0.8), V(L, LH, s * L + 0.8)), M.box);
      lb2.add(boxGeo(V(s * L - 0.8, 0, -L), V(s * L + 0.8, LH, L)), M.box);
    }
    for (const s of [-1, 1]) { lb2.add(boxGeo(V(-L - 1, LH - 1.2, s * L - 1), V(L + 1, LH, s * L + 1)), M.boxRim); lb2.add(boxGeo(V(s * L - 1, LH - 1.2, -L - 1), V(s * L + 1, LH, L + 1)), M.boxRim); }
    lb2.build(this.box);
    const lidB = new Batch();
    lidB.add(boxGeo(V(-L - 1.2, 0, 0), V(L + 1.2, 1.4, 2 * L + 2)), M.box);
    lidB.add(new THREE.TorusGeometry(9, 1.2, 10, 24, Math.PI).translate(0, 1.4, L + 1), M.boxRim);
    lidB.build(this.lid);
    this.lid.position.set(0, LH, -L - 1);
    this.box.add(this.lid); C.add(this.box);

    // ---- the throne room at x = 300 (open to the sky; its walls cast no shadow) ----
    const hb2 = new Batch(), hs = new Batch(), X = HALL[0];
    hs.add(flat(X - 9, X + 9, -14, 12, 0, 3), M.hallFloor);
    hs.add(flat(X - 1.4, X + 1.4, -7, 12, 0.02, 2.8), M.carpet);
    hs.add(boxGeo(V(X - 9, 0, -14), V(X + 9, DAIS, -7), 3), M.hallFloor);
    hs.add(flat(X - 1.4, X + 1.4, -14, -7, DAIS + 0.02, 2.8), M.carpet);
    for (const [x0, z0, x1, z1] of [[X - 9, 12, X - 9, -14], [X + 9, -14, X + 9, 12], [X - 9, -14, X + 9, -14], [X + 9, 12, X - 9, 12]] as const)
      hs.add(vwall(x0, z0, x1, z1, 0, 10, 4), M.hallWall);
    hs.add(boxGeo(V(X - 1.6, 0, 11.9), V(X + 1.6, 4.2, 12.05)), M.dark); // the door
    for (const z of [-4, 2, 8]) for (const s of [-1, 1]) hs.add(boxGeo(V(-0.04, 4.2, z - 0.25), V(0.04, 7, z + 0.25)).translate(X + s * 8.97, 0, 0), M.dark);
    for (const s of [-1, 1]) for (const z of [-10, -3, 4, 10]) hs.add(boxGeo(V(X + s * 8.4 - 0.4, 0, z - 0.4), V(X + s * 8.4 + 0.4, 10, z + 0.4), 2), M.cap);
    hs.build(this.hall, false);
    // throne
    const tz = -10.6;
    hb2.add(boxGeo(V(X - 1.0, DAIS, tz - 0.6), V(X + 1.0, DAIS + 0.48, tz + 0.6)), M.gold);
    hb2.add(boxGeo(V(X - 0.85, DAIS + 0.48, tz - 0.5), V(X + 0.85, DAIS + 0.62, tz + 0.5)), M.red);
    hb2.add(boxGeo(V(X - 1.0, DAIS, tz - 0.75), V(X + 1.0, DAIS + 3.4, tz - 0.45)), M.gold);
    hb2.add(boxGeo(V(X - 0.75, DAIS + 0.7, tz - 0.47), V(X + 0.75, DAIS + 3.0, tz - 0.4)), M.red);
    for (const s of [-1, 1]) { hb2.add(boxGeo(V(X + s * 1.0 - 0.15, DAIS, tz - 0.6), V(X + s * 1.0 + 0.15, DAIS + 1.1, tz + 0.6)), M.gold); hb2.add(new THREE.SphereGeometry(0.22, 12, 8).translate(X + s * 1.0, DAIS + 3.5, tz - 0.6), M.gold); }
    hb2.build(this.hall);
    // banners on the walls (unlit painted faces: their crown/goose must read)
    for (const [x, z, ry] of [[X - 8.9, -8, Math.PI / 2], [X + 8.9, -8, -Math.PI / 2], [X - 8.9, 6, Math.PI / 2], [X + 8.9, 6, -Math.PI / 2], [X - 4.5, -13.9, 0], [X + 4.5, -13.9, 0]] as const) {
      const mat = new THREE.MeshBasicMaterial({ map: bannerTex(false), color: 0xd8d0c8 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 4.0), mat); m.position.set(x, 6.4, z); m.rotation.y = ry; m.layers.set(NOINK);
      this.banners.push(mat); this.hall.add(m);
    }
    // banquet table (shots 26-27)
    const tbb = new Batch();
    tbb.add(boxGeo(V(X - 3, 0.85, -1.6), V(X + 3, 1.0, 0.4)), M.wood);
    for (const [x, z] of [[-2.7, -1.3], [2.7, -1.3], [-2.7, 0.1], [2.7, 0.1]]) tbb.add(boxGeo(V(X + x - 0.1, 0, z - 0.1), V(X + x + 0.1, 0.85, z + 0.1)), M.wood);
    tbb.add(new THREE.CylinderGeometry(0.35, 0.3, 0.06, 16).translate(X + 1.2, 1.03, -0.2), M.cap); // empty plates
    tbb.add(new THREE.CylinderGeometry(0.35, 0.3, 0.06, 16).translate(X - 1.4, 1.03, -0.3), M.cap);
    tbb.build(this.table);
    this.hall.add(this.table);
    // the birthday party table in the courtyard (shots 4-9)
    const pb = new Batch();
    pb.add(boxGeo(V(-2.2, 0.78, 6.4), V(-0.5, 0.86, 7.2)), lam("cloth", () => ({ color: "#f4efe4" })));
    for (const [x, z] of [[-2.1, 6.5], [-0.6, 6.5], [-2.1, 7.1], [-0.6, 7.1]]) pb.add(boxGeo(V(x - 0.05, 0, z - 0.05), V(x + 0.05, 0.78, z + 0.05)), M.wood);
    pb.build(this.partyTable); C.add(this.partyTable);
  }

  /** camera-relative sun, frozen per shot */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(L.az), el = THREE.MathUtils.degToRad(L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }
  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], tau = s.tau(t), B = buildAt(tau), light: LightName = s.light, L = LIGHTS[light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.15; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const K = LOOK[light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    const Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 120);
    this.sun.position.copy(focus).addScaledVector(sunDir, 260); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 560; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i]; m.visible = light !== "hall";
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).map = this.cloudMaps.day[i % 4];
    }
    const W = this.WU, wc = K.water;
    untone(wc.near, W.wNearC.value); untone(wc.mid, W.wMidC.value); untone(wc.far, W.wFarC.value);
    untone(wc.crest, W.wCrest.value); untone(wc.trough, W.wTrough.value); untone(wc.glint, W.wGlint.value);
    W.wShade.value.set(...wc.shade); W.wTime.value = t;
    // ---- places ----
    this.castle.visible = s.loc === "castle"; this.hall.visible = s.loc === "hall";
    this.poseCastle(B, id, t);
    this.table.visible = id === 26 || id === 27;
    for (const m of this.banners) m.map = bannerTex(B.gooseFlags);
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, B, { pos: cam.position, right, sun: sunDir }, light);
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5 * sc2))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 * (p.sx ?? 1) : sc2 * (p.sx ?? 1), sc2, sc2);
      a.mesh.castShadow = L.actorShadow;
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e2 = this.fx(fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft);
      e2.mesh.visible = true;
      e2.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e2.mesh.quaternion.copy(cam.quaternion); e2.mesh.rotateZ(p.rot ?? 0); }
      e2.mesh.scale.set(p.w, p.h, 1);
      fused.push(e2);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (let i = 0; i < ai; i++) this.actors[i].bind();
    for (const e3 of fused) e3.bind();
    return focus;
  }

  private poseCastle(B: ReturnType<typeof buildAt>, id: number, t: number) {
    this.wall1.visible = B.wall1 > 0.001; this.wall1.scale.y = Math.max(0.001, B.wall1);
    this.wall2.visible = B.wall2 > 0.001; this.wall2.scale.y = Math.max(0.001, B.wall2);
    for (const c of this.snowCaps) c.visible = B.winter;
    this.groundDay.visible = !B.winter; this.groundWinter.visible = B.winter;
    for (const [k, fill] of [[0, B.moat1], [1, B.moat2]] as const) {
      this.lids[k].visible = fill <= 0;
      this.waters[k].visible = fill > 0 && !B.winter;
      this.waters[k].position.y = -2.2 + (WATER_Y + 2.2) * fill;
      this.ices[k].visible = fill > 0 && B.winter;
    }
    // drawbridge: lowered (0) -> raised (1) about its hinge; the chains run from the gate top to its tip
    this.bridge.visible = B.wall2 > 0.99;
    this.bridge.rotation.x = -(Math.PI / 2) * B.bridge;
    const Lb = M1[1] + 0.6 - (W2 + W2T / 2), ang = (Math.PI / 2) * B.bridge, z0 = W2 + W2T / 2;
    for (const [i, ch] of this.chains.entries()) {
      const x = [-1.9, 1.9][i], a = V(x, 6.6, z0 + 0.1), tip = V(x, 0.4 + Lb * Math.sin(ang), z0 + Lb * Math.cos(ang));
      const d = tip.clone().sub(a), len = d.length();
      ch.visible = this.bridge.visible && B.chains && len > 0.3;
      ch.position.copy(a); ch.scale.set(1, len, 1); ch.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    }
    this.cauldron.visible = id === 18;
    this.partyTable.visible = id >= 4 && id <= 9;
    // the lunchbox rises around the castle, its lid slams shut, then opens for the sandwich
    const lunch = id >= 23 && id <= 25;
    this.box.visible = lunch;
    if (lunch) {
      const up = smooth((t - (EV.boxUp - 0.5)) / 0.5);
      this.box.position.y = -25 * (1 - up) + (up >= 1 ? 0 : 0);
      const shut = smooth((t - (EV.boxShut - 0.3)) / 0.3), reopen = smooth((t - 31.3) / 0.7);
      this.lid.rotation.x = -(Math.PI * 0.62) * (1 - shut + reopen);
    }
    for (const fl of this.flags) {
      const p = fl.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const u = (i % 13) / 12, y = i < 13 ? 0.75 : -0.75;
        p.setXYZ(i, -1.2 + u * 2.4, y + 0.05 * u * Math.sin(t * 4 - u * 3), 0.24 * u * Math.sin(t * 5.5 - u * 5 + fl.position.x));
      }
      p.needsUpdate = true;
    }
    this.flagMat.map = B.gooseFlags ? flagGoose() : flagCrown();
    void clamp01;
  }
}

const WATER_DECL = `#include <common>
varying vec3 vWP;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade;
uniform sampler2D wNearTex, wFarTex;
uniform float wTime;`;
const WATER_COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + vec2(0.25 * wTime, 0.1 * wTime);
  vec4 mk = mix(texture2D(wNearTex, wp / 8.0), texture2D(wFarTex, wp / 40.0 + 0.37), smoothstep(25.0, 90.0, wd));
  wc = mix(wc, wTrough, mk.g * 0.6);
  wc = mix(wc, wCrest, mk.r * 0.7);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf));
  diffuseColor.rgb = wc;`;
void discTex; void rep;
