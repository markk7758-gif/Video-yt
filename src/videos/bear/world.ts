// "Wojtek" world as one three.js scene with five places, each its own group (only the shot's place is shown):
// the 1942 desert camp in Iran (tents, crates, flagpole, dry mountains), the dock (pier, troopship, gangplank, wire),
// Monte Cassino (gun plateau, slope to the valley, the monastery on its hill), the dinner room (the puppy analogy)
// and Edinburgh Zoo (the bear pit: stone wall + railing, rocks, pool, park trees). update(id, f, camera) poses
// everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { Batch, boxGeo, V, lam, Kit, Ray, house, prop, setSight, quad } from "./build";
import { ctex, stoneHD, planksHD, cloudHD, rng, grassHD } from "./paint";
import { LIGHTS, LOOK, LightPreset, LightName } from "./lights";
import { TONE, CHAR, untone, twoTone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, camAt, ShotDef, DOCK, CASS, ROOM, ZOO, FLASHES, IRAN, DOCKS, ITALY, HOMELESS, ROOMS, ZOOS, yCass } from "./story";

export const loadKit = () => Promise.resolve({} as Kit); // no external models: every prop is built here

// ---------------- painted textures ----------------
/** soft painted ground: base colour with large low-contrast dabs (no confetti) */
const groundTex = (key: string, base: string, dabs: string[], speck = "rgba(0,0,0,0)") => ctex(key, 1024, 1024, (g, r) => {
  g.fillStyle = base; g.fillRect(0, 0, 1024, 1024);
  g.filter = "blur(18px)";
  for (let i = 0; i < 70; i++) {
    g.fillStyle = dabs[i % dabs.length]; g.globalAlpha = 0.45;
    const rr = 50 + r() * 120; g.beginPath(); g.ellipse(r() * 1024, r() * 1024, rr, rr * (0.7 + 0.3 * r()), r() * 3, 0, 7); g.fill();
  }
  g.filter = "none"; g.globalAlpha = 1;
  g.fillStyle = speck;
  for (let i = 0; i < 260; i++) { g.beginPath(); g.ellipse(r() * 1024, r() * 1024, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, 7); g.fill(); }
});
const sandTex = () => groundTex("sandHD", "#d9b27a", ["#cfa66c", "#e2bf8a", "#c99c62", "#e8c896"], "rgba(150,110,70,0.35)");
const earthTex = () => groundTex("earthHD", "#a08458", ["#94784e", "#ab9064", "#8a7048", "#7f8a4a"], "rgba(90,70,50,0.35)");
const dirtTex = () => groundTex("penHD", "#9a8566", ["#8f7a5c", "#a6916f", "#857154", "#9a8a6a"], "rgba(80,66,52,0.3)");
const canvasTex = () => ctex("tentCanvas", 512, 512, (g, r) => {
  g.fillStyle = "#cdbb8c"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? "rgba(140,120,80,0.16)" : "rgba(255,248,220,0.12)"; g.fillRect(0, i * 57, 512, 28); }
  g.strokeStyle = "rgba(110,90,60,0.55)"; g.lineWidth = 4;
  for (let x = 64; x < 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  for (let i = 0; i < 500; i++) { g.fillStyle = "rgba(120,100,70,0.12)"; g.fillRect(r() * 512, r() * 512, 3, 3); }
});
const hullTex = () => ctex("hullHD", 1024, 256, (g) => {
  g.fillStyle = "#5c6470"; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#a0453a"; g.fillRect(0, 200, 1024, 56); // red boot-topping at the waterline
  g.fillStyle = "#2c3038";
  for (let x = 40; x < 1024; x += 64) { g.beginPath(); g.arc(x, 60, 9, 0, 7); g.fill(); } // portholes
  g.strokeStyle = "rgba(30,34,40,0.5)"; g.lineWidth = 3;
  for (let x = 0; x < 1024; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 200); g.stroke(); }
});
const wallpaperTex = () => ctex("wallpaper", 512, 512, (g) => {
  g.fillStyle = "#e6c98f"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(190,120,80,0.35)";
  for (let y = 0; y < 512; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < 512; x += 64) { g.beginPath(); g.ellipse(x, y, 10, 14, 0, 0, 7); g.fill(); }
});
const clothTex = () => ctex("tablecloth", 256, 256, (g) => {
  g.fillStyle = "#fbf6ea"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(200,70,70,0.45)"; for (let i = 0; i < 256; i += 64) { g.fillRect(i, 0, 22, 256); g.fillRect(0, i, 256, 22); }
});

