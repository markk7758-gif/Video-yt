// Test sheet of the "Wojtek" cast: every character drawn straight from toon.ts on a flat backdrop.
import React, { useEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Pen, bodyFront, POLE, GULAG, LOCAL_BOY, BRIT_OFFICER, VETERAN, bearDraw, puppyDraw, fxBadge, BearOpts, FrontOpts, Outfit } from "./toon";

type Cell = { draw: (p: Pen) => void };
const F = (o: Outfit, fo: FrontOpts): Cell => ({ draw: (p) => bodyFront(p, o, { seed: 3, ...fo }) });
const B = (o: BearOpts): Cell => ({ draw: (p) => bearDraw(p, o) });
const CELLS: Cell[] = [
  B({ expr: "smile", cap: true, prop: "salute", stripes: true }),
  B({ expr: "grin", prop: "beer", mode: "sit" }),
  B({ expr: "smile_closed", prop: "crate", mode: "walk", phase: 0.2 }),
  B({ expr: "neutral", cub: true, prop: "milk", mode: "sit" }),
  B({ expr: "laugh", prop: "wrestle" }),
  B({ expr: "sad", lookUp: 1 }),
  F(POLE(0), { mode: "stand", expr: "grin", prop: "crate" }),
  F(POLE(1, { hat: "brodie" }), { mode: "stand", expr: "shock", prop: "salute" }),
  F(GULAG(2), { mode: "stand", expr: "sad" }),
  F(LOCAL_BOY, { mode: "stand", expr: "smile", prop: "choc" }),
  F(BRIT_OFFICER, { mode: "stand", expr: "stern", prop: "hand" }),
  F(VETERAN(0), { mode: "stand", expr: "relief_open", prop: "shout" }),
  { draw: (p) => puppyDraw(p, { lick: true }) },
  { draw: (p) => { p.g.save(); p.g.scale(0.9, 0.9); p.g.translate(20, 300); fxBadge(p); p.g.restore(); } },
  F(VETERAN(1), { mode: "stand", expr: "smile", prop: "cheer" }),
];
export const CastSheet: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  const f = useCurrentFrame();
  useEffect(() => {
    const g = ref.current!.getContext("2d")!;
    g.fillStyle = "#cfd9e6"; g.fillRect(0, 0, 1080, 1920);
    CELLS.forEach((c, i) => {
      g.save(); g.translate((i % 3) * 360, Math.floor(i / 3) * 384); g.scale(0.384, 0.384); g.translate(70, 0);
      c.draw(new Pen(g)); g.restore();
    });
  }, [f]);
  return <AbsoluteFill><canvas ref={ref} width={1080} height={1920} /></AbsoluteFill>;
};
