// Test sheet of the cast (style check 1): every character drawn straight from toon.ts on a flat backdrop.
import React, { useEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Pen, bodyFront, bodySide, TOMMY, FRITZ, BRIT_GENERAL, GER_GENERAL, POPE, FrontOpts, Outfit } from "./toon";

type Cell = { draw: (p: Pen) => void };
const F = (o: Outfit, fo: FrontOpts): Cell => ({ draw: (p) => bodyFront(p, o, { seed: 3, ...fo }) });
const CELLS: Cell[] = [
  F(TOMMY(0), { mode: "stand", expr: "neutral" }),
  F(TOMMY(1), { mode: "stand", expr: "nervous", prop: "mug" }),
  { draw: (p) => bodySide(p, TOMMY(2), { mode: "march", phase: 0.3, expr: "smile" }) },
  F(FRITZ(0), { mode: "stand", expr: "whistle", wave: 0.6 }),
  F(FRITZ(2), { mode: "stand", expr: "smile", prop: "cig", facing: 1 }),
  { draw: (p) => bodySide(p, FRITZ(1), { mode: "stand", expr: "stern" }) },
  F(TOMMY(3), { mode: "stand", expr: "grin", prop: "choc", facing: -1 }),
  F(FRITZ(1), { mode: "stand", expr: "relief", prop: "hand", facing: 1 }),
  F(TOMMY(0), { mode: "stand", expr: "pained", prop: "photo" }),
  F(BRIT_GENERAL, { mode: "stand", expr: "stern", prop: "fist" }),
  F(GER_GENERAL, { mode: "stand", expr: "stern", prop: ["stamp", 1] }),
  F(POPE, { mode: "stand", expr: "nervous", prop: "pray" }),
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
