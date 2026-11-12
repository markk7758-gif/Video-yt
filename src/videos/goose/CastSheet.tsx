// Test sheet of the cast (style check 1): every character drawn straight from toon.ts on a flat backdrop.
import React, { useEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Pen, bodyFront, bodySide, gooseDraw, eelDraw, EDWIN, EDWIN_THIN, CHEF, GUARD, GUEST, FrontOpts, Outfit } from "./toon";

type Cell = { draw: (p: Pen) => void };
const F = (o: Outfit, fo: FrontOpts): Cell => ({ draw: (p) => bodyFront(p, o, { seed: 3, ...fo }) });
const CELLS: Cell[] = [
  F(EDWIN, { mode: "stand", expr: "grin" }),
  F(EDWIN, { mode: "stand", expr: "stern", facing: 1 }),
  F(EDWIN_THIN, { mode: "stand", expr: "nervous", prop: "crown" }),
  { draw: (p) => bodySide(p, EDWIN, { mode: "march", phase: 0.2, expr: "shock" }) },
  F(CHEF, { mode: "stand", expr: "smile", prop: "rod", facing: 1 }),
  F(GUARD, { mode: "stand", expr: "neutral" }),
  { draw: (p) => bodySide(p, GUARD, { mode: "march", phase: 0.6, expr: "stern" }) },
  F(GUEST(1), { mode: "stand", expr: "laugh", wave: 0.5 }),
  { draw: (p) => gooseDraw(p, { mode: "stand" }) },
  { draw: (p) => gooseDraw(p, { mode: "walk", phase: 0.3, honk: 1 }) },
  { draw: (p) => gooseDraw(p, { mode: "sit", crown: true }) },
  { draw: (p) => eelDraw(p, { t: 0.3, expr: "grin" }) },
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