/** every lens position of the film looking at its subject (trees and houses there are left out) */
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
/** army ridge tent: canvas pyramid on short walls, door flap dark */
const tent = (b: Batch, M: Mats, x: number, z: number, w = 4, d = 4, h = 2.8, yaw = 0) => {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  b.add(boxGeo(V(-w / 2, 0, -d / 2), V(w / 2, 0.9, d / 2), 2), M.canvas, m);
  b.add(new THREE.ConeGeometry(Math.hypot(w, d) / 2, h - 0.9, 4).rotateY(Math.PI / 4).scale(w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414).translate(0, 0.9 + (h - 0.9) / 2, 0), M.canvas, m);
  b.add(boxGeo(V(-0.45, 0, d / 2), V(0.45, 1.4, d / 2 + 0.03)), M.dark, m);
  b.add(new THREE.CylinderGeometry(0.04, 0.04, h + 0.4, 6).translate(0, (h + 0.4) / 2, 0), M.post, m);
};
const crate = (b: Batch, M: Mats, x: number, y: number, z: number, s = 0.6, yaw = 0) =>
  b.add(boxGeo(V(-s * 0.8, 0, -s * 0.5), V(s * 0.8, s * 0.9, s * 0.5)), M.crate, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));

type Mats = Record<string, THREE.Material>;
type Place = "iran" | "dock" | "italy" | "room" | "zoo";
const placeOf = (id: number): Place =>
  IRAN.includes(id) ? "iran" : DOCKS.includes(id) || HOMELESS.includes(id) ? "dock" : ITALY.includes(id) ? "italy" : ROOMS.includes(id) ? "room" : ZOOS.includes(id) ? "zoo" : "iran";

