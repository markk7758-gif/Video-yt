// "The Christmas Truce" world as one three.js scene: sky, the frozen Flanders field with two trench lines (sandbag
// parapets, plank revetments, duckboards), barbed wire, craters, shattered trees, the candle-lit Christmas trees on the
// German parapet, burial crosses, and the HQ room at x = 300. update(id, f, camera) poses everything for shot `id` at
// frame f (pure function of id + f).
import * as THREE from "three";
import { Batch, boxGeo, V, lam, Kit, Ray, house, prop, setSight, quad } from "./build";
import { ctex, stoneHD, planksHD, cloudHD, rng } from "./paint";
import { LIGHTS, LOOK, LightPreset, LightName } from "./lights";
import { TONE, CHAR, untone, twoTone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, camAt, V3, ShotDef, GZ, TW, FLOOR, PARA, HQ, TREES, TREE_Z, lightOn } from "./story";

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

const XL = 70; // trench lines run x -XL..XL
/** one trench centred at zc: walls (planks), floor + duckboards, sandbag parapet on the enemy side (dir = +1 enemy at +z) */
const trench = (b: Batch, M: Record<string, THREE.Material>, zc: number, dir: number, seed: number) => {
  const z0 = zc - TW, z1 = zc + TW;
  b.add(flat(-XL, XL, z0, z1, FLOOR, 3), M.mud);
  b.add(vwall(-XL, z0, XL, z0, FLOOR, 0, 2), M.planks); // back wall faces +z
  b.add(vwall(XL, z1, -XL, z1, FLOOR, 0, 2), M.planks); // front wall faces -z
  // duckboards along the floor
  for (let x = -XL; x < XL; x += 1.2) b.add(boxGeo(V(x + 0.05, FLOOR, zc - 0.35), V(x + 1.1, FLOOR + 0.08, zc + 0.35), 1), M.wood);
  // fire step on the enemy side
  b.add(boxGeo(V(-XL, FLOOR, dir > 0 ? z1 - 0.45 : z0), V(XL, FLOOR + 0.62, dir > 0 ? z1 : z0 + 0.45), 2), M.planks);
  // sandbag parapet (enemy side, 3 rows) and lower parados (rear, 2 rows), staggered, slightly jittered
  const r = rng(seed);
  for (const [zEdge, rows, d] of [[dir > 0 ? z1 : z0, 3, dir], [dir > 0 ? z0 : z1, 2, -dir]] as const)
    for (let row = 0; row < rows; row++)
      for (let x = -XL + (row % 2) * 0.32; x < XL; x += 0.64) {
        const y = row * 0.22, zz = zEdge + d * (0.3 + 0.08 * row + (r() - 0.5) * 0.05), w = 0.6, h = 0.24, dd = 0.38;
        const g = new THREE.BoxGeometry(w, h, dd, 1, 1, 1);
        g.translate(x + w / 2 + (r() - 0.5) * 0.04, y + h / 2, zz); b.add(g, M.bag);
      }
};

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
  private crosses = new THREE.Group(); private mapTable = new THREE.Group(); private papal = new THREE.Group();
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
    M.cross = lam("crossWood", () => ({ color: "#a07a52" }));
    M.hallFloor = lam("hqFloorHD", () => ({ map: stoneHD("hallFloorHD", ["#b9a58e", "#ad9982", "#c4b19b", "#a28e78"], "#7d6c5a") }));
    M.hallWall = lam("hqWallHD", () => ({ map: stoneHD("hallWallHD", ["#c9b9a2", "#bfae96", "#d2c3ad", "#b5a48c"], "#8d7d6a") }));
    M.cap = lam("castleCapHD", () => ({ map: stoneHD("castleCapHD", ["#e8dfcf", "#e0d6c4", "#efe7da", "#d8ccb8"], "#b0a390") }));
    M.dark = lam("slit", () => ({ color: "#2a2230" }));
    M.table = lam("hqTable", () => ({ color: "#6e4a30" }));
    M.map = new THREE.MeshLambertMaterial({ map: mapTex() });
    M.gold = twoTone(new THREE.MeshPhongMaterial({ color: "#e0a92c", specular: "#fff0b0", shininess: 50 }), 0.2);
    M.red = lam("velvet", () => ({ color: "#b02e3a" }));

    // ---- the field: ground with two trench cuts, no man's land, wire, craters ----
    const F = this.front;
    const b = new Batch();
    b.add(flat(-600, 600, -600, -TW, 0, 4), M.mud);
    b.add(flat(-600, 600, TW, GZ - TW, 0, 4), M.mud);
    b.add(flat(-600, 600, GZ + TW, 600, 0, 4), M.mud);
    for (const [x0, x1] of [[-600, -XL], [XL, 600]]) { b.add(flat(x0, x1, -TW, TW, 0, 4), M.mud); b.add(flat(x0, x1, GZ - TW, GZ + TW, 0, 4), M.mud); }
    trench(b, M, 0, 1, 3);
    trench(b, M, GZ, -1, 7);
    // barbed wire belts in front of both lines: posts + three wires
    const r = rng(11);
    for (const zw of [4.2, GZ - 4.2]) {
      const posts: number[] = [];
      for (let x = -XL; x <= XL; x += 2.6 + r() * 0.8) posts.push(x);
      for (const x of posts) if (Math.abs(x) > 3.5) b.add(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 6).translate(x, 0.6, zw + (r() - 0.5) * 0.3), M.post);
      for (const h of [0.35, 0.7, 1.05]) for (let i = 0; i + 1 < posts.length; i++) {
        if (Math.abs(posts[i]) < 3.5) continue; // a gap in the wire in front of the centre (the climbing German walks through it)
        const a = V(posts[i], h, zw), c = V(posts[i + 1], h - 0.12, zw), m2 = a.clone().add(c).multiplyScalar(0.5);
        const g = new THREE.CylinderGeometry(0.012, 0.012, a.distanceTo(c), 4);
        g.applyMatrix4(new THREE.Matrix4().compose(m2, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), c.clone().sub(a).normalize()), V(1, 1, 1)));
        b.add(g, M.wire);
      }
    }
    // shell craters with icy puddles (kept out of the centre strip where people stand)
    for (let i = 0; i < 38; i++) {
      const x = (r() - 0.5) * 120, z = 6 + r() * (GZ - 12), rad = 0.8 + r() * 2.2;
      if (Math.abs(x) < 14 && z > 9 && z < 21) continue;
      b.add(new THREE.CircleGeometry(rad, 20).rotateX(-Math.PI / 2).translate(x, 0.015, z), M.crater);
      b.add(new THREE.TorusGeometry(rad, 0.16, 6, 20).rotateX(Math.PI / 2).scale(1, 0.6, 1).translate(x, 0.04, z), M.mud);
      if (r() < 0.5) b.add(new THREE.CircleGeometry(rad * 0.55, 16).rotateX(-Math.PI / 2).translate(x, 0.025, z), M.ice);
    }
    // shattered tree trunks behind both lines and a few in no man's land
    for (let i = 0; i < 26; i++) {
      const side = i % 3, x0 = (r() - 0.5) * 140, x = Math.abs(x0) < 14 ? x0 + Math.sign(x0 || 1) * 14 : x0, z = side === 0 ? -8 - r() * 30 : side === 1 ? GZ + 8 + r() * 30 : 6 + r() * 18;
      if (side === 2 && Math.abs(x) < 16) continue;
      const h = 2.5 + r() * 4, tr = 0.12 + r() * 0.1;
      const g = new THREE.CylinderGeometry(tr * 0.6, tr, h, 7).translate(0, h / 2, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationZ((r() - 0.5) * 0.25)).translate(x, 0, z);
      b.add(g, M.bark);
      b.add(new THREE.CylinderGeometry(0.03, 0.06, 1.1, 5).rotateZ(0.9 * (r() < 0.5 ? 1 : -1)).translate(x, h * 0.75, z), M.bark);
    }
    setSight(sightLines());
    // ruined farm houses far behind each line (a Flemish village)
    house(b, -38, -55, 0, 8, 7, 6.5, 2, 0); house(b, 24, -62, 0.2, 7, 6, 6, 4, 0);
    house(b, 30, GZ + 55, Math.PI, 8, 7, 7, 1, 0); house(b, -26, GZ + 62, Math.PI + 0.2, 7, 6, 6.2, 3, 0);
    b.build(F);
    this.front.traverse((o) => (o.receiveShadow = true));

    // ---- candle-lit Christmas trees on the German parapet ----
    const glow = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(1.4, 1.1, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const x of TREES) {
      const g = new THREE.Group(), tb = new Batch(), h = 1.15;
      tb.add(new THREE.CylinderGeometry(0.04, 0.05, 0.25, 6).translate(0, 0.12, 0), M.post);
      for (const [y, rr, hh] of [[0.2, 0.42, 0.55], [0.48, 0.32, 0.48], [0.74, 0.2, 0.42]] as const) tb.add(new THREE.ConeGeometry(rr, hh, 10).translate(0, y + hh / 2, 0), M.pine);
      tb.build(g);
      const lit = new THREE.Group();
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4, y = 0.3 + (k / 9) * (h - 0.42), rad = 0.38 * (1 - (y - 0.2) / h) + 0.04;
        const px = Math.cos(a) * rad, pz = Math.sin(a) * rad;
        const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 5), M.wax); wax.position.set(px, y + 0.03, pz);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), M.candle); flame.position.set(px, y + 0.08, pz); flame.layers.set(NOINK);
        const halo = new THREE.Sprite(glow); halo.position.set(px, y + 0.08, pz); halo.scale.setScalar(0.14); halo.layers.set(NOINK);
        lit.add(wax, flame, halo);
      }
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), M.candle); star.position.set(0, h + 0.04, 0); star.layers.set(NOINK); lit.add(star);
      g.add(lit); g.userData.lit = lit;
      g.position.set(x, PARA, TREE_Z);
      this.candles.push({ x, g }); F.add(g);
    }
    // burial crosses (shot 26 and the end)
    const cb = new Batch();
    for (const [x, z] of [[9.2, 16.6], [10.4, 16.8], [11.6, 16.5], [12.8, 16.7]]) {
      cb.add(boxGeo(V(x - 0.05, 0, z - 0.04), V(x + 0.05, 1.0, z + 0.04)), M.cross);
      cb.add(boxGeo(V(x - 0.28, 0.66, z - 0.04), V(x + 0.28, 0.76, z + 0.04)), M.cross);
      cb.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.45, 0.16, 0.8).translate(x, 0, z + 0.7), M.mud);
    }
    cb.build(this.crosses); F.add(this.crosses);

    // ---- the HQ room at x = 300 (open to the sky; its walls cast no shadow) ----
    const hs = new Batch(), X = HQ[0];
    hs.add(flat(X - 7, X + 7, -6, 8, 0, 3), M.hallFloor);
    for (const [x0, z0, x1, z1] of [[X - 7, 8, X - 7, -6], [X + 7, -6, X + 7, 8], [X - 7, -6, X + 7, -6], [X + 7, 8, X - 7, 8]] as const)
      hs.add(vwall(x0, z0, x1, z1, 0, 7, 4), M.hallWall);
    for (const s of [-1, 1]) for (const z of [-5, 1, 7]) hs.add(boxGeo(V(X + s * 6.5 - 0.35, 0, z - 0.35), V(X + s * 6.5 + 0.35, 7, z + 0.35), 2), M.cap);
    // a tall window in the back wall
    hs.add(boxGeo(V(X - 1.0, 1.6, -5.98), V(X + 1.0, 5.4, -5.9)), lam("winGlass", () => ({ color: "#9fb8e0", emissive: new THREE.Color("#3a4a6a") })));
    hs.add(boxGeo(V(X - 0.06, 1.6, -5.9), V(X + 0.06, 5.4, -5.85)), M.dark); hs.add(boxGeo(V(X - 1.0, 3.4, -5.9), V(X + 1.0, 3.5, -5.85)), M.dark);
    hs.build(this.hq, false);
    // generals' map table
    const tb2 = new Batch();
    tb2.add(boxGeo(V(X - 1.6, 0.85, -2.6), V(X + 1.6, 0.97, -1.2)), M.table);
    for (const [x, z] of [[-1.45, -2.45], [1.45, -2.45], [-1.45, -1.35], [1.45, -1.35]]) tb2.add(boxGeo(V(X + x - 0.07, 0, z - 0.07), V(X + x + 0.07, 0.85, z + 0.07)), M.table);
    tb2.add(quad(V(X - 1.4, 0.98, -1.35), V(X + 1.4, 0.98, -1.35), V(X + 1.4, 0.98, -2.45), V(X - 1.4, 0.98, -2.45)), M.map);
    tb2.build(this.mapTable); this.hq.add(this.mapTable);
    // the Pope's chair under the window
    const pb = new Batch();
    pb.add(boxGeo(V(X - 0.7, 0, -4.6), V(X + 0.7, 0.5, -3.6)), M.gold);
    pb.add(boxGeo(V(X - 0.7, 0, -4.75), V(X + 0.7, 2.6, -4.5)), M.gold);
    pb.add(boxGeo(V(X - 0.5, 0.6, -4.5), V(X + 0.5, 2.3, -4.45)), M.red);
    pb.build(this.papal); this.hq.add(this.papal);
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
    const flash = id === 39 ? [55.82, 56.2, 56.45].reduce((a, t0) => a + Math.max(0, 1 - Math.abs(t - t0 - 0.05) / 0.12), 0) : 0;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI * (1 + 1.6 * flash);
    const Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 120);
    this.sun.position.copy(focus).addScaledVector(sunDir, 260); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 560; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit).multiplyScalar(1 + 0.8 * flash); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = id === 40 ? 0.7 : K.sat;
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
    this.mapTable.visible = id === 9 || id === 37 || id === 38;
    this.papal.visible = id === 8;
    // candle trees: on the parapet from the night of shot 2 (flash-forward) and from "lights appear", lit only at night
    const treesUp = (id === 2 || id === 3 || id >= 11) && id !== 39 && id !== 40;
    for (const { x, g } of this.candles) {
      const on = night && (id <= 3 || id >= 35 || t >= lightOn(x));
      g.visible = treesUp;
      (g.userData.lit as THREE.Group).visible = on;
      // candles flicker a little
      (g.userData.lit as THREE.Group).scale.setScalar(on ? 1 + 0.04 * Math.sin(t * 13 + x) : 1);
    }
    this.crosses.visible = id === 26 || id === 40;
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
