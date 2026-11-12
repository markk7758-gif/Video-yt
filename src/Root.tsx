import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/goose/Bridge";
import { CastSheet } from "./videos/goose/CastSheet";

export const RemotionRoot: React.FC = () => (
  <>
  <Composition id="CastSheet" component={CastSheet} durationInFrames={30} fps={30} width={1080} height={1920} />
  <Composition id="GooseKing" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