export class World {
  root = new THREE.Group();
  private places: Record<Place, THREE.Group> = { iran: new THREE.Group(), dock: new THREE.Group(), italy: new THREE.Group(), room: new THREE.Group(), zoo: new THREE.Group() };
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunCache = new Map<number, THREE.Vector3>();
  private clouds: THREE.Mesh[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit, shadowSize = 4096) {
    const R = this.root, M: Mats = {};
    for (const g of Object.values(this.places)) R.add(g);
    // ---- sky, light ----
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
    const cm = [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud));
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cm[i % 4], color: new THREE.Color(1.05, 1.05, 1.08), transparent: true, depthWrite: false, fog: false }));
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- materials ----
    M.sand = lam("sandHD", () => ({ map: sandTex() }));
    M.earth = lam("earthHD", () => ({ map: earthTex() }));
    M.pen = lam("penHD", () => ({ map: dirtTex() }));
    M.grass = lam("grassZoo", () => ({ map: grassHD() }));
    M.canvas = lam("tentCanvas", () => ({ map: canvasTex() }));
    M.dark = lam("doorDark", () => ({ color: "#2e2630" }));
    M.post = lam("post", () => ({ color: "#5e4a36" }));
    M.crate = lam("crateWood", () => ({ map: planksHD(), color: new THREE.Color(0.95, 0.78, 0.56) }));
    M.planks = lam("pierPlanks", () => ({ map: planksHD(), color: new THREE.Color(0.86, 0.76, 0.64) }));
    M.water = lam("sea", () => ({ color: "#3d7fae", emissive: new THREE.Color("#0c2a44") }));
    M.hull = lam("hullHD", () => ({ map: hullTex() }));
    M.white = lam("shipWhite", () => ({ color: "#efe9dc" }));
    M.funnel = lam("funnel", () => ({ color: "#c9a24a" }));
    M.iron = twoTone(new THREE.MeshPhongMaterial({ color: "#4a4e46", specular: "#8a8a8a", shininess: 40 }), 0.15);
    M.olive = lam("gunOlive", () => ({ color: "#6a6a44" }));
    M.rock = lam("rock", () => ({ color: "#a89a86" }));
    M.rockDark = lam("rockDark", () => ({ color: "#8a7c6c" }));
    M.mountain = lam("mountain", () => ({ color: "#b98e66" }));
    M.mountain2 = lam("mountain2", () => ({ color: "#a37f66" }));
    M.hill = lam("cassinoHill", () => ({ map: earthTex(), color: new THREE.Color(0.9, 0.95, 0.8) }));
    M.abbey = lam("abbeyHD", () => ({ map: stoneHD("abbeyHD", ["#e8dfcf", "#e0d6c4", "#efe7da", "#d8ccb8"], "#b0a390") }));
    M.bark = lam("deadBark", () => ({ color: "#5e4a3a" }));
    M.stoneWall = lam("zooWallHD", () => ({ map: stoneHD("zooWallHD", ["#a9a297", "#9f978a", "#b4ad9f", "#958d80"], "#6f685e") }));
    M.cap = lam("zooCapHD", () => ({ map: stoneHD("zooCapHD", ["#c9c2b4", "#c0b8aa", "#d2cbbd", "#b8b0a2"], "#8f887c") }));
    M.rail = twoTone(new THREE.MeshPhongMaterial({ color: "#2f3a34", specular: "#6a7a70", shininess: 30 }), 0.15);
    M.pool = lam("zooPool", () => ({ color: "#5e8aa0", emissive: new THREE.Color("#10222e") }));
    M.path = lam("zooPath", () => ({ color: "#b5a68e" }));
    M.floor = lam("roomFloor", () => ({ map: planksHD(), color: new THREE.Color(0.8, 0.62, 0.46) }));
    M.paper = lam("wallpaper", () => ({ map: wallpaperTex() }));
    M.table = lam("roomTable", () => ({ color: "#6e4a30" }));
    M.cloth = lam("tablecloth", () => ({ map: clothTex() }));
    M.plate = lam("plate", () => ({ color: "#fbfaf6" }));
    M.food = lam("roast", () => ({ color: "#b5652e" }));
    M.glass = lam("winGlass", () => ({ color: "#9fb8e0", emissive: new THREE.Color("#3a4a6a") }));
    M.wire = twoTone(new THREE.MeshPhongMaterial({ color: "#3a3a40", specular: "#777777", shininess: 30 }), 0.15);
    M.board = lam("signBoard", () => ({ color: "#7a5a3a" }));

    setSight(sightLines());
    const r = rng(1942);

    // ---- Iran 1942: the desert camp at the origin ----
    {
      const b = new Batch(), P = this.places.iran;
      b.add(flat(-500, 500, -500, 500, 0, 6), M.sand);
      // tent lines behind the parade ground and to the sides
      for (const [x, z, yaw] of [[-12, -10, 0], [-6, -11, 0.05], [0, -12, 0], [6, -11, -0.05], [12, -10, 0], [-16, -18, 0.1], [-8, -19, 0], [0, -20, 0],
        [8, -19, 0], [16, -18, -0.1], [2.5, -6.5, 0.15], [-15, -2, 1.3], [-17, 5, 1.6], [17, 3, -1.5], [18, -4, -1.3]] as const) tent(b, M, x, z, 4, 4.2, 2.9, yaw);
      for (const [x, z] of [[2.0, -4.4], [3.2, -4.6], [2.6, -4.2], [-4.6, -1.6], [-6.8, -1.2], [10.2, -1.8], [-3.6, -5.2], [6.2, -3.8]] as const) crate(b, M, x, 0, z, 0.55, r() * 0.6);
      crate(b, M, 2.6, 0.5, -4.4, 0.5, 0.3); crate(b, M, -6.8, 0.5, -1.2, 0.5, -0.2);
      // a supply truck parked by the tents
      const tx = -9, tz = -5;
      b.add(boxGeo(V(tx - 1.2, 0.5, tz - 3), V(tx + 1.2, 2.6, tz + 0.6)), M.canvas);
      b.add(boxGeo(V(tx - 1.15, 0.5, tz + 0.6), V(tx + 1.15, 2.0, tz + 2.3)), M.olive);
      b.add(boxGeo(V(tx - 1.0, 1.4, tz + 2.3), V(tx + 1.0, 1.9, tz + 2.34)), M.glass);
      for (const [dx, dz] of [[-1.15, -2.2], [1.15, -2.2], [-1.15, 1.6], [1.15, 1.6]]) b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 14).rotateZ(Math.PI / 2).translate(tx + dx, 0.45, tz + dz), M.dark);
      // flagpole (the flag itself is a waving cast card)
      b.add(new THREE.CylinderGeometry(0.05, 0.07, 4.6, 8).translate(4.2, 2.3, -3.2), M.post);
      // dry mountains all round (Zagros foothills)
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + r() * 0.2, d = 170 + r() * 160, h = 40 + r() * 70, rad = 60 + r() * 60;
        b.add(new THREE.ConeGeometry(rad, h, 7 + (i % 3)).translate(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d - 40), i % 2 ? M.mountain : M.mountain2);
      }
      // sparse olive scrub
      for (let i = 0; i < 70; i++) { const a = r() * Math.PI * 2, d = 10 + r() * 90; prop(b, {}, "plant_bush", Math.cos(a) * d, 0, Math.sin(a) * d - 6, 0.6 + r() * 0.7, r() * 6); }
      for (let i = 0; i < 6; i++) { const a = r() * Math.PI * 2, d = 26 + r() * 40; prop(b, {}, "tree_fat", Math.cos(a) * d, 0, Math.sin(a) * d - 10, 4 + r() * 2, r() * 6); }
      b.build(P);
    }

    // ---- the dock: pier, troopship, gangplank, a clerk's desk, wire + flagpole ----
    {
      const b = new Batch(), P = this.places.dock, X = DOCK[0];
      b.add(flat(X - 300, X + 300, -6, 300, 0, 3), M.planks);
      b.add(boxGeo(V(X - 300, -1.4, -6.2), V(X + 300, 0, -5.9)), M.planks);
      b.add(flat(X - 900, X + 900, -900, -6, -1.2, 8), M.water);
      // the ship: hull, deck, superstructure, funnel, masts
      b.add(boxGeo(V(X - 34, -1.2, -19), V(X + 30, 2.2, -8.3)), M.hull);
      b.add(new THREE.CylinderGeometry(5.35, 5.35, 3.4, 16, 1, false, 0, Math.PI).rotateY(-Math.PI / 2).scale(1.4, 1, 1).translate(X + 30, 0.5, -13.65), M.hull);
      b.add(boxGeo(V(X - 14, 2.2, -16.5), V(X + 10, 5.6, -10.5)), M.white);
      b.add(boxGeo(V(X - 8, 5.6, -15.5), V(X + 4, 7.6, -11.5)), M.white);
      for (let i = 0; i < 9; i++) b.add(boxGeo(V(X - 12.5 + i * 2.6, 3.4, -10.48), V(X - 11.5 + i * 2.6, 4.3, -10.45)), M.dark);
      b.add(new THREE.CylinderGeometry(1.3, 1.5, 4.6, 16).translate(X - 2, 9.9, -13.5), M.funnel);
      b.add(new THREE.CylinderGeometry(1.32, 1.32, 0.9, 16).translate(X - 2, 11.8, -13.5), M.dark);
      for (const mx of [X - 26, X + 22]) b.add(new THREE.CylinderGeometry(0.15, 0.2, 12, 8).translate(mx, 8, -13.6), M.post);
      // gangplank with rails (pier at z = -4.2 up to the deck at z = -8.2)
      const g0 = V(X - 0.5, 0.05, -4.2), len = Math.hypot(4.0, 2.1), ang = Math.atan2(2.1, 4.0);
      const gm = new THREE.Matrix4().makeRotationX(ang).setPosition(X + 0.2, 0.05, -4.2);
      void g0;
      b.add(boxGeo(V(-0.7, -0.08, -len), V(0.7, 0.04, 0)), M.planks, gm);
      for (const sd of [-0.7, 0.7]) b.add(boxGeo(V(sd - 0.03, 0.04, -len), V(sd + 0.03, 0.9, 0)), M.post, gm);
      // bollards, crates, the clerk's desk
      for (let i = 0; i < 8; i++) b.add(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10).translate(X - 30 + i * 9, 0.3, -5.4), M.iron);
      for (const [x, z] of [[X + 3.5, -2.6], [X + 4.3, -3.4], [X - 4, -3.0], [X - 3.2, -2.2], [X + 12, -1.0]] as const) crate(b, M, x, 0, z, 0.6, r() * 0.5);
      b.add(boxGeo(V(X + 5.2, 0.72, -2.25), V(X + 6.8, 0.8, -1.35)), M.table);
      for (const [dx, dz] of [[5.3, -2.15], [6.7, -2.15], [5.3, -1.45], [6.7, -1.45]]) b.add(boxGeo(V(X + dx - 0.04, 0, dz - 0.04), V(X + dx + 0.04, 0.72, dz + 0.04)), M.table);
      // warehouses along the quay behind the camera side
      for (let i = 0; i < 6; i++) house(b, X - 40 + i * 16, 22 + (i % 2) * 3, Math.PI, 12, 8, 7, i + 2, 0);
      // barbed wire on posts + flagpole (shot 33)
      for (let i = 0; i < 7; i++) b.add(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 6).translate(X - 13 + i * 1.1, 0.65, -2.9), M.post);
      for (const y of [0.45, 0.8, 1.15]) b.add(new THREE.CylinderGeometry(0.012, 0.012, 6.6, 4).rotateZ(Math.PI / 2).translate(X - 9.7, y, -2.9), M.wire);
      for (let i = 0; i < 40; i++) b.add(new THREE.TorusGeometry(0.11, 0.008, 4, 8).rotateY(0.6).translate(X - 13 + i * 0.165, 0.8 + 0.35 * Math.sin(i), -2.9), M.wire);
      b.add(new THREE.CylinderGeometry(0.05, 0.07, 4.6, 8).translate(X - 10.8, 2.3, -4.6), M.post);
      b.build(P);
    }

    // ---- Monte Cassino 1944: gun plateau, the slope, the valley, the monastery hill ----
    {
      const b = new Batch(), P = this.places.italy, K = CASS[0];
      b.add(flat(K - 300, K + 300, -400, 0, 0, 5), M.earth);
      b.add(quad(V(K - 300, 0, 0), V(K - 300, -6.72, 24), V(K + 300, -6.72, 24), V(K + 300, 0, 0), 120, 5), M.earth);
      b.add(flat(K - 600, K + 600, 24, 900, -6.72, 8), M.earth);
      // the monastery on its hill, far across the valley
      b.add(new THREE.ConeGeometry(150, 118, 12).translate(K + 10, -6.72 + 59, 320), M.hill);
      b.add(new THREE.ConeGeometry(110, 70, 10).translate(K - 150, -6.72 + 35, 380), M.mountain2);
      b.add(new THREE.ConeGeometry(130, 90, 10).translate(K + 190, -6.72 + 45, 400), M.mountain2);
      const ay = -6.72 + 112;
      b.add(boxGeo(V(K - 22, ay - 6, 300), V(K + 42, ay + 9, 330)), M.abbey);
      b.add(boxGeo(V(K - 6, ay + 9, 306), V(K + 22, ay + 16, 324)), M.abbey);
      for (let i = 0; i < 8; i++) b.add(boxGeo(V(K - 18 + i * 7.5, ay + 1, 299.6), V(K - 15 + i * 7.5, ay + 5.5, 300.2)), M.dark);
      // the gun on the plateau, barrel pointing out over the valley
      const gx = K + 3, gz = -3;
      b.add(new THREE.CylinderGeometry(0.13, 0.18, 3.6, 12).rotateX(Math.PI / 2 - 0.38).translate(gx, 1.75, gz + 1.5), M.olive);
      b.add(boxGeo(V(gx - 0.9, 0.7, gz - 0.2), V(gx + 0.9, 1.9, gz + 0.0)), M.olive);
      for (const sd of [-1, 1]) b.add(new THREE.TorusGeometry(0.62, 0.1, 8, 20).rotateY(Math.PI / 2).translate(gx + sd * 0.95, 0.62, gz + 0.3), M.dark);
      for (const sd of [-1, 1]) b.add(boxGeo(V(gx + sd * 0.3 - 0.08, 0.1, gz - 3.2), V(gx + sd * 0.3 + 0.08, 0.3, gz + 0.2)), M.olive);
      // sandbag ring, crate stacks, shattered trees, rocks
      for (let i = 0; i < 14; i++) { const a = -0.2 + (i / 13) * (Math.PI + 0.4), rr = 3.2; b.add(boxGeo(V(-0.4, 0, -0.22), V(0.4, 0.45, 0.22)), M.canvas, new THREE.Matrix4().makeRotationY(-a).setPosition(gx + Math.cos(a) * rr, 0, gz - 0.6 - Math.sin(a) * rr * 0.6)); }
      for (const [x, z, y] of [[K - 2.5, -2.4, 0], [K - 1.6, -2.6, 0], [K - 2.1, -2.5, 0.54], [K - 3.6, -3.4, 0], [K + 7, -5, 0], [K + 7.8, -4.6, 0]] as const) crate(b, M, x, y, z, 0.6, r() * 0.4);
      for (const [x, z] of [[K - 8.6, -10.4], [K - 7.4, -10.6], [K - 9.2, -9.4], [K - 6.8, -9.6]] as const) crate(b, M, x, 0, z, 0.5, r());
      for (let i = 0; i < 24; i++) {
        const x = K - 60 + r() * 120, z = -40 + r() * 34; if (Math.abs(x - K) < 14 && z > -18) continue;
        const h = 2 + r() * 4; b.add(new THREE.CylinderGeometry(0.1, 0.18, h, 6).translate(0, h / 2, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ((r() - 0.5) * 0.4)).translate(x, 0, z), M.bark);
      }
      for (let i = 0; i < 60; i++) {
        const x = K - 40 + r() * 80, z = -2 + r() * 26; if (Math.abs(x - K + 0.5) < 2.6 && z < 12) continue;
        const s = 0.25 + r() * 0.9; b.add(new THREE.DodecahedronGeometry(s, 0).scale(1, 0.6, 1).translate(x, yCass(z) + s * 0.3, z), i % 3 ? M.rock : M.rockDark);
      }
      for (let i = 0; i < 60; i++) { const x = K - 200 + r() * 400, z = 40 + r() * 220; prop(b, {}, i % 3 ? "tree_fat" : "tree_oak", x, -6.72, z, 5 + r() * 4, r() * 6); }
      // the badge signboard (shot 28) and the stripes spot (shot 29)
      b.add(boxGeo(V(K - 12.9, 0, -12.1), V(K - 12.8, 2.6, -12.0)), M.post);
      b.add(boxGeo(V(K - 11.2, 0, -12.1), V(K - 11.1, 2.6, -12.0)), M.post);
      b.add(boxGeo(V(K - 12.85, 0.95, -12.12), V(K - 11.15, 2.55, -12.02)), M.board);
      tent(b, M, K - 6, -19, 4.4, 4.4, 3.0); tent(b, M, K + 1, -20, 4.4, 4.4, 3.0); tent(b, M, K + 8, -19, 4.4, 4.4, 3.0);
      b.build(P);
    }

    // ---- the dinner room (analogy) ----
    {
      const b = new Batch(), P = this.places.room, X = ROOM[0];
      b.add(flat(X - 7, X + 7, -6, 8, 0, 3), M.floor);
      for (const [x0, z0, x1, z1] of [[X - 7, 8, X - 7, -6], [X + 7, -6, X + 7, 8], [X - 7, -6, X + 7, -6], [X + 7, 8, X - 7, 8]] as const) b.add(vwall(x0, z0, x1, z1, 0, 5, 2), M.paper);
      b.add(boxGeo(V(X - 1.2, 1.4, -5.98), V(X + 1.2, 3.6, -5.9)), M.glass);
      b.add(boxGeo(V(X - 0.06, 1.4, -5.9), V(X + 0.06, 3.6, -5.85)), M.table); b.add(boxGeo(V(X - 1.2, 2.45, -5.9), V(X + 1.2, 2.55, -5.85)), M.table);
      b.add(boxGeo(V(X - 1.9, 0.72, -3.0), V(X + 1.9, 0.8, -1.6)), M.table);
      b.add(boxGeo(V(X - 1.92, 0.8, -3.02), V(X + 1.92, 0.82, -1.58)), M.cloth);
      for (const [x, z] of [[-1.8, -2.9], [1.8, -2.9], [-1.8, -1.7], [1.8, -1.7]]) b.add(boxGeo(V(X + x - 0.06, 0, z - 0.06), V(X + x + 0.06, 0.72, z + 0.06)), M.table);
      for (const [x, z] of [[-1.1, -2.0], [0.2, -1.95], [1.2, -2.0], [-0.4, -2.6], [0.9, -2.6]] as const) b.add(new THREE.CylinderGeometry(0.17, 0.15, 0.03, 18).translate(X + x, 0.84, z), M.plate);
      b.add(new THREE.SphereGeometry(0.22, 14, 10).scale(1.3, 0.7, 1).translate(X + 0.2, 0.93, -2.45), M.food);
      for (const dx of [-1.2, 1.2]) b.add(boxGeo(V(X + dx - 0.25, 0, -3.6), V(X + dx + 0.25, 1.3, -3.5)), M.table);
      b.add(boxGeo(V(X + 1.95, 0.42, -2.6), V(X + 2.5, 0.48, -2.0)), M.table); // the puppy's chair at the table end
      b.add(boxGeo(V(X + 2.43, 0.48, -2.6), V(X + 2.5, 1.2, -2.0)), M.table);
      for (const [dx, dz] of [[1.98, -2.57], [2.47, -2.57], [1.98, -2.03], [2.47, -2.03]]) b.add(boxGeo(V(X + dx - 0.03, 0, dz - 0.03), V(X + dx + 0.03, 0.42, dz + 0.03)), M.table);
      b.build(P, false);
    }

    // ---- Edinburgh Zoo: the bear pit ----
    {
      const b = new Batch(), P = this.places.zoo, Z = ZOO[0];
      b.add(flat(Z - 300, Z + 300, -0.9, 300, 0, 4), M.grass);
      b.add(flat(Z - 300, Z + 300, -400, -0.9, 0, 4), M.pen);
      b.add(flat(Z - 14, Z + 14, 0.2, 2.6, 0.01, 2), M.path);
      b.add(boxGeo(V(Z - 14, 0, -1.3), V(Z + 14, 1.1, -0.9), 1.2), M.stoneWall);
      b.add(boxGeo(V(Z - 14.05, 1.1, -1.36), V(Z + 14.05, 1.2, -0.84), 1.2), M.cap);
      for (let i = 0; i <= 46; i++) b.add(new THREE.CylinderGeometry(0.022, 0.022, 0.8, 6).translate(Z - 13.8 + i * 0.6, 1.6, -1.1), M.rail);
      for (const y of [1.55, 1.98]) b.add(boxGeo(V(Z - 14, y - 0.02, -1.13), V(Z + 14, y + 0.02, -1.07)), M.rail);
      // back of the pit: rock wall, boulders, a pool, a climbing log
      for (let i = 0; i < 26; i++) { const s = 1.2 + r() * 1.6; b.add(new THREE.DodecahedronGeometry(s, 0).scale(1, 0.8 + r() * 0.5, 1).translate(Z - 14 + i * 1.1, s * 0.6, -11 - r() * 1.4), i % 2 ? M.rock : M.rockDark); }
      for (const [x, z, s] of [[Z - 4.5, -6.5, 0.9], [Z - 3.6, -7.2, 0.6], [Z + 4.8, -8, 1.1], [Z + 6.2, -5.5, 0.5]] as const) b.add(new THREE.DodecahedronGeometry(s, 0).scale(1, 0.7, 1).translate(x, s * 0.4, z), M.rock);
      b.add(new THREE.CircleGeometry(1.8, 24).rotateX(-Math.PI / 2).translate(Z + 2.8, 0.02, -6.5), M.pool);
      b.add(new THREE.CylinderGeometry(0.2, 0.24, 4.6, 8).rotateZ(1.1).translate(Z - 6.5, 1.2, -8), M.bark);
      // the park round about: trees, a path, stone houses beyond
      for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = 14 + r() * 50; prop(b, {}, r() < 0.6 ? "tree_oak" : "tree_fat", Z + Math.cos(a) * d, 0, Math.sin(a) * d, 6 + r() * 4, r() * 6); }
      for (let i = 0; i < 5; i++) house(b, Z - 30 + i * 15, 30 + (i % 2) * 4, Math.PI, 11, 8, 8, 7, 0);
      b.build(P);
    }
    for (const g of Object.values(this.places)) g.traverse((o) => (o.receiveShadow = true));
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
    const place = placeOf(id);
    // gun flashes light the Cassino plateau
    const flash = place === "italy" ? FLASHES.reduce((a, t0) => a + Math.max(0, 1 - Math.abs(t - t0 - 0.05) / 0.12), 0) : 0;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI * (1 + 0.8 * flash);
    const Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 120);
    this.sun.position.copy(focus).addScaledVector(sunDir, 260); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 560; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit).multiplyScalar(1 + 0.5 * flash); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
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
    this.clouds.forEach((m, i) => {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60, w = 130 + (i % 4) * 30;
      m.position.set(cam.position.x + Math.cos(a) * d, 110 + (i % 4) * 38, cam.position.z + Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.visible = light !== "hall"; m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).color.setScalar(light === "winter" ? 0.92 : 1.05);
    });
    // ---- places ----
    for (const [k, g] of Object.entries(this.places)) g.visible = k === place;
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
