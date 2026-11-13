// "The Christmas Truce" world as one three.js scene: sky, the frozen Flanders field with two trench lines (sandbag
// parapets, plank revetments, duckboards), barbed wire, craters, shattered trees, the candle-lit Christmas trees on the
// German parapet, burial crosses, and the HQ room at x = 300. update(id, f, camera) poses everything for shot `id` at
// frame f (pure function of id + f).
import * as THREE from "three";
import { Batch, boxGeo, V, lam, Kit, Ray, house, prop, setSight, quad } from "./build";
import { ctex, stoneHD, planksHD, cloudHD, rng, grassHD, roofHD } from "./paint";
import { LIGHTS, LOOK, LightPreset, LightName } from "./lights";
import { TONE, CHAR, untone, twoTone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, camAt, V3, ShotDef, HQ, LOFT, GUN, DESK, BED, LAB, FLASHES } from "./story";

export const loadKit = () => Promise.resolve({} as Kit); // no external models: every prop is built here

// ---------------- painted textures ----------------
/** frozen mud: dark brown-grey with lighter frost crusts and boot ruts */
const mudTex = () => ctex("mudHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#735f48"; g.fillRect(0, 0, 1024, 1024);
  g.filter = "blur(18px)";
  for (let i = 0; i < 60; i++) {
    g.fillStyle = ["#664f3b", "#806a52", "#5c4a3a", "#8a7560"][i % 4]; g.globalAlpha = 0.45;
    const rr = 50 + r() * 120; g.beginPath(); g.ellipse(r() * 1024, r() * 1024, rr, rr * (0.7 + 0.3 * r()), r() * 3, 0, 7); g.fill();
  }
  // frost: a few large soft pale patches, no confetti
  for (let i = 0; i < 18; i++) { g.fillStyle = "rgba(226,234,246,0.38)"; g.beginPath(); g.ellipse(r() * 1024, r() * 1024, 40 + r() * 90, 30 + r() * 60, r() * 3, 0, 7); g.fill(); }
  g.filter = "none"; g.globalAlpha = 1;
  return;
  g.strokeStyle = "rgba(40,32,26,0.35)"; g.lineWidth = 5;
  for (let i = 0; i < 14; i++) { const y = r() * 1024; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(300, y + 40 * (r() - 0.5), 700, y + 40 * (r() - 0.5), 1024, y); g.stroke(); }
});
/** burlap sandbag face: tan cloth, stitched seam, soft shading at the edges */
const bagTex = () => ctex("sandbag", 256, 128, (g, r) => {
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "#c9b48a"); gr.addColorStop(0.5, "#bba67c"); gr.addColorStop(1, "#9c8862");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? "rgba(90,70,40,0.12)" : "rgba(255,245,220,0.12)"; g.fillRect(r() * 256, r() * 128, 2, 2); }
  g.strokeStyle = "rgba(80,60,36,0.6)"; g.setLineDash([6, 6]); g.lineWidth = 3; g.beginPath(); g.moveTo(14, 64); g.lineTo(242, 64); g.stroke();
  g.setLineDash([]); g.fillStyle = "rgba(240,246,255,0.55)"; g.fillRect(0, 0, 256, 14); // frost on top
});
const skyStars = () => ctex("stars", 2048, 1024, (g, r) => {
  g.clearRect(0, 0, 2048, 1024);
  for (let i = 0; i < 700; i++) { const a = 0.35 + 0.65 * r(); g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`; const s = r() < 0.06 ? 3 : r() < 0.3 ? 2 : 1.2; g.beginPath(); g.arc(r() * 2048, r() * 560, s, 0, 7); g.fill(); }
});
const moonTex = () => ctex("moon", 256, 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,252,236,1)"); gr.addColorStop(0.32, "rgba(255,250,230,1)"); gr.addColorStop(0.36, "rgba(220,230,255,0.35)"); gr.addColorStop(1, "rgba(160,180,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
});
const glowTex = () => ctex("candleGlow", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,230,160,0.9)"); gr.addColorStop(0.25, "rgba(255,190,90,0.45)"); gr.addColorStop(1, "rgba(255,150,60,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const mapTex = () => ctex("warmap", 512, 384, (g, r) => {
  g.fillStyle = "#e8dcbc"; g.fillRect(0, 0, 512, 384);
  g.strokeStyle = "rgba(120,100,70,0.5)"; g.lineWidth = 2;
  for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(0, r() * 384); g.bezierCurveTo(170, r() * 384, 340, r() * 384, 512, r() * 384); g.stroke(); }
  g.lineWidth = 6; g.strokeStyle = "#b8323a"; g.beginPath(); g.moveTo(40, 300); g.bezierCurveTo(160, 210, 300, 260, 470, 120); g.stroke();
  g.strokeStyle = "#3f5f8a"; g.beginPath(); g.moveTo(40, 330); g.bezierCurveTo(160, 240, 300, 290, 470, 150); g.stroke();
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
const flat = (x0: number, x1: number, z0: number, z1: number, y: number, tile = 4) =>
  quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), (x1 - x0) / tile, (z1 - z0) / tile);
/** vertical wall from (x0,z0) to (x1,z1), y0..y1, facing the left of the walking direction */
const vwall = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tile = 4) =>
  quad(V(x0, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z0), Math.hypot(x1 - x0, z1 - z0) / tile, (y1 - y0) / tile);

type Mats = Record<string, THREE.Material>;
export class World {
  root = new THREE.Group();
  private front = new THREE.Group(); private hq = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Mesh; private moon: THREE.Sprite;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunCache = new Map<number, THREE.Vector3>();
  private clouds: THREE.Mesh[] = [];
  private candles: { x: number; g: THREE.Group }[] = [];
  private crosses = new THREE.Group(); private mapTable = new THREE.Group(); private papal = new THREE.Group(); private lab = new THREE.Group();
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit, shadowSize = 4096) {
    const R = this.root, M: Mats = {};
    R.add(this.front, this.hq);
    // ---- sky, stars, moon, light ----
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
    this.stars = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: skyStars(), transparent: true, depthWrite: false, fog: false, side: THREE.BackSide }));
    this.stars.renderOrder = -0.9; this.stars.frustumCulled = false; this.stars.layers.set(NOINK); R.add(this.stars);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex(), color: new THREE.Color(1.6, 1.6, 1.5), fog: false, depthWrite: false, transparent: true }));
    this.moon.frustumCulled = false; this.moon.layers.set(NOINK); R.add(this.moon);
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    R.add(this.hemi, this.sun, this.sun.target);
    const cm = [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.winter.cloud));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cm[i % 4], color: new THREE.Color(1.05, 1.05, 1.08), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 110 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- materials ----
    M.mud = lam("mudHD", () => ({ map: mudTex() }));
    M.bag = lam("sandbag", () => ({ map: bagTex() }));
    M.planks = lam("planksHD", () => ({ map: planksHD(), color: new THREE.Color(0.78, 0.72, 0.66) }));
    M.wood = lam("duck", () => ({ color: "#8a6a48" }));
    M.post = lam("post", () => ({ color: "#5e4a36" }));
    M.wire = twoTone(new THREE.MeshPhongMaterial({ color: "#3a3a40", specular: "#777777", shininess: 30 }), 0.15);
    M.crater = lam("crater", () => ({ color: "#4a4038" }));
    M.ice = lam("icePuddle", () => ({ color: "#b8cce0" }));
    M.bark = lam("deadBark", () => ({ color: "#4e4036" }));
    M.pine = lam("pine", () => ({ color: "#2f6a3f" }));
    M.candle = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.2) }); // HDR: blooms
    M.wax = lam("wax", () => ({ color: "#f4eedc" }));
    M.grass = lam("grassAutumn3", () => ({ map: mudTex(), color: new THREE.Color(1.05, 1.0, 0.62) })); // trampled autumn grass: the mud paint, lighter and straw-tinted
    M.loftWood = lam("loftWood", () => ({ map: planksHD(), color: new THREE.Color(0.95, 0.8, 0.62) }));
    M.roofR = lam("roofRed", () => ({ map: roofHD("#b8644f"), side: THREE.DoubleSide }));
    M.iron = twoTone(new THREE.MeshPhongMaterial({ color: "#4a4e46", specular: "#8a8a8a", shininess: 40 }), 0.15);
    M.cross = lam("crossWood", () => ({ color: "#a07a52" }));
    M.hallFloor = lam("hqFloorHD", () => ({ map: stoneHD("hallFloorHD", ["#b9a58e", "#ad9982", "#c4b19b", "#a28e78"], "#7d6c5a") }));
    M.hallWall = lam("hqWallHD", () => ({ map: stoneHD("hallWallHD", ["#c9b9a2", "#bfae96", "#d2c3ad", "#b5a48c"], "#8d7d6a") }));
    M.cap = lam("castleCapHD", () => ({ map: stoneHD("castleCapHD", ["#e8dfcf", "#e0d6c4", "#efe7da", "#d8ccb8"], "#b0a390") }));
    M.dark = lam("slit", () => ({ color: "#2a2230" }));
    M.table = lam("hqTable", () => ({ color: "#6e4a30" }));
    M.map = new THREE.MeshLambertMaterial({ map: mapTex() });
    M.gold = twoTone(new THREE.MeshPhongMaterial({ color: "#e0a92c", specular: "#fff0b0", shininess: 50 }), 0.2);
    M.red = lam("velvet", () => ({ color: "#b02e3a" }));

    // ---- the Argonne: a muddy forest hollow (the pocket), shell craters, fallen logs, autumn woods all round ----
    const F = this.front;
    const b = new Batch();
    b.add(flat(-600, 600, -600, 600, 0, 4), M.mud);
    const r = rng(11);
    for (let i = 0; i < 30; i++) {
      const x = (r() - 0.5) * 70, z = -14 + r() * 40, rad = 0.7 + r() * 1.8;
      if (Math.abs(x) < 7 && z > -3 && z < 7) continue; // the pocket where the men sit stays clear
      b.add(new THREE.CircleGeometry(rad, 20).rotateX(-Math.PI / 2).translate(x, 0.015, z), M.crater);
      b.add(new THREE.TorusGeometry(rad, 0.16, 6, 20).rotateX(Math.PI / 2).scale(1, 0.6, 1).translate(x, 0.04, z), M.mud);
    }
    for (const [x, z, len, yaw] of [[-5.5, -2.6, 4, 0.3], [5.8, 1.5, 3.4, -0.5], [-3, 7.4, 3.6, 0.1], [3.4, -3.4, 3, 1.2]] as const) // fallen logs
      b.add(new THREE.CylinderGeometry(0.22, 0.26, len, 9).rotateZ(Math.PI / 2).rotateY(yaw).translate(x, 0.22, z), M.bark);
    // shattered trunks near the pocket
    for (let i = 0; i < 14; i++) {
      const a2 = r() * Math.PI * 2, d = 8 + r() * 10, x = Math.cos(a2) * d, z = 2 + Math.sin(a2) * d;
      const h = 2.5 + r() * 3.5, tr = 0.14 + r() * 0.1;
      b.add(new THREE.CylinderGeometry(tr * 0.6, tr, h, 7).translate(0, h / 2, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ((r() - 0.5) * 0.25)).translate(x, 0, z), M.bark);
    }
    setSight(sightLines());
    // the forest: autumn trees ring the pocket and fill the hills (any tree in a camera's way is left out)
    for (let i = 0; i < 260; i++) {
      const a2 = r() * Math.PI * 2, d = 9 + r() * 70, x = Math.cos(a2) * d, z = 2 + Math.sin(a2) * d;
      prop(b, {}, r() < 0.7 ? "tree_oak" : "tree_fat", x, 0, z, 7 + r() * 6, r() * 6);
    }
    // the pigeon loft behind the lines at x = 60: a wooden coop on four posts, gable roof, landing board, grass around
    const LX = LOFT[0], LZ = LOFT[2];
    b.add(flat(LX - 30, LX + 30, LZ - 30, LZ + 30, 0.01, 4), M.grass);
    for (const [dx, dz] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) b.add(boxGeo(V(LX + dx - 0.08, 0, LZ + dz - 0.08), V(LX + dx + 0.08, 2.2, LZ + dz + 0.08)), M.post);
    b.add(boxGeo(V(LX - 1.5, 2.2, LZ - 1.1), V(LX + 1.5, 3.8, LZ + 1.1), 1.2), M.loftWood);
    b.add(boxGeo(V(LX - 1.6, 2.1, LZ + 1.1), V(LX + 1.6, 2.2, LZ + 1.7)), M.wood); // landing board
    for (const dx of [-0.8, 0, 0.8]) b.add(boxGeo(V(LX + dx - 0.18, 2.35, LZ + 1.1), V(LX + dx + 0.18, 2.75, LZ + 1.13)), M.dark); // entrance holes
    b.add(new THREE.ConeGeometry(2.3, 1.4, 4).rotateY(Math.PI / 4).scale(1, 1, 0.72).translate(LX, 4.5, LZ), M.roofR);
    house(b, LX + 9, LZ - 8, 0, 8, 6, 5, 2, 0); // the signal corps hut
    // our own big gun at x = -60 (shot: "their own artillery")
    b.add(new THREE.CylinderGeometry(0.16, 0.22, 3.4, 12).rotateZ(Math.PI / 2 - 0.45).translate(GUN[0] + 1.2, 1.5, GUN[2]), M.iron);
    for (const s2 of [-1, 1]) b.add(new THREE.TorusGeometry(0.75, 0.1, 8, 20).translate(GUN[0], 0.75, GUN[2] + s2 * 0.7), M.wood);
    b.add(boxGeo(V(GUN[0] - 0.6, 0.6, GUN[2] - 0.6), V(GUN[0] + 0.8, 1.1, GUN[2] + 0.6)), M.iron);
    b.build(F);
    this.front.traverse((o) => (o.receiveShadow = true));

    // ---- the room at x = 300: bedroom (night analogy), the historians' desk, the 2021 lab ----
    const hs = new Batch(), X = HQ[0];
    hs.add(flat(X - 7, X + 7, -6, 8, 0, 3), M.hallFloor);
    for (const [x0, z0, x1, z1] of [[X - 7, 8, X - 7, -6], [X + 7, -6, X + 7, 8], [X - 7, -6, X + 7, -6], [X + 7, 8, X - 7, 8]] as const)
      hs.add(vwall(x0, z0, x1, z1, 0, 7, 4), M.hallWall);
    hs.add(boxGeo(V(X - 1.0, 1.6, -5.98), V(X + 1.0, 5.4, -5.9)), lam("winGlass", () => ({ color: "#9fb8e0", emissive: new THREE.Color("#3a4a6a") })));
    hs.add(boxGeo(V(X - 0.06, 1.6, -5.9), V(X + 0.06, 5.4, -5.85)), M.dark); hs.add(boxGeo(V(X - 1.0, 3.4, -5.9), V(X + 1.0, 3.5, -5.85)), M.dark);
    hs.build(this.hq, false);
    // desk (historians) = the old map table with papers
    const tb2 = new Batch();
    tb2.add(boxGeo(V(X - 1.6, 0.85, -2.6), V(X + 1.6, 0.97, -1.2)), M.table);
    for (const [x, z] of [[-1.45, -2.45], [1.45, -2.45], [-1.45, -1.35], [1.45, -1.35]]) tb2.add(boxGeo(V(X + x - 0.07, 0, z - 0.07), V(X + x + 0.07, 0.85, z + 0.07)), M.table);
    tb2.add(quad(V(X - 1.4, 0.98, -1.35), V(X + 1.4, 0.98, -1.35), V(X + 1.4, 0.98, -2.45), V(X - 1.4, 0.98, -2.45)), M.map);
    for (let i = 0; i < 6; i++) tb2.add(boxGeo(V(X - 1.2 + i * 0.4, 0.98, -2.2 + (i % 2) * 0.3), V(X - 0.9 + i * 0.4, 1.0 + 0.04 * (i % 3), -1.8 + (i % 2) * 0.3)), M.wax);
    tb2.build(this.mapTable); this.hq.add(this.mapTable);
    // bed (night analogy)
    const pb = new Batch();
    pb.add(boxGeo(V(X - 1.0, 0, -4.6), V(X + 1.0, 0.5, -1.6)), M.table);
    pb.add(boxGeo(V(X - 0.95, 0.5, -4.55), V(X + 0.95, 0.68, -1.65)), lam("blanket", () => ({ color: "#3f5f8a" })));
    pb.add(boxGeo(V(X - 0.7, 0.68, -4.45), V(X + 0.7, 0.85, -3.95)), M.wax);
    pb.add(boxGeo(V(X - 1.0, 0, -4.75), V(X + 1.0, 1.3, -4.6)), M.table);
    pb.build(this.papal); this.hq.add(this.papal);
    // lab bench + microscope (2021)
    const lb = new Batch();
    lb.add(boxGeo(V(X - 1.8, 0.9, -2.6), V(X + 1.8, 1.0, -1.4)), M.wax);
    for (const [x, z] of [[-1.7, -2.5], [1.7, -2.5], [-1.7, -1.5], [1.7, -1.5]]) lb.add(boxGeo(V(X + x - 0.05, 0, z - 0.05), V(X + x + 0.05, 0.9, z + 0.05)), M.iron);
    lb.add(boxGeo(V(X + 0.6, 1.0, -2.2), V(X + 1.0, 1.06, -1.8)), M.iron);
    lb.add(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10).rotateZ(0.35).translate(X + 0.85, 1.38, -2.0), M.iron);
    lb.add(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10).rotateZ(0.35).translate(X + 0.74, 1.66, -2.0), M.iron);
    for (let i = 0; i < 4; i++) lb.add(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10).translate(X - 1.3 + i * 0.18, 1.11, -2.2), lam("tube" + i, () => ({ color: ["#f28fb5", "#3fa7d6", "#f7d046", "#5aa75a"][i] })));
    lb.build(this.lab); this.hq.add(this.lab);
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
    const t = f / FPS, s = SHOTS[id - 1], light: LightName = s.light, L = LIGHTS[light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.12; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const K = LOOK[light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    // artillery flashes light the field on "the guns kept firing" (shot 39)
    const flash = FLASHES.reduce((a, t0) => a + Math.max(0, 1 - Math.abs(t - t0 - 0.05) / 0.12), 0) * (s.loc === "front" ? 1 : 0);
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI * (1 + 1.6 * flash);
    const Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 120);
    this.sun.position.copy(focus).addScaledVector(sunDir, 260); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 560; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit).multiplyScalar(1 + 0.8 * flash); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, stars, moon, fog, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position); this.stars.position.copy(cam.position);
    const night = light === "night";
    this.stars.visible = night && s.loc === "front";
    this.moon.visible = this.stars.visible;
    this.moon.position.copy(cam.position).add(V(-0.45, 0.42, 0.8).normalize().multiplyScalar(900)); this.moon.scale.setScalar(70);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    for (const m of this.clouds) { m.visible = !night && light !== "hall"; m.lookAt(cam.position.x, m.position.y, cam.position.z); }
    // ---- places ----
    this.front.visible = s.loc === "front"; this.hq.visible = s.loc === "hq";
    this.mapTable.visible = DESK.includes(id);
    this.papal.visible = BED.includes(id);
    this.lab.visible = LAB.includes(id);
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right, sun: sunDir }, light);
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
      a.mesh.scale.set(p.mirror ? -sc2 * (p.sx ?? 1) : sc2 * (p.sx ?? 1), sc2 * (p.sy ?? 1), sc2);
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
}
void prop;
