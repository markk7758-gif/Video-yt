// "The Bridge That Fell for a Song": our original 67 s short in the flat-characters-in-a-3D-toon-world style.
// One three.js world (world.ts) posed per frame from the story timeline (story.ts). Post chain (look-match pass):
//   InkPass (world ink lines, own pass) -> lens blur pre + main (thin-lens DOF per shot from dofAt) ->
//   [bloom (emissive only) + NEUTRAL tone mapping + colour grade] (one merged EffectPass), MSAA 4.
// Ink runs before the DOF so lines blur with what they belong to; bloom after the DOF so glows defocus with their
// source; the grade is display-referred, so it comes after tone mapping. Every pixel-sized parameter is specified at
// 1080x1920 and scaled with the output size, so stills at --scale 0.5 and the 1440x2560 final match.
// Place changes crossfade by stacking a second canvas for the fade frames; the hook ends on a 4-frame white flash.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World, loadKit } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur, GrainEffect } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { Kit } from "./build";
import { TOTAL, FLASH_AT, SHOTS, layersAt, dofAt } from "./story";

export const BRIDGE_FRAMES = TOTAL;

/** A/B switches for test stills only (Remotion inputProps `{ post: { ink: false, ... } }`); everything is on by default. */
type PostToggles = { ink: boolean; lens: boolean; pre: boolean; bloom: boolean; grade: boolean; grain: boolean; msaa: number; shadow: number };
const toggles = (): PostToggles => ({ ink: true, lens: true, pre: true, bloom: true, grade: true, grain: false, msaa: 4, shadow: 4096, ...((getInputProps() as { post?: Partial<PostToggles> }).post ?? {}) });

/** Bloom for emissive sources only (depth.md 6.4). Its MIP chain always starts at 540x960 (half of 1080x1920),
 *  whatever the output size, so the glow keeps the same size relative to the frame (e-fold ~30 px at 1080p,
 *  ~1.5 % of the frame height) at 540, 1080 and 1440 widths. ADD blend: HDR-safe (SCREEN darkens values > 1). */
const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass;
  const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const useKit = () => {
  const [kit, setKit] = useState<Kit | null>(null);
  const [handle] = useState(() => delayRender("bridge kit"));
  useEffect(() => { loadKit().then((k) => { setKit(k); continueRender(handle); }); }, [handle]);
  return kit;
};

const Inner: React.FC<{ id: number; kit: Kit; out: React.RefObject<HTMLCanvasElement> }> = ({ id, kit, out }) => {
  const f = useCurrentFrame();
  const { camera, scene, gl, advance } = useThree();
  useMemo(() => { // profiling: time every renderer.render (with a GPU finish) when inputProps post.prof is set
    if (!(getInputProps() as { post?: { prof?: boolean } }).post?.prof) return;
    const r0 = gl.render.bind(gl);
    gl.render = (sc: THREE.Object3D, c: THREE.Camera) => { const t0 = performance.now(); r0(sc, c); { const cx = gl.getContext(); cx.readPixels(0, 0, 1, 1, cx.RGBA, cx.UNSIGNED_BYTE, new Uint8Array(4)); } console.error(`[prof] render ${sc.type} ${(performance.now() - t0).toFixed(0)}ms rt=${gl.getRenderTarget()?.width ?? "screen"}`); };
  }, [gl]);
  const world = useMemo(() => new World(kit, toggles().shadow), [kit]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const on = useMemo(toggles, []);
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES.day, GRADE_STRENGTH.day),
    grain: new GrainEffect({ amount: 0.025, cellPx: 1.5 }), // film grain, OFF by default (inputProps post.grain): the reference measures no grain and it quadruples the file size
  }), [camera, scene]);
  useEffect(() => () => fx.ink.dispose(), [fx]);
  // After the composer has drawn (priority 1), copy the WebGL frame into a plain 2D canvas: with software GL the page
  // screenshot of a WebGL canvas costs ~15 s a frame, a 2D canvas is captured in milliseconds.
  useFrame(() => {
    const c = out.current, src = gl.domElement;
    if (!c) return;
    if (c.width !== src.width || c.height !== src.height) { c.width = src.width; c.height = src.height; }
    c.getContext("2d")!.drawImage(src, 0, 0);
    if ((getInputProps() as { post?: { prof?: boolean } }).post?.prof) { const px = c.getContext("2d")!.getImageData(c.width / 2, c.height / 2, 1, 1).data; console.error(`[prof] ${Date.now() % 100000} copied ${c.width}x${c.height} px ${px.join(",")}`); }
  }, 2);
  const post = useMemo(() => (
    <EffectComposer multisampling={on.msaa}>
      {on.ink ? <primitive object={fx.ink} dispose={null} /> : null}
      {on.lens && on.pre ? <primitive object={fx.lens.pre} dispose={null} /> : null}
      {on.lens ? <primitive object={fx.lens.main} dispose={null} /> : null}
      {on.bloom ? <primitive object={fx.bloom} dispose={null} /> : null}
      <primitive object={fx.tone} dispose={null} />
      {on.grade ? <primitive object={fx.grade} dispose={null} /> : null}
      {on.grain ? <primitive object={fx.grain} dispose={null} /> : null}
    </EffectComposer>
  ), [fx, on]);
  // frameloop "never": exactly one render per video frame (the default "always" loop kept re-rendering the scene
  // every ~2 s in software GL and starved the frame capture)
  useLayoutEffect(() => { if ((getInputProps() as { post?: { prof?: boolean } }).post?.prof) console.error(`[prof] advance ${f}`); advance(f * (1000 / 30)); }, [f, advance]);
  const cam = camera as THREE.PerspectiveCamera;
  const tu = performance.now();
  target.copy(world.update(id, f, cam, scene));
  if ((getInputProps() as { post?: { prof?: boolean } }).post?.prof) console.error(`[prof] ${Date.now() % 100000} update ${(performance.now() - tu).toFixed(0)}ms`);
  noInkFallback(world.root);
  // thin-lens focus: distance along the view axis to the shot's focus point (default: the camera's look target)
  const d = dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  gradeFor(fx.grade, SHOTS[id - 1].light);
  fx.grain.seed = f; // deterministic per frame
  return (
    <>
      <primitive object={world.root} dispose={null} />
      {post}
    </>
  );
};

/** test stills only: inputProps `{ post: { dpr: 0.5 } }` forces the WebGL buffer size (R3F clamps dpr to >= 1 by default) */
const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
const ShotView: React.FC<{ id: number; kit: Kit; alpha: number }> = ({ id, kit, alpha }) => {
  const out = useRef<HTMLCanvasElement>(null);
  return (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas frameloop="never" style={{ visibility: "hidden" }} width={1080} height={1920} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows={((getInputProps() as { post?: { smap?: string } }).post?.smap ?? "soft") as "soft" | "basic" | "percentage"} gl={{ antialias: false, stencil: false, preserveDrawingBuffer: true, alpha: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      camera={{ fov: 40, near: 0.2, far: 1500 }}>
      <Inner id={id} kit={kit} out={out} />
    </ThreeCanvas>
    <canvas ref={out} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }} />
  </AbsoluteFill>
  );
};

export const BridgeShort: React.FC = () => {
  const f = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const flash = f >= FLASH_AT && f < FLASH_AT + 4 ? [1, 0.75, 0.45, 0.2][f - FLASH_AT] : 0;
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      {layersAt(f).map((l, i) => <ShotView key={i ? "over" : "base"} id={l.id} kit={kit} alpha={l.alpha} />)}
      {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
    </AbsoluteFill>
  );
};
