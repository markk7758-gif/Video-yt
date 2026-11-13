// Test sheet of the cast (style check 1): every character drawn straight from toon.ts on a flat backdrop.
import React, { useEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Pen, bodyFront, bodySide, DOUGHBOY, MAJOR, FRENCH_GENERAL, SCIENTIST, HISTORIAN, HANDLER, FRITZ, pigeonDraw, FrontOpts, Outfit } from "./toon";

type Cell = { draw: (p: Pen) => void };
const F = (o: Outfit, fo: FrontOpts): Cell => ({ draw: (p) => bodyFront(p, o, { seed: 3, ...fo }) });
const CELLS: Cell[] = [
  F(DOUGHBOY(0), { mode: "stand", expr: "nervous" }),
  F(DOUGHBOY(3), { mode: "stand", expr: "shock" }),
  F(MAJOR, { mode: "stand", expr: "stern", prop: "hand" }),
  F(FRENCH_GENERAL, { mode: "stand", expr: "smile", facing: 1 }),
  F(SCIENTIST, { mode: "stand", expr: "grin" }),
  F(HISTORIAN(0), { mode: "stand", expr: "stern", prop: "fist" }),
  { draw: (p) => pigeonDraw(p, { mode: "stand", expr: "proud" }) },
  { draw: (p) => pigeonDraw(p, { mode: "fly", phase: 0.25, canister: true }) },
  { draw: (p) => pigeonDraw(p, { mode: "fly", phase: 0.75, leg: 1 }) },
  { draw: (p) => pigeonDraw(p, { mode: "stand", eyeX: true, leg: 1, bandage: true, expr: "pained" }) },
  { draw: (p) => pigeonDraw(p, { mode: "stand", leg: 2, medal: true, expr: "smug" }) },
  { draw: (p) => pigeonDraw(p, { mode: "stand", bow: true, expr: "neutral" }) },
  F(HANDLER, { mode: "stand", expr: "shock" }),
];
export const CastSheet: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  const f = useCurrentFrame();
  useEffect(() => {
    const g = ref.current!.getContext("2d")!;
    g.fillStyle = "#cfd9e6"; g.fillRect(0, 0, 1080, 1920);
    CELLS.forEach((c, i) => {
      g.save(); g.translate((i % 3) * 360, Math.floor(i / 3) * 480); g.scale(0.48, 0.48);
      c.draw(new Pen(g)); g.restore();
    });
  }, [f]);
  return <AbsoluteFill><canvas ref={ref} width={1080} height={1920} /></AbsoluteFill>;
};
