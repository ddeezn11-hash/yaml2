"use client";

import { createContext, useContext } from "react";
import type { StudioEngine } from "@/lib/studio/engine";
import type { NetClient } from "@/lib/studio/net";
import type { PlayController } from "@/lib/studio/playmode";

export interface StudioContextValue {
  engine: StudioEngine | null;
  net: NetClient | null;
  play: PlayController | null;
  playerName: string;
  startPlay: () => void;
  stopPlay: () => void;
  runSeparateTest: () => void;
  testHere: () => void;
  startTestServer: () => void;
  startTestPlayer: () => void;
  stopTestServer: () => void;
}

export const StudioContext = createContext<StudioContextValue>({
  engine: null,
  net: null,
  play: null,
  playerName: "Builder",
  startPlay: () => {},
  stopPlay: () => {},
  runSeparateTest: () => {},
  testHere: () => {},
  startTestServer: () => {},
  startTestPlayer: () => {},
  stopTestServer: () => {},
});

export function useStudioCtx(): StudioContextValue {
  return useContext(StudioContext);
}
