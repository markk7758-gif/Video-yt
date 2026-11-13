import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/goose/Bridge";
import { CastSheet } from "./videos/pigeon/CastSheet";
import { CastSheet as BearCast } from "./videos/bear/CastSheet";
import { BridgeShort as WojtekShort, BRIDGE_FRAMES as WOJTEK_FRAMES } from "./videos/bear/Bridge";
import { BridgeShort as PigeonShort, BRIDGE_FRAMES as PIGEON_FRAMES } from "./videos/pigeon/Bridge";
import { BridgeShort as TruceShort, BRIDGE_FRAMES as TRUCE_FRAMES } from "./videos/truce/Bridge";

export const RemotionRoot: React.FC = () => (
  <>
  <Composition id="CastSheet" component={CastSheet} durationInFrames={30} fps={30} width={1080} height={1920} />
  <Composition id="WojtekCast" component={BearCast} durationInFrames={30} fps={30} width={1080} height={1920} />
  <Composition id="Wojtek" component={WojtekShort} durationInFrames={WOJTEK_FRAMES} fps={30} width={1080} height={1920} />
  <Composition id="CherAmi" component={PigeonShort} durationInFrames={PIGEON_FRAMES} fps={30} width={1080} height={1920} />
  <Composition id="ChristmasTruce" component={TruceShort} durationInFrames={TRUCE_FRAMES} fps={30} width={1080} height={1920} />
  <Composition id="GooseKing" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
